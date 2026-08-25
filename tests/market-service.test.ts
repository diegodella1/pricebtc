import { describe, expect, it } from "vitest";

import { parseTickerMessage } from "../src/server/services/market-service.js";

describe("parseTickerMessage", () => {
  it("normalizes Coinbase ticker messages", () => {
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
    );

    expect(snapshot).toEqual({
      priceUsd: "105000.50",
      change24h: 5.0005,
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
