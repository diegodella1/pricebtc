import { z } from "zod";

import type { HistoryPayload, HistoryPoint } from "../../shared/contracts.js";
import type { HistoryRange } from "../../shared/widget-config.js";

const CANDLE_SCHEMA = z.tuple([
  z.number().int().positive(),
  z.number(),
  z.number(),
  z.number(),
  z.number(),
  z.number(),
]);
const CANDLES_SCHEMA = z.array(CANDLE_SCHEMA).max(300);

const RANGE_CONFIG: Record<HistoryRange, { seconds: number; granularity: number; ttlMs: number }> = {
  "1h": { seconds: 60 * 60, granularity: 60, ttlMs: 60_000 },
  "24h": { seconds: 24 * 60 * 60, granularity: 300, ttlMs: 5 * 60_000 },
  "7d": { seconds: 7 * 24 * 60 * 60, granularity: 3600, ttlMs: 15 * 60_000 },
};

type Fetcher = typeof fetch;
type ConvertPrice = (priceUsd: string) => string;

interface CachedHistory {
  fetchedAt: number;
  points: HistoryPoint[];
}

interface HistoryServiceOptions {
  apiUrl?: string;
  fetcher?: Fetcher;
  now?: () => number;
}

export class HistoryService {
  private readonly apiUrl: string;
  private readonly fetcher: Fetcher;
  private readonly now: () => number;
  private readonly cache = new Map<HistoryRange, CachedHistory>();

  constructor(options: HistoryServiceOptions = {}) {
    this.apiUrl = options.apiUrl ?? "https://api.exchange.coinbase.com";
    this.fetcher = options.fetcher ?? fetch;
    this.now = options.now ?? Date.now;
  }

  async getHistory(range: HistoryRange, convertPrice: ConvertPrice): Promise<Omit<HistoryPayload, "currency">> {
    const usdHistory = await this.getUsdHistory(range);
    return {
      range,
      points: usdHistory.points.map((point) => ({ ...point, price: convertPrice(point.price) })),
      cachedAt: new Date(usdHistory.fetchedAt).toISOString(),
      source: "coinbase",
    };
  }

  private async getUsdHistory(range: HistoryRange): Promise<CachedHistory> {
    const config = RANGE_CONFIG[range];
    const cached = this.cache.get(range);
    if (cached && this.now() - cached.fetchedAt < config.ttlMs) return cached;

    try {
      const fresh = await this.fetchHistory(range);
      this.cache.set(range, fresh);
      return fresh;
    } catch (error) {
      if (cached) return cached;
      throw error;
    }
  }

  private async fetchHistory(range: HistoryRange): Promise<CachedHistory> {
    const config = RANGE_CONFIG[range];
    const end = new Date(this.now());
    const start = new Date(end.getTime() - config.seconds * 1_000);
    const url = new URL("/products/BTC-USD/candles", this.apiUrl);
    url.searchParams.set("start", start.toISOString());
    url.searchParams.set("end", end.toISOString());
    url.searchParams.set("granularity", String(config.granularity));

    const response = await this.fetcher(url, {
      headers: { Accept: "application/json", "User-Agent": "priceb.tc/1.0" },
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) throw new Error(`Coinbase candles returned ${response.status}`);

    const parsed = CANDLES_SCHEMA.safeParse(await response.json());
    if (!parsed.success) throw new Error("Invalid candle payload");

    const points = parsed.data
      .map((candle) => ({
        timestamp: new Date(candle[0] * 1_000).toISOString(),
        price: String(candle[4]),
      }))
      .sort((left, right) => left.timestamp.localeCompare(right.timestamp));

    return { fetchedAt: this.now(), points };
  }
}
