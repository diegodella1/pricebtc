import Fastify from "fastify";
import { expect, it, vi } from "vitest";
import { database } from "../../src/server/sats-bid/db.js";
import { bidConfig } from "../../src/server/sats-bid/config.js";
import { BidService } from "../../src/server/sats-bid/service.js";
import { MockPaymentProvider } from "../../src/server/sats-bid/provider.js";
import { registerBidRoutes } from "../../src/server/sats-bid/routes.js";

it("contains an idle PostgreSQL disconnect instead of crashing the market process", async () => {
  const pool = database("postgresql://localhost/unused");
  const output = vi.spyOn(process.stderr, "write").mockReturnValue(true);
  try {
    expect(() =>
      pool.emit("error", new Error("connection terminated")),
    ).not.toThrow();
    expect(output).toHaveBeenCalled();
  } finally {
    await pool.end();
    output.mockRestore();
  }
});

it("limits public readers without database writes and renews the minute window", async () => {
  const pool = database("postgresql://localhost/unused");
  const config = bidConfig({
    APP_ENV: "test",
    MOCK_WEBHOOK_SECRET: "test-only",
  });
  const service = new BidService(
    pool,
    config,
    new MockPaymentProvider(pool, "test-only"),
  );
  vi.spyOn(service, "current").mockResolvedValue({
    id: "round",
    date: "2031-01-01",
    starts_at: new Date("2031-01-01"),
    ends_at: new Date("2031-01-02"),
    status: "open",
    credit_sequence: "0",
    version: "0",
    current_leader_id: null,
    result_revision: 0,
  });
  vi.spyOn(service, "bidsOpen").mockResolvedValue(false);
  const query = vi.spyOn(pool, "query");
  const clock = vi.spyOn(Date, "now").mockReturnValue(600000);
  const app = Fastify();
  try {
    await app.register(async (instance) =>
      registerBidRoutes(instance, service),
    );
    for (let i = 0; i < 240; i++)
      expect((await app.inject("/api/sats-bid/round/current")).statusCode).toBe(
        200,
      );
    const limited = await app.inject("/api/sats-bid/round/current");
    expect(limited.statusCode).toBe(429);
    expect(limited.headers["retry-after"]).toBe("60");
    clock.mockReturnValue(660000);
    expect((await app.inject("/api/sats-bid/round/current")).statusCode).toBe(
      200,
    );
    expect(query).not.toHaveBeenCalled();
  } finally {
    await app.close();
    await pool.end();
    vi.restoreAllMocks();
  }
});
