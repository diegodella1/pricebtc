import { randomBytes, randomUUID } from "node:crypto";
import { createBidRuntime } from "../src/server/sats-bid/runtime.js";
import { hash } from "../src/server/sats-bid/service.js";
import { MockPaymentProvider } from "../src/server/sats-bid/provider.js";
const service = createBidRuntime();
if (
  !service ||
  service.config.APP_ENV === "production" ||
  service.config.PAYMENT_PROVIDER !== "mock"
)
  throw new Error("Seed requires an isolated development mock database");
const actualNow = new Date();
const names = [
  "Block Atlas",
  "Orange Notes",
  "Satoshi Radio",
  "Proof of Work",
  "Open Ledger",
  "Twenty One",
  "Node Garden",
  "Daylight",
];
try {
  for (const offset of [2, 1, 0]) {
    const time = offset
      ? new Date(
          new Date(actualNow.toISOString().slice(0, 10)).getTime() -
            offset * 86400000 +
            43200000,
        )
      : actualNow;
    const seedKey = `demo_seed:${time.toISOString().slice(0, 10)}`;
    if (
      (
        await service.pool.query(
          "SELECT 1 FROM operational_settings WHERE key=$1 OR ($2 AND key='demo_seed_v1')",
          [seedKey, offset === 0],
        )
      ).rowCount
    )
      continue;
    service.clock = () => time;
    const provider = new MockPaymentProvider(
      service.pool,
      service.config.MOCK_WEBHOOK_SECRET,
      () => time,
    );
    service.provider = provider;
    for (const [index, name] of names.entries()) {
      const session = randomUUID();
      await service.pool.query(
        "INSERT INTO participant_sessions(id,token_hash,expires_at) VALUES($1,$2,$3)",
        [
          session,
          hash(randomBytes(32)),
          new Date(actualNow.getTime() + 2592000000),
        ],
      );
      const participant = await service.profile(session, {
        name: `${name} · Demo`,
        description:
          "An independent Bitcoin project. Demo entry — no real sats.",
        url: `https://example.com/${index}`,
      });
      const p = await service.createBid(session, randomUUID(), {
        amount_sats: String(1000 + index * 2000),
        rules_version: service.config.RULES_VERSION,
        accepted_rules: true,
        round_id: participant.round_id,
      });
      const event = await provider.simulate(p.provider_invoice_id!, "settle");
      await service.receive(event.raw, event.signature);
      await service.verify(
        p,
        await provider.getInvoice(p.provider_invoice_id!),
      );
    }
    const round = await service.current();
    if (offset)
      await service.pool.query(
        "UPDATE rounds SET status='closed',closed_at=ends_at+interval '5 minutes' WHERE id=$1",
        [round.id],
      );
    await service.pool.query(
      "INSERT INTO operational_settings(key,value) VALUES($1,'true')",
      [seedKey],
    );
  }
  process.stdout.write(
    "Demo projects and two historical rounds are ready. No real payments.\n",
  );
} finally {
  await service.pool.end();
}
