import { describe, expect, it } from "vitest";

import { parseTickerMessage } from "../src/server/services/market-service.js";

describe("parseTickerMessage", () => {
  it("preserves 24-hour statistics from live ticker updates", () => {
    const snapshot = parseTickerMessage(JSON.stringify({
      type: "ticker", product_id: "BTC-USD", price: "100000", open_24h: "99000",
      high_24h: "102000", low_24h: "98000", volume_24h: "123.456",
      time: "2026-09-21T17:00:00Z",
    }), "2026-09-21T17:00:01Z");
    expect(snapshot).toMatchObject({ high24h: "102000", low24h: "98000", volume24h: "123.456" });
  });
  it("normalizes Coinbase ticker messages", () => {
    const stats24h = { high: "106000", low: "101000", volume: "10000" };
    const snapshot = parseTickerMessage(
      JSON.stringify({
        type: "ticker",
        product_id: "BTC-USD",
        sequence: 42,
        price: "105000.50",
        open_24h: "100000",
        time: "2026-08-24T17:00:00.000Z",
      }),
      "2026-08-24T17:00:00.100Z",
      stats24h,
    );

    expect(snapshot).toEqual({
      priceUsd: "105000.50",
      change24h: 5.0005,
      high24h: "106000",
      low24h: "101000",
      volume24h: "10000",
      marketTimestamp: "2026-08-24T17:00:00.000Z",
      receivedAt: "2026-08-24T17:00:00.100Z",
      sequence: 42,
    });
  });

  it("ignores heartbeats and unrelated products", () => {
    expect(parseTickerMessage('{"type":"heartbeat"}', new Date().toISOString())).toBeNull();
    expect(
      parseTickerMessage(
        '{"type":"ticker","product_id":"ETH-USD","price":"1","open_24h":"1","time":"2026-01-01T00:00:00Z"}',
        new Date().toISOString(),
      ),
    ).toBeNull();
  });

  it("rejects malformed JSON without throwing", () => {
    expect(parseTickerMessage("not-json", new Date().toISOString())).toBeNull();
  });
});
