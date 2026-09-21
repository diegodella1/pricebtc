import { randomBytes, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import Fastify from "fastify";
import { database, migrate } from "../../src/server/sats-bid/db.js";
import { bidConfig } from "../../src/server/sats-bid/config.js";
import { BidService, hash } from "../../src/server/sats-bid/service.js";
import { MockPaymentProvider } from "../../src/server/sats-bid/provider.js";
import { registerBidRoutes } from "../../src/server/sats-bid/routes.js";
import { workerTick } from "../../src/server/sats-bid/worker.js";
import { exportEvents } from "../../src/server/sats-bid/analytics-export.js";

const url = process.env.SATS_TEST_DATABASE_URL;
describe.skipIf(!url)("PostgreSQL payment pipeline", () => {
  const schema = `sats_test_${randomUUID().replaceAll("-", "")}`;
  const testUrl = new URL(url ?? "postgresql://localhost/test");
  testUrl.searchParams.set("options", `-c search_path=${schema}`);
  const pool = database(testUrl.toString());
  let now = new Date("2031-01-01T12:00:00Z");
  const config = bidConfig({
    APP_ENV: "test",
    DATABASE_URL: url,
    SATS_BID_ENABLED: "true",
    BIDS_ENABLED: "true",
    MOCK_PAYMENTS_ENABLED: "true",
    MOCK_WEBHOOK_SECRET: "integration-test-secret",
    PUBLIC_SITE_URL: "http://localhost",
  });
  const provider = new MockPaymentProvider(
    pool,
    config.MOCK_WEBHOOK_SECRET,
    () => now,
  );
  const service = new BidService(pool, config, provider, () => now);
  const app = Fastify();
  beforeAll(async () => {
    await pool.query(`CREATE SCHEMA ${schema}`);
    await migrate(pool);
    await app.register(async (instance) =>
      registerBidRoutes(instance, service),
    );
    await app.ready();
  }, 30000);
  afterAll(async () => {
    await app.close();
    await pool.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    await pool.end();
  });
  async function participant(name: string) {
    const session = randomUUID();
    const token = randomBytes(32).toString("base64url");
    await pool.query(
      "INSERT INTO participant_sessions(id,token_hash,expires_at) VALUES($1,$2,$3)",
      [session, hash(token), new Date("2040-01-01")],
    );
    const profile = await service.profile(session, {
      name,
      description: "A test project",
      url: "https://example.com",
    });
    return { session, token, profile };
  }
  async function bid(session: string, sats = "10000", key = randomUUID()) {
    const round = await service.current();
    return service.createBid(session, key, {
      amount_sats: sats,
      rules_version: "1.0",
      accepted_rules: true,
      round_id: round.id,
    });
  }
  async function settle(id: string) {
    const p = await service.payment(id);
    const event = await provider.simulate(p.provider_invoice_id!, "settle");
    await service.receive(event.raw, event.signature);
    await workerTick(service);
  }
  it("retries analytics delivery with a stable event id without changing the ledger", async () => {
    const round = await service.current();
    await service.event(
      pool,
      "export_test",
      "export-test",
      round.id,
      null,
      null,
      "test",
      null,
    );
    await pool.query(
      "UPDATE domain_events SET export_next_at=$1 WHERE unique_event_key='export-test'",
      [now],
    );
    const before = (
      await pool.query(
        "SELECT count(*)::text AS count FROM payments WHERE credit_status='credited'",
      )
    ).rows[0].count;
    config.ANALYTICS_EXPORT_URL = "https://analytics.example.com/events";
    config.ANALYTICS_EXPORT_TOKEN = "test-only";
    const keys: string[] = [];
    const receiver: typeof fetch = async (_url, init) => {
      keys.push(new Headers(init?.headers).get("Idempotency-Key")!);
      return new Response(null, { status: keys.length === 1 ? 503 : 204 });
    };
    await exportEvents(service, receiver);
    expect(
      (
        await pool.query(
          "SELECT exported_at FROM domain_events WHERE unique_event_key='export-test'",
        )
      ).rows[0].exported_at,
    ).toBeNull();
    now = new Date(now.getTime() + 5000);
    await exportEvents(service, receiver);
    expect(keys).toHaveLength(2);
    expect(keys[0]).toBe(keys[1]);
    expect(
      (
        await pool.query(
          "SELECT exported_at FROM domain_events WHERE unique_event_key='export-test'",
        )
      ).rows[0].exported_at,
    ).not.toBeNull();
    expect(
      (
        await pool.query(
          "SELECT count(*)::text AS count FROM payments WHERE credit_status='credited'",
        )
      ).rows[0].count,
    ).toBe(before);
    config.ANALYTICS_EXPORT_URL = "";
  });
  it("A/B/A accumulates, emits after_outbid once and deduplicates redelivery", async () => {
    now = new Date("2031-01-01T12:00:00Z");
    const a = await participant("Alpha");
    const b = await participant("Beta");
    const first = await bid(a.session);
    await settle(first.id);
    expect((await service.leaderboard()).leader?.id).toBe(a.profile.id);
    const second = await bid(b.session, "12000");
    await settle(second.id);
    expect((await service.leaderboard()).leader?.id).toBe(b.profile.id);
    const third = await bid(a.session, "3000");
    await settle(third.id);
    const p = await service.payment(third.id);
    const snapshot = await provider.getInvoice(p.provider_invoice_id!);
    await Promise.all([
      service.verify(p, snapshot),
      service.verify(p, snapshot, "reconciliation"),
    ]);
    const board = await service.leaderboard();
    expect(board.leader?.id).toBe(a.profile.id);
    expect(board.leader?.total_sats).toBe("13000");
    expect(
      (
        await pool.query(
          "SELECT count(*)::int n FROM domain_events WHERE participant_id=$1 AND type='repeat_bid_after_outbid'",
          [a.profile.id],
        )
      ).rows[0].n,
    ).toBe(1);
    expect(
      (
        await pool.query(
          "SELECT count(*)::int n FROM provider_payment_evidence WHERE payment_id=$1",
          [third.id],
        )
      ).rows[0].n,
    ).toBe(1);
  });
  it("double click returns one invoice; changed payload conflicts", async () => {
    now = new Date("2031-01-02T12:00:00Z");
    const a = await participant("Retry");
    const key = randomUUID();
    const results = await Promise.all([
      bid(a.session, "10000", key),
      bid(a.session, "10000", key),
    ]);
    expect(results[0].id).toBe(results[1].id);
    await expect(bid(a.session, "11000", key)).rejects.toMatchObject({
      code: "IDEMPOTENCY_CONFLICT",
    });
    await expect(bid(a.session, "10000")).rejects.toMatchObject({
      code: "ACTIVE_INVOICE_EXISTS",
    });
  });
  it("serializes simultaneous credits and keeps the first credited tie winner", async () => {
    now = new Date("2031-01-03T12:00:00Z");
    const a = await participant("First");
    const b = await participant("Second");
    const [one, two] = await Promise.all([bid(a.session), bid(b.session)]);
    await provider.simulate(one.provider_invoice_id!, "settle");
    await provider.simulate(two.provider_invoice_id!, "settle");
    await Promise.all([
      service.verify(one, await provider.getInvoice(one.provider_invoice_id!)),
      service.verify(two, await provider.getInvoice(two.provider_invoice_id!)),
    ]);
    const board = await service.leaderboard();
    expect(board.total_sats).toBe("20000");
    expect(board.participant_count).toBe(2);
    const credits = (
      await pool.query(
        "SELECT participant_id FROM payments WHERE round_id=$1 ORDER BY credit_sequence",
        [one.round_id],
      )
    ).rows;
    expect(board.leader?.id).toBe(credits[0].participant_id);
  });
  it("late webhook credits original day; new round starts empty", async () => {
    now = new Date("2031-01-04T23:57:00Z");
    const a = await participant("Boundary");
    const p = await bid(a.session);
    now = new Date("2031-01-04T23:58:00Z");
    const event = await provider.simulate(p.provider_invoice_id!, "settle");
    now = new Date("2031-01-05T00:00:01Z");
    await service.receive(event.raw, event.signature);
    await workerTick(service);
    expect((await service.leaderboard()).total_sats).toBe("0");
    expect((await service.leaderboard("2031-01-04")).leader?.total_sats).toBe(
      "10000",
    );
  });
  it("out-of-time and mismatched evidence never earns credit", async () => {
    now = new Date("2031-01-06T12:00:00Z");
    const a = await participant("Late");
    const p = await bid(a.session);
    now = new Date("2031-01-06T12:11:00Z");
    await provider.simulate(p.provider_invoice_id!, "settle");
    await service.verify(p, await provider.getInvoice(p.provider_invoice_id!));
    expect((await service.payment(p.id)).credit_status).toBe("review");
    expect((await service.leaderboard()).total_sats).toBe("0");
  });
  it.each([
    "manuallyMarked",
    "storeId",
    "network",
    "requestedSats",
    "participantId",
    "paymentMethod",
    "verifiedPaymentIds",
  ])("rejects invalid %s", async (field) => {
    now = new Date(now.getTime() + 86400000);
    const a = await participant("Evidence");
    const p = await bid(a.session);
    await provider.simulate(p.provider_invoice_id!, "settle");
    const snapshot = await provider.getInvoice(p.provider_invoice_id!);
    const altered = {
      ...snapshot,
      [field]:
        field === "manuallyMarked"
          ? true
          : field === "verifiedPaymentIds"
            ? []
            : "invalid",
    };
    await service.verify(p, altered);
    expect((await service.payment(p.id)).credit_status).toBe("review");
  });
  it("recovers a provider creation completed before local association", async () => {
    now = new Date("2031-02-01T12:00:00Z");
    const a = await participant("Unknown");
    const original = provider.createInvoice.bind(provider);
    provider.createInvoice = async (input) => {
      await original(input);
      throw new Error("timeout after creation");
    };
    const p = await bid(a.session);
    provider.createInvoice = original;
    expect(p.creation_status).toBe("creation_unknown");
    await workerTick(service);
    expect((await service.payment(p.id)).creation_status).toBe("ready");
  });
  it("requires Origin/CSRF, session ownership and admin authentication", async () => {
    now = new Date("2031-02-02T12:00:00Z");
    const a = await participant("Owner");
    const b = await participant("Stranger");
    const p = await bid(a.session);
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/api/sats-bid/participants",
          payload: { name: "X", description: "Y", url: "https://example.com" },
        })
      ).statusCode,
    ).toBe(403);
    expect(
      (
        await app.inject({
          url: `/api/sats-bid/payments/${p.id}`,
          headers: { cookie: `pricebtc_participant=${b.token}` },
        })
      ).statusCode,
    ).toBe(404);
    expect(
      (
        await app.inject({
          url: `/api/sats-bid/payments/${p.id}`,
          headers: { cookie: `pricebtc_participant=${a.token}` },
        })
      ).statusCode,
    ).toBe(200);
    expect(
      (await app.inject({ url: "/api/sats-bid/admin/payments" })).statusCode,
    ).toBe(401);
  });
  async function adminHeaders() {
    const token = randomBytes(32).toString("base64url");
    await pool.query(
      "INSERT INTO admin_sessions(id,token_hash,admin_identity,expires_at) VALUES($1,$2,'test-operator',$3)",
      [randomUUID(), hash(token), new Date("2040-01-01")],
    );
    return {
      cookie: `pricebtc_admin=${token}`,
      origin: "http://localhost",
      "x-sats-bid-csrf": "1",
    };
  }
  it("moderation removes historical content and preserves accounting without outbid events", async () => {
    now = new Date("2031-03-01T12:00:00Z");
    const a = await participant("Moderated leader");
    const p = await bid(a.session);
    await settle(p.id);
    now = new Date("2031-03-02T00:06:00Z");
    await workerTick(service);
    const headers = await adminHeaders();
    const response = await app.inject({
      method: "PATCH",
      url: `/api/sats-bid/admin/participants/${a.profile.id}`,
      headers,
      payload: { action: "hide", version: 0, reason: "Test moderation" },
    });
    expect(response.statusCode).toBe(200);
    const historical = await service.leaderboard("2031-03-01");
    expect(historical.leader).toBeNull();
    expect(historical.participants).toHaveLength(0);
    expect(historical.total_sats).toBe("10000");
    expect((await service.payment(p.id)).credit_status).toBe("credited");
    expect(
      (
        await pool.query(
          "SELECT count(*)::int n FROM domain_events WHERE round_id=$1 AND type='participant_outbid'",
          [p.round_id],
        )
      ).rows[0].n,
    ).toBe(0);
    const restored = await app.inject({
      method: "PATCH",
      url: `/api/sats-bid/admin/participants/${a.profile.id}`,
      headers,
      payload: { action: "unhide", version: 1, reason: "Review complete" },
    });
    expect(restored.statusCode).toBe(200);
    expect((await service.leaderboard("2031-03-01")).leader?.id).toBe(
      a.profile.id,
    );
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/api/sats-bid/admin/logout",
          headers,
        })
      ).statusCode,
    ).toBe(200);
    expect(
      (await app.inject({ url: "/api/sats-bid/admin/payments", headers }))
        .statusCode,
    ).toBe(401);
  });
  it("pending participants cannot pay and profiles lock after the first invoice", async () => {
    now = new Date("2031-03-03T12:00:00Z");
    const a = await participant("Pending profile");
    await pool.query(
      "UPDATE participants SET moderation_status='pending' WHERE id=$1",
      [a.profile.id],
    );
    await expect(bid(a.session)).rejects.toMatchObject({
      code: "PARTICIPANT_NOT_APPROVED",
    });
    await pool.query(
      "UPDATE participants SET moderation_status='approved' WHERE id=$1",
      [a.profile.id],
    );
    await bid(a.session);
    await expect(
      service.profile(
        a.session,
        { name: "Changed", description: "Changed", url: "https://example.com" },
        true,
      ),
    ).rejects.toMatchObject({ code: "PROFILE_LOCKED" });
  });
  it("new rounds are unique even when the scheduler is missed", async () => {
    now = new Date("2031-03-04T00:00:00Z");
    const rounds = await Promise.all(
      Array.from({ length: 10 }, () => service.current()),
    );
    expect(new Set(rounds.map((r) => r.id)).size).toBe(1);
    expect((await service.leaderboard()).participant_count).toBe(0);
  });
  it("old expired invoices remain recorded while a new invoice can be created", async () => {
    now = new Date("2031-03-05T12:00:00Z");
    const a = await participant("Expired");
    const p = await bid(a.session);
    now = new Date("2031-03-05T12:11:00Z");
    await workerTick(service);
    expect((await service.payment(p.id)).settlement_status).toBe("expired");
    const next = await bid(a.session);
    expect(next.id).not.toBe(p.id);
    expect((await service.payment(p.id)).amount_sats).toBe("10000");
  });
  it("corrects a closed round when authentic on-time evidence appears later", async () => {
    now = new Date("2031-03-06T23:57:00Z");
    const a = await participant("Correction");
    const p = await bid(a.session);
    now = new Date("2031-03-07T00:06:00Z");
    await workerTick(service);
    expect((await service.leaderboard("2031-03-06")).round.status).toBe(
      "closed",
    );
    const snapshot = {
      ...(await provider.getInvoice(p.provider_invoice_id!)),
      state: "settled" as const,
      receivedSats: "10000",
      receivedAt: "2031-03-06T23:58:00Z",
      verifiedPaymentIds: ["late-evidence-" + p.id],
    };
    await service.verify(p, snapshot, "reconciliation");
    const historical = await service.leaderboard("2031-03-06");
    expect(historical.round.result_revision).toBe(1);
    expect(historical.leader?.id).toBe(a.profile.id);
    expect((await service.leaderboard()).total_sats).toBe("0");
  });
  it("keeps rounds provisional during provider failure", async () => {
    now = new Date("2031-03-08T23:57:00Z");
    const a = await participant("Provider offline");
    await bid(a.session);
    const original = provider.getInvoice.bind(provider);
    provider.getInvoice = async () => {
      throw new Error("offline");
    };
    now = new Date("2031-03-09T00:06:00Z");
    await workerTick(service);
    provider.getInvoice = original;
    expect((await service.leaderboard("2031-03-08")).round.status).toBe(
      "closing",
    );
  });
});
