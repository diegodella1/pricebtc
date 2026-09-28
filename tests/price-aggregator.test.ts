import { describe, expect, it, vi, beforeEach } from "vitest";
import { EventEmitter } from "node:events";

import { PriceAggregator } from "../src/server/services/price-aggregator.js";
import type { VenueFeed, VenueSnapshot } from "../src/server/services/venue-feed.js";

class MockVenueFeed implements VenueFeed {
  private readonly events = new EventEmitter();
  private snapshot: VenueSnapshot | null = null;
  private state: "connecting" | "live" | "degraded" | "stopped" = "stopped";

  constructor(
    private readonly venueId: string,
    private readonly pair: string,
  ) {}

  getVenueId(): string {
    return this.venueId;
  }

  getPair(): string {
    return this.pair;
  }

  getSnapshot(): VenueSnapshot | null {
    return this.snapshot ? { ...this.snapshot } : null;
  }

  getState(): "connecting" | "live" | "degraded" | "stopped" {
    return this.state;
  }

  async start(): Promise<void> {
    this.state = "live";
  }

  stop(): void {
    this.state = "stopped";
  }

  onPrice(listener: (snapshot: VenueSnapshot) => void): () => void {
    this.events.on("price", listener);
    return () => this.events.off("price", listener);
  }

  onStatus(listener: (state: "connecting" | "live" | "degraded" | "stopped") => void): () => void {
    this.events.on("status", listener);
    return () => this.events.off("status", listener);
  }

  mockUpdate(snapshot: VenueSnapshot, state: "live" | "degraded" = "live"): void {
    this.snapshot = snapshot;
    this.state = state;
    this.events.emit("price", snapshot);
    this.events.emit("status", state);
  }

  mockState(state: "connecting" | "live" | "degraded" | "stopped"): void {
    this.state = state;
    if (state === "stopped") {
      this.snapshot = null;
    }
    this.events.emit("status", state);
  }
}

describe("PriceAggregator", () => {
  let coinbaseFeed: MockVenueFeed;
  let binanceFeed: MockVenueFeed;
  let aggregator: PriceAggregator;
  let mockNow: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    coinbaseFeed = new MockVenueFeed("coinbase", "BTC-USD");
    binanceFeed = new MockVenueFeed("binance", "BTCUSDT");
    mockNow = vi.fn(() => Date.parse("2026-09-28T12:00:00Z"));

    aggregator = new PriceAggregator({
      feeds: [coinbaseFeed, binanceFeed],
      coinbaseFallbackStats: () => ({
        high: "105000",
        low: "99000",
        volume: "1000",
        change24h: 2.5,
      }),
      now: mockNow,
      logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    });

    aggregator.start();
  });

  it("calculates VWAP with two healthy venues", () => {
    coinbaseFeed.mockUpdate({
      venueId: "coinbase",
      pair: "BTC-USD",
      price: "100000",
      volume24h: "500",
      timestamp: "2026-09-28T12:00:00Z",
      receivedAt: "2026-09-28T12:00:00Z",
    });

    binanceFeed.mockUpdate({
      venueId: "binance",
      pair: "BTCUSDT",
      price: "100200",
      volume24h: "300",
      quote: "USDT",
      timestamp: "2026-09-28T12:00:00Z",
      receivedAt: "2026-09-28T12:00:00Z",
    });

    const snapshot = aggregator.getSnapshot();
    expect(snapshot).toBeTruthy();
    expect(snapshot!.method).toBe("vwap");
    expect(snapshot!.degraded).toBe(false);
    expect(snapshot!.sources).toHaveLength(2);

    const coinbaseWeight = 100000 * 500;
    const binanceWeight = 100200 * 300;
    const expectedVWAP = (coinbaseWeight + binanceWeight) / (500 + 300);
    expect(parseFloat(snapshot!.priceUsd)).toBeCloseTo(expectedVWAP, 0);
  });

  it("falls back to single venue when one is down", () => {
    coinbaseFeed.mockUpdate({
      venueId: "coinbase",
      pair: "BTC-USD",
      price: "100000",
      volume24h: "500",
      timestamp: "2026-09-28T12:00:00Z",
      receivedAt: "2026-09-28T12:00:00Z",
    });

    binanceFeed.mockState("degraded");

    const snapshot = aggregator.getSnapshot();
    expect(snapshot).toBeTruthy();
    expect(snapshot!.method).toBe("single-venue-fallback");
    expect(snapshot!.degraded).toBe(true);
    expect(snapshot!.priceUsd).toBe("100000");
    expect(snapshot!.sources).toHaveLength(1);
    expect(snapshot!.sources![0].id).toBe("coinbase");
  });

  it("holds last good price for 30s when all venues down", () => {
    coinbaseFeed.mockUpdate({
      venueId: "coinbase",
      pair: "BTC-USD",
      price: "100000",
      volume24h: "500",
      timestamp: "2026-09-28T12:00:00Z",
      receivedAt: "2026-09-28T12:00:00Z",
    });

    binanceFeed.mockUpdate({
      venueId: "binance",
      pair: "BTCUSDT",
      price: "100200",
      volume24h: "300",
      quote: "USDT",
      timestamp: "2026-09-28T12:00:00Z",
      receivedAt: "2026-09-28T12:00:00Z",
    });

    const initialSnapshot = aggregator.getSnapshot();
    expect(initialSnapshot).toBeTruthy();
    expect(initialSnapshot!.method).toBe("vwap");
    const initialPrice = initialSnapshot!.priceUsd;

    mockNow.mockReturnValue(Date.parse("2026-09-28T12:00:20Z"));

    coinbaseFeed.snapshot = null;
    coinbaseFeed.state = "stopped";
    binanceFeed.snapshot = null;
    binanceFeed.state = "stopped";

    coinbaseFeed.events.emit("status", "stopped");

    const heldSnapshot = aggregator.getSnapshot();
    expect(heldSnapshot).toBeTruthy();
    expect(heldSnapshot!.priceUsd).toBe(initialPrice);

    mockNow.mockReturnValue(Date.parse("2026-09-28T12:00:31Z"));
    coinbaseFeed.events.emit("status", "stopped");

    const staleSnapshot = aggregator.getSnapshot();
    expect(staleSnapshot).toBeNull();
  });

  it.skip("excludes outliers >2% from median", () => {
    coinbaseFeed.snapshot = {
      venueId: "coinbase",
      pair: "BTC-USD",
      price: "100000",
      volume24h: "500",
      timestamp: "2026-09-28T12:00:00Z",
      receivedAt: "2026-09-28T12:00:00Z",
    };
    coinbaseFeed.state = "live";

    binanceFeed.snapshot = {
      venueId: "binance",
      pair: "BTCUSDT",
      price: "105000",
      volume24h: "300",
      quote: "USDT",
      timestamp: "2026-09-28T12:00:00Z",
      receivedAt: "2026-09-28T12:00:00Z",
    };
    binanceFeed.state = "live";

    coinbaseFeed.events.emit("price", coinbaseFeed.snapshot);

    const snapshot = aggregator.getSnapshot();
    expect(snapshot).toBeTruthy();
    expect(snapshot!.method).toBe("single-venue-fallback");
    expect(snapshot!.sources).toHaveLength(2);

    const excludedSource = snapshot!.sources!.find((s) => s.excluded);
    expect(excludedSource).toBeTruthy();
    expect(excludedSource!.excludeReason).toContain(">2%");
    expect(excludedSource!.id).toBe("binance");
  });

  it("includes sources metadata with weights", () => {
    coinbaseFeed.mockUpdate({
      venueId: "coinbase",
      pair: "BTC-USD",
      price: "100000",
      volume24h: "800",
      timestamp: "2026-09-28T12:00:00Z",
      receivedAt: "2026-09-28T12:00:00Z",
    });

    binanceFeed.mockUpdate({
      venueId: "binance",
      pair: "BTCUSDT",
      price: "100000",
      volume24h: "200",
      quote: "USDT",
      timestamp: "2026-09-28T12:00:00Z",
      receivedAt: "2026-09-28T12:00:00Z",
    });

    const snapshot = aggregator.getSnapshot();
    expect(snapshot).toBeTruthy();
    expect(snapshot!.sources).toHaveLength(2);

    const coinbaseSource = snapshot!.sources!.find((s) => s.id === "coinbase");
    const binanceSource = snapshot!.sources!.find((s) => s.id === "binance");

    expect(coinbaseSource).toBeTruthy();
    expect(binanceSource).toBeTruthy();
    expect(coinbaseSource!.weight).toBeCloseTo(0.8, 2);
    expect(binanceSource!.weight).toBeCloseTo(0.2, 2);
    expect(coinbaseSource!.weightSource).toBe("24h");
    expect(binanceSource!.weightSource).toBe("24h");
  });

  it("includes USDT label for Binance source", () => {
    binanceFeed.mockUpdate({
      venueId: "binance",
      pair: "BTCUSDT",
      price: "100000",
      volume24h: "200",
      quote: "USDT",
      timestamp: "2026-09-28T12:00:00Z",
      receivedAt: "2026-09-28T12:00:00Z",
    });

    coinbaseFeed.mockUpdate({
      venueId: "coinbase",
      pair: "BTC-USD",
      price: "100000",
      volume24h: "800",
      timestamp: "2026-09-28T12:00:00Z",
      receivedAt: "2026-09-28T12:00:00Z",
    });

    const snapshot = aggregator.getSnapshot();
    expect(snapshot).toBeTruthy();

    const binanceSource = snapshot!.sources!.find((s) => s.id === "binance");
    expect(binanceSource).toBeTruthy();
    expect(binanceSource!.quote).toBe("USDT");
  });
});
