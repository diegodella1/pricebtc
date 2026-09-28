import { describe, expect, it, vi } from "vitest";
import type WebSocket from "ws";

import { BinanceFeed } from "../src/server/services/binance-feed.js";

describe("BinanceFeed", () => {
  it("parses miniTicker messages correctly", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        symbol: "BTCUSDT",
        lastPrice: "100000.50",
        volume: "1500.25",
      }),
    });

    const mockSocket = {
      on: vi.fn(),
      send: vi.fn(),
      readyState: 1,
      close: vi.fn(),
      terminate: vi.fn(),
    };

    const feed = new BinanceFeed({
      fetcher: mockFetch as unknown as typeof fetch,
      socketFactory: () => mockSocket as unknown as WebSocket,
      now: () => Date.parse("2026-09-28T12:00:00Z"),
    });

    await feed.start();

    const openHandler = mockSocket.on.mock.calls.find((call) => call[0] === "open")?.[1];
    if (openHandler) openHandler();

    const messageHandler = mockSocket.on.mock.calls.find((call) => call[0] === "message")?.[1];
    if (messageHandler) {
      messageHandler(
        JSON.stringify({
          e: "24hrMiniTicker",
          s: "BTCUSDT",
          c: "100100.75",
          E: Date.parse("2026-09-28T12:00:01Z"),
        }),
      );
    }

    const snapshot = feed.getSnapshot();
    expect(snapshot).toBeTruthy();
    expect(snapshot!.venueId).toBe("binance");
    expect(snapshot!.pair).toBe("BTCUSDT");
    expect(snapshot!.price).toBe("100100.75");
    expect(snapshot!.quote).toBe("USDT");

    feed.stop();
  });

  it("fetches 24h volume from REST API", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        symbol: "BTCUSDT",
        lastPrice: "100000.50",
        volume: "1500.25",
      }),
    });

    const feed = new BinanceFeed({
      fetcher: mockFetch as unknown as typeof fetch,
      socketFactory: () => {
        const mockSocket = { on: vi.fn(), send: vi.fn(), readyState: 1, close: vi.fn(), terminate: vi.fn() };
        return mockSocket as unknown as WebSocket;
      },
    });

    await feed.start();

    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining("/api/v3/ticker/24hr?symbol=BTCUSDT"),
      expect.any(Object),
    );

    const snapshot = feed.getSnapshot();
    expect(snapshot).toBeTruthy();
    expect(snapshot!.volume24h).toBe("1500.25");

    feed.stop();
  });

  it("ignores non-BTCUSDT messages", () => {
    const mockSocket = {
      on: vi.fn(),
      send: vi.fn(),
      readyState: 1,
      close: vi.fn(),
      terminate: vi.fn(),
    };

    const feed = new BinanceFeed({
      socketFactory: () => mockSocket as unknown as WebSocket,
      fetcher: vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ symbol: "BTCUSDT", lastPrice: "100000", volume: "1000" }),
      }) as unknown as typeof fetch,
    });

    void feed.start();

    const messageHandler = mockSocket.on.mock.calls.find((call) => call[0] === "message")?.[1];
    if (messageHandler) {
      messageHandler(
        JSON.stringify({
          e: "24hrMiniTicker",
          s: "ETHUSDT",
          c: "5000",
          E: Date.now(),
        }),
      );
    }

    const snapshot = feed.getSnapshot();
    expect(snapshot?.pair).not.toBe("ETHUSDT");

    feed.stop();
  });
});
