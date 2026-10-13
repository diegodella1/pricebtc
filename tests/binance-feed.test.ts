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

  it("swallows network errors from refresh24hData with backoff instead of rejecting", async () => {
    const error = Object.assign(new TypeError("fetch failed"), {
      cause: Object.assign(new Error("connect EHOSTUNREACH 65.8.205.120:443"), { code: "EHOSTUNREACH" }),
    });
    const mockFetch = vi.fn().mockRejectedValue(error);
    const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
    let now = 1_000;

    const feed = new BinanceFeed({
      fetcher: mockFetch as unknown as typeof fetch,
      socketFactory: () => {
        const mockSocket = { on: vi.fn(), send: vi.fn(), readyState: 1, close: vi.fn(), terminate: vi.fn() };
        return mockSocket as unknown as WebSocket;
      },
      now: () => now,
      logger,
    });

    await expect(feed.start()).resolves.toBeUndefined();
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(logger.warn).toHaveBeenCalledWith("Binance 24h data refresh failed", error);

    now = 1_500;
    await expect(
      (feed as unknown as { refresh24hData: () => Promise<void> }).refresh24hData(),
    ).resolves.toBeUndefined();
    expect(mockFetch).toHaveBeenCalledTimes(1);

    feed.stop();
  });

  it("retries 24h refresh after exponential backoff and keeps the volume timer from rejecting", async () => {
    vi.useFakeTimers();
    try {
      const error = Object.assign(new TypeError("fetch failed"), {
        cause: Object.assign(new Error("read ECONNRESET"), { code: "ECONNRESET" }),
      });
      const mockFetch = vi.fn()
        .mockRejectedValueOnce(error)
        .mockRejectedValueOnce(error)
        .mockResolvedValue({
          ok: true,
          json: async () => ({ symbol: "BTCUSDT", lastPrice: "100000", volume: "10" }),
        });
      const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
      let now = 0;
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
        now: () => now,
        logger,
      });

      await feed.start();
      expect(mockFetch).toHaveBeenCalledTimes(1);

      const openHandler = mockSocket.on.mock.calls.find((call) => call[0] === "open")?.[1];
      openHandler?.();

      now = 500;
      await vi.advanceTimersByTimeAsync(15_000);
      expect(mockFetch).toHaveBeenCalledTimes(1);

      now = 2_000;
      await vi.advanceTimersByTimeAsync(15_000);
      expect(mockFetch).toHaveBeenCalledTimes(2);

      now = 6_000;
      await vi.advanceTimersByTimeAsync(15_000);
      expect(mockFetch).toHaveBeenCalledTimes(3);
      expect(feed.getSnapshot()?.volume24h).toBe("10");

      feed.stop();
    } finally {
      vi.useRealTimers();
    }
  });
});
