import { EventEmitter } from "node:events";

import Decimal from "decimal.js";

import type { FeedState, MarketSnapshot, VenueSource } from "../../shared/contracts.js";
import type { VenueFeed, VenueSnapshot } from "./venue-feed.js";

const STALE_HOLD_MS = 30_000;
const OUTLIER_THRESHOLD_PERCENT = 2;

interface AggregatorSnapshot extends MarketSnapshot {
  method?: "vwap" | "single-venue-fallback" | "coinbase-only";
  degraded?: boolean;
  sources?: VenueSource[];
}

type AggregatorListener = (snapshot: AggregatorSnapshot) => void;
type StatusListener = (state: FeedState) => void;

interface PriceAggregatorOptions {
  feeds: VenueFeed[];
  coinbaseFallbackStats?: () => { high: string; low: string; volume: string; change24h: number } | null;
  now?: () => number;
  logger?: Pick<Console, "info" | "warn" | "error">;
}

export class PriceAggregator {
  private readonly feeds: VenueFeed[];
  private readonly getCoinbaseStats: () => { high: string; low: string; volume: string; change24h: number } | null;
  private readonly now: () => number;
  private readonly logger: Pick<Console, "info" | "warn" | "error">;
  private readonly events = new EventEmitter();

  private snapshot: AggregatorSnapshot | null = null;
  private state: FeedState = "stopped";
  private lastHealthyAt = 0;

  constructor(options: PriceAggregatorOptions) {
    this.feeds = options.feeds;
    this.getCoinbaseStats = options.coinbaseFallbackStats ?? (() => null);
    this.now = options.now ?? Date.now;
    this.logger = options.logger ?? console;
  }

  start(): void {
    if (this.state !== "stopped") return;
    this.setState("connecting");

    for (const feed of this.feeds) {
      feed.onPrice(() => this.recompute());
      feed.onStatus(() => this.recompute());
    }
  }

  stop(): void {
    this.setState("stopped");
  }

  getSnapshot(): AggregatorSnapshot | null {
    return this.snapshot ? { ...this.snapshot, sources: this.snapshot.sources?.map((s) => ({ ...s })) } : null;
  }

  getState(): FeedState {
    return this.state;
  }

  onPrice(listener: AggregatorListener): () => void {
    this.events.on("price", listener);
    return () => this.events.off("price", listener);
  }

  onStatus(listener: StatusListener): () => void {
    this.events.on("status", listener);
    return () => this.events.off("status", listener);
  }

  private recompute(): void {
    const venueSnapshots: Array<{ feed: VenueFeed; snapshot: VenueSnapshot }> = [];

    for (const feed of this.feeds) {
      const snapshot = feed.getSnapshot();
      if (snapshot && feed.getState() === "live") {
        venueSnapshots.push({ feed, snapshot });
      }
    }

    const healthyCount = venueSnapshots.length;

    if (healthyCount === 0) {
      const now = this.now();
      const shouldHold = this.lastHealthyAt > 0 && now - this.lastHealthyAt <= STALE_HOLD_MS;

      if (!shouldHold) {
        this.snapshot = null;
        this.setState("degraded");
        return;
      }
      return;
    }

    this.lastHealthyAt = this.now();

    if (healthyCount === 1) {
      const singleVenue = venueSnapshots[0];
      this.snapshot = this.createSingleVenueFallback(singleVenue.snapshot);
      this.setState(singleVenue.feed.getState() === "live" ? "degraded" : "degraded");
      this.events.emit("price", this.getSnapshot());
      return;
    }

    const filtered = this.filterOutliers(venueSnapshots.map((v) => v.snapshot));
    const vwapResult = this.calculateVWAP(filtered.healthy);

    if (!vwapResult) {
      if (filtered.healthy.length === 1) {
        this.snapshot = this.createSingleVenueFallback(filtered.healthy[0].snapshot, filtered.outliers);
        this.setState("degraded");
      } else {
        this.snapshot = null;
        this.setState("degraded");
      }
      this.events.emit("price", this.getSnapshot());
      return;
    }

    const allSources: VenueSource[] = [
      ...filtered.healthy.map((v) => ({
        id: v.snapshot.venueId,
        pair: v.snapshot.pair,
        price: v.snapshot.price,
        volume24h: v.snapshot.volume24h ?? null,
        weight: vwapResult.normalizedWeights.get(v.snapshot.venueId) ?? 0,
        weightSource: "24h" as const,
        ok: true,
        quote: v.snapshot.quote,
        asOf: v.snapshot.timestamp,
      })),
      ...filtered.outliers.map((v) => ({
        id: v.snapshot.venueId,
        pair: v.snapshot.pair,
        price: v.snapshot.price,
        volume24h: v.snapshot.volume24h ?? null,
        weight: undefined,
        weightSource: undefined,
        ok: false,
        excluded: true,
        excludeReason: `Price diverges >${OUTLIER_THRESHOLD_PERCENT}% from median`,
        quote: v.snapshot.quote,
        asOf: v.snapshot.timestamp,
      })),
    ];

    const stats = this.getCoinbaseStats();
    const latestTimestamp = filtered.healthy.reduce((max, v) => {
      const ts = new Date(v.snapshot.timestamp).getTime();
      return ts > max ? ts : max;
    }, 0);

    this.snapshot = {
      priceUsd: vwapResult.vwap.toFixed(),
      change24h: stats?.change24h ?? 0,
      high24h: stats?.high ?? null,
      low24h: stats?.low ?? null,
      volume24h: stats?.volume ?? null,
      marketTimestamp: new Date(latestTimestamp).toISOString(),
      receivedAt: new Date(this.now()).toISOString(),
      sequence: null,
      method: "vwap",
      degraded: false,
      sources: allSources,
    };

    this.setState("live");
    this.events.emit("price", this.getSnapshot());
  }

  private createSingleVenueFallback(
    venue: VenueSnapshot,
    outliers: Array<{ snapshot: VenueSnapshot }> = [],
  ): AggregatorSnapshot {
    const stats = this.getCoinbaseStats();
    const coinbaseFallback = venue.venueId === "coinbase";

    const sources: VenueSource[] = [
      {
        id: venue.venueId,
        pair: venue.pair,
        price: venue.price,
        volume24h: venue.volume24h ?? null,
        weight: undefined,
        weightSource: undefined,
        ok: true,
        quote: venue.quote,
        asOf: venue.timestamp,
      },
      ...outliers.map((v) => ({
        id: v.snapshot.venueId,
        pair: v.snapshot.pair,
        price: v.snapshot.price,
        volume24h: v.snapshot.volume24h ?? null,
        weight: undefined,
        weightSource: undefined,
        ok: false,
        excluded: true,
        excludeReason: `Price diverges >${OUTLIER_THRESHOLD_PERCENT}% from median`,
        quote: v.snapshot.quote,
        asOf: v.snapshot.timestamp,
      })),
    ];

    return {
      priceUsd: venue.price,
      change24h: coinbaseFallback ? (stats?.change24h ?? 0) : 0,
      high24h: coinbaseFallback ? (stats?.high ?? null) : null,
      low24h: coinbaseFallback ? (stats?.low ?? null) : null,
      volume24h: coinbaseFallback ? (stats?.volume ?? null) : null,
      marketTimestamp: venue.timestamp,
      receivedAt: venue.receivedAt,
      sequence: null,
      method: "single-venue-fallback",
      degraded: true,
      sources,
    };
  }

  private filterOutliers(snapshots: VenueSnapshot[]): {
    healthy: Array<{ snapshot: VenueSnapshot; weight: number }>;
    outliers: Array<{ snapshot: VenueSnapshot }>;
  } {
    if (snapshots.length < 2) {
      const weighted = snapshots
        .map((s) => ({ snapshot: s, weight: this.calculateWeight(s) }))
        .filter((v) => v.weight > 0);
      return { healthy: weighted, outliers: [] };
    }

    const prices = snapshots.map((s) => new Decimal(s.price)).sort((a, b) => a.comparedTo(b));
    const medianIndex = Math.floor(prices.length / 2);
    const median =
      prices.length % 2 === 0 ? prices[medianIndex - 1].add(prices[medianIndex]).div(2) : prices[medianIndex];

    const threshold = median.mul(OUTLIER_THRESHOLD_PERCENT).div(100);

    const healthy: Array<{ snapshot: VenueSnapshot; weight: number }> = [];
    const outliers: Array<{ snapshot: VenueSnapshot }> = [];

    for (const snapshot of snapshots) {
      const price = new Decimal(snapshot.price);
      const deviation = price.minus(median).abs();

      if (deviation.greaterThan(threshold)) {
        outliers.push({ snapshot });
      } else {
        const weight = this.calculateWeight(snapshot);
        if (weight > 0) {
          healthy.push({ snapshot, weight });
        } else {
          outliers.push({ snapshot });
        }
      }
    }

    return { healthy, outliers };
  }

  private calculateWeight(snapshot: VenueSnapshot): number {
    if (!snapshot.volume24h) return 0;
    const volume = new Decimal(snapshot.volume24h);
    if (volume.isZero() || volume.isNegative()) return 0;

    const price = new Decimal(snapshot.price);
    return price.mul(volume).toNumber();
  }

  private calculateVWAP(
    weighted: Array<{ snapshot: VenueSnapshot; weight: number }>,
  ): { vwap: Decimal; normalizedWeights: Map<string, number> } | null {
    if (weighted.length === 0) return null;

    const totalWeight = weighted.reduce((sum, v) => sum + v.weight, 0);
    if (totalWeight === 0) return null;

    let sumWeightedPrice = new Decimal(0);
    for (const v of weighted) {
      const price = new Decimal(v.snapshot.price);
      sumWeightedPrice = sumWeightedPrice.add(price.mul(v.weight));
    }

    const normalizedWeights = new Map<string, number>();
    for (const v of weighted) {
      normalizedWeights.set(v.snapshot.venueId, v.weight / totalWeight);
    }

    return {
      vwap: sumWeightedPrice.div(totalWeight),
      normalizedWeights,
    };
  }

  private setState(state: FeedState): void {
    if (state === this.state) return;
    this.state = state;
    this.events.emit("status", state);
  }
}
