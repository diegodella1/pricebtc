import { describe, expect, it } from "vitest";

import type { MarketSnapshot } from "../src/shared/contracts.js";
import { createPricePayload } from "../src/server/services/pricing.js";

function getMarketSnapshot(overrides: Partial<MarketSnapshot> = {}): MarketSnapshot {
  return {
    priceUsd: "100000",
    change24h: 2.5,
    high24h: "101000",
    low24h: "99000",
    volume24h: "10000",
    marketTimestamp: "2026-08-24T17:00:00.000Z",
    receivedAt: "2026-08-24T17:00:01.000Z",
    sequence: 10,
    ...overrides,
  };
}

describe("createPricePayload", () => {
  it("keeps missing statistics null for older observations", () => {
    const payload = createPricePayload({ snapshot: getMarketSnapshot({ high24h: null, low24h: null, volume24h: null }), currency: "USD", convertUsd: price => price, fxUpdatedAt: null });
    expect(payload).toMatchObject({ high24h: null, low24h: null, volume24h: null, volume24hUsd: null });
  });
  it("converts price bounds while retaining base volume in BTC", () => {
    const payload = createPricePayload({
      snapshot: getMarketSnapshot({ high24h: "102000", low24h: "98000", volume24h: "123.456" }),
      currency: "EUR", convertUsd: price => String(Number(price) * 0.9), fxUpdatedAt: null,
    });
    expect(payload).toMatchObject({ high24h: "91800", low24h: "88200", volume24h: "123.456" });
    expect(payload.volume24hUsd).toBeUndefined();
  });
  it("returns a converted live payload", () => {
    const payload = createPricePayload({
      snapshot: getMarketSnapshot(),
      currency: "EUR",
      convertUsd: (price) => String(Number(price) * 0.9),
      fxUpdatedAt: "2026-08-24T00:00:00.000Z",
      now: () => Date.parse("2026-08-24T17:00:05.000Z"),
    });

    expect(payload).toMatchObject({ currency: "EUR", price: "90000", status: "live", source: "coinbase", high24h: "90900", low24h: "89100", volume24h: "10000" });
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
