import { describe, expect, it } from "vitest";

import { createPricePayload } from "../src/server/services/pricing.js";
import type { MarketSnapshot } from "../src/shared/contracts.js";

describe("createPricePayload with index", () => {
  const baseSnapshot: MarketSnapshot = {
    priceUsd: "100000.50",
    change24h: 2.5,
    high24h: "102000",
    low24h: "99000",
    volume24h: "1500.5",
    marketTimestamp: "2026-09-28T12:00:00Z",
    receivedAt: "2026-09-28T12:00:00Z",
    sequence: null,
  };

  it("includes index fields for VWAP method", () => {
    const snapshot = {
      ...baseSnapshot,
      method: "vwap" as const,
      degraded: false,
      sources: [
        {
          id: "coinbase",
          pair: "BTC-USD",
          price: "100000",
          volume24h: "1000",
          weight: 0.6,
          weightSource: "24h" as const,
          ok: true,
          asOf: "2026-09-28T12:00:00Z",
        },
        {
          id: "binance",
          pair: "BTCUSDT",
          price: "100100",
          volume24h: "500",
          weight: 0.4,
          weightSource: "24h" as const,
          ok: true,
          quote: "USDT",
          asOf: "2026-09-28T12:00:00Z",
        },
      ],
    };

    const payload = createPricePayload({
      snapshot,
      currency: "USD",
      convertUsd: (price) => price,
      fxUpdatedAt: "2026-09-28T11:00:00Z",
    });

    expect(payload.source).toBe("index");
    expect(payload.method).toBe("vwap");
    expect(payload.degraded).toBe(false);
    expect(payload.sources).toHaveLength(2);
    expect(payload.sources![0].id).toBe("coinbase");
    expect(payload.sources![1].id).toBe("binance");
  });

  it("sets source to coinbase for single-venue-fallback with coinbase", () => {
    const snapshot = {
      ...baseSnapshot,
      method: "single-venue-fallback" as const,
      degraded: true,
      sources: [
        {
          id: "coinbase",
          pair: "BTC-USD",
          price: "100000",
          volume24h: "1000",
          ok: true,
          asOf: "2026-09-28T12:00:00Z",
        },
      ],
    };

    const payload = createPricePayload({
      snapshot,
      currency: "USD",
      convertUsd: (price) => price,
      fxUpdatedAt: "2026-09-28T11:00:00Z",
    });

    expect(payload.source).toBe("coinbase");
    expect(payload.method).toBe("single-venue-fallback");
    expect(payload.degraded).toBe(true);
  });

  it("sets source to index for single-venue-fallback with binance", () => {
    const snapshot = {
      ...baseSnapshot,
      method: "single-venue-fallback" as const,
      degraded: true,
      sources: [
        {
          id: "binance",
          pair: "BTCUSDT",
          price: "100000",
          volume24h: "1000",
          ok: true,
          quote: "USDT",
          asOf: "2026-09-28T12:00:00Z",
        },
      ],
    };

    const payload = createPricePayload({
      snapshot,
      currency: "USD",
      convertUsd: (price) => price,
      fxUpdatedAt: "2026-09-28T11:00:00Z",
    });

    expect(payload.source).toBe("index");
    expect(payload.method).toBe("single-venue-fallback");
    expect(payload.degraded).toBe(true);
  });

  it("does not include index fields for coinbase-only mode", () => {
    const snapshot = {
      ...baseSnapshot,
    };

    const payload = createPricePayload({
      snapshot,
      currency: "USD",
      convertUsd: (price) => price,
      fxUpdatedAt: "2026-09-28T11:00:00Z",
    });

    expect(payload.source).toBe("coinbase");
    expect(payload.method).toBeUndefined();
    expect(payload.degraded).toBeUndefined();
    expect(payload.sources).toBeUndefined();
  });

  it("preserves string price format", () => {
    const snapshot = {
      ...baseSnapshot,
      priceUsd: "123456.789012",
      method: "vwap" as const,
      degraded: false,
      sources: [
        {
          id: "coinbase",
          pair: "BTC-USD",
          price: "123456.78",
          volume24h: "1000",
          weight: 0.5,
          weightSource: "24h" as const,
          ok: true,
          asOf: "2026-09-28T12:00:00Z",
        },
        {
          id: "binance",
          pair: "BTCUSDT",
          price: "123456.79",
          volume24h: "1000",
          weight: 0.5,
          weightSource: "24h" as const,
          ok: true,
          quote: "USDT",
          asOf: "2026-09-28T12:00:00Z",
        },
      ],
    };

    const payload = createPricePayload({
      snapshot,
      currency: "USD",
      convertUsd: (price) => price,
      fxUpdatedAt: "2026-09-28T11:00:00Z",
    });

    expect(typeof payload.price).toBe("string");
    expect(typeof payload.priceUsd).toBe("string");
    expect(payload.priceUsd).toBe("123456.789012");
  });
});
