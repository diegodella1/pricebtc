import { describe, expect, it } from "vitest";

import type { MarketSnapshot } from "../src/shared/contracts.js";
import { createPricePayload } from "../src/server/services/pricing.js";

function getMarketSnapshot(overrides: Partial<MarketSnapshot> = {}): MarketSnapshot {
  return {
    priceUsd: "100000",
    change24h: 2.5,
    marketTimestamp: "2026-08-24T17:00:00.000Z",
    receivedAt: "2026-08-24T17:00:01.000Z",
    sequence: 10,
    ...overrides,
  };
}

describe("createPricePayload", () => {
  it("returns a converted live payload", () => {
    const payload = createPricePayload({
      snapshot: getMarketSnapshot(),
      currency: "EUR",
      convertUsd: (price) => String(Number(price) * 0.9),
      fxUpdatedAt: "2026-08-24T00:00:00.000Z",
      now: () => Date.parse("2026-08-24T17:00:05.000Z"),
    });

    expect(payload).toMatchObject({ currency: "EUR", price: "90000", status: "live", source: "coinbase" });
  });

  it("marks old market data stale", () => {
    const payload = createPricePayload({
      snapshot: getMarketSnapshot(),
      currency: "USD",
      convertUsd: (price) => price,
      fxUpdatedAt: null,
      now: () => Date.parse("2026-08-24T17:00:20.000Z"),
    });

    expect(payload.status).toBe("stale");
  });
});
