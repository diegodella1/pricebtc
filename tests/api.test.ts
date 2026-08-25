import { afterEach, describe, expect, it } from "vitest";

import type { FastifyInstance } from "fastify";

import { buildApp } from "../src/server/app.js";
import type { MarketSnapshot } from "../src/shared/contracts.js";

const apps: FastifyInstance[] = [];

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

function getSnapshot(): MarketSnapshot {
  return {
    priceUsd: "100000",
    change24h: 2.5,
    marketTimestamp: "2026-08-24T17:00:00.000Z",
    receivedAt: new Date().toISOString(),
    sequence: 1,
  };
}

function createTestApp(): FastifyInstance {
  const market = {
    getSnapshot: () => getSnapshot(),
    getState: () => "live" as const,
  };
  const fx = {
    supportsCurrency: (currency: string) => ["USD", "EUR", "ARS"].includes(currency),
    convertUsd: (price: string, currency: string) =>
      currency === "EUR" ? String(Number(price) * 0.9) : price,
    getCurrencies: () => [
      { code: "USD", name: "US Dollar", indicative: false },
      { code: "EUR", name: "Euro", indicative: false },
      { code: "ARS", name: "Argentine Peso", indicative: true },
    ],
    getStatus: () => ({ state: "live" as const, updatedAt: "2026-08-24T00:00:00.000Z" }),
  };
  const history = {
    getHistory: async (range: "1h" | "24h" | "7d", convert: (price: string) => string) => ({
      range,
      points: [{ timestamp: "2026-08-24T16:00:00.000Z", price: convert("90000") }],
      cachedAt: "2026-08-24T17:00:00.000Z",
      source: "coinbase" as const,
    }),
  };
  const streams = { open: () => undefined, getClientCount: () => 3 };
  const app = buildApp({ market, fx, history, streams, serveFrontend: false, logger: false });
  apps.push(app);
  return app;
}

describe("public API", () => {
  it("returns converted price snapshots", async () => {
    const response = await createTestApp().inject({ method: "GET", url: "/api/price?currency=EUR" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ currency: "EUR", price: "90000", source: "coinbase" });
    expect(response.headers["cache-control"]).toBe("no-store");
  });

  it("rejects unsupported currencies", async () => {
    const response = await createTestApp().inject({ method: "GET", url: "/api/price?currency=NOPE" });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({ code: "INVALID_CURRENCY", message: "Unsupported currency" });
  });

  it("returns converted history and currency metadata", async () => {
    const app = createTestApp();
    const [historyResponse, currencyResponse] = await Promise.all([
      app.inject({ method: "GET", url: "/api/history?currency=EUR&range=1h" }),
      app.inject({ method: "GET", url: "/api/currencies" }),
    ]);

    expect(historyResponse.json()).toMatchObject({
      currency: "EUR",
      range: "1h",
      points: [{ price: "81000" }],
    });
    expect(currencyResponse.json()).toContainEqual({
      code: "ARS",
      name: "Argentine Peso",
      indicative: true,
    });
  });

  it("reports dependencies and active streams", async () => {
    const response = await createTestApp().inject({ method: "GET", url: "/healthz" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ status: "ok", market: { state: "live" }, streams: 3 });
  });

  it("only allows external framing for renderer routes", async () => {
    const app = createTestApp();
    const [embed, homepage] = await Promise.all([
      app.inject({ method: "GET", url: "/embed" }),
      app.inject({ method: "GET", url: "/" }),
    ]);

    expect(embed.headers["content-security-policy"]).toContain("frame-ancestors *");
    expect(embed.headers["x-frame-options"]).toBeUndefined();
    expect(embed.headers["cross-origin-resource-policy"]).toBe("cross-origin");
    expect(homepage.headers["content-security-policy"]).toContain("frame-ancestors 'none'");
    expect(homepage.headers["x-frame-options"]).toBe("DENY");
  });

  it("redirects the www hostname to the canonical apex", async () => {
    const response = await createTestApp().inject({
      method: "GET",
      url: "/studio?mode=overlay",
      headers: { host: "www.priceb.tc" },
    });

    expect(response.statusCode).toBe(308);
    expect(response.headers.location).toBe("https://priceb.tc/studio?mode=overlay");
  });
});
