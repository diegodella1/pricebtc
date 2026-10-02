import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { z } from "zod";
import { join } from "node:path";

export interface DailyCandle {
  date: string;
  open: string;
  high: string;
  low: string;
  close: string;
  avg: string | null;
  source: string;
  method: string;
  degraded: boolean;
  currency: string;
}

interface DailyHistoryServiceOptions {
  dataDir?: string;
  apiUrl?: string;
  fetcher?: typeof fetch;
  now?: () => number;
}

const LAUNCH_DATE = "2026-08-25";
const CANDLE_SCHEMA = z.tuple([
  z.number().int().positive(),
  z.number(),
  z.number(),
  z.number(),
  z.number(),
  z.number(),
]);
const CANDLES_SCHEMA = z.array(CANDLE_SCHEMA).max(365);

export class DailyHistoryService {
  private readonly dataFile: string | null;
  private readonly apiUrl: string;
  private readonly fetcher: typeof fetch;
  private readonly now: () => number;
  private cache: Map<string, DailyCandle> = new Map();
  private cacheLoaded = false;

  constructor(options: DailyHistoryServiceOptions = {}) {
    this.apiUrl = options.apiUrl ?? "https://api.exchange.coinbase.com";
    this.fetcher = options.fetcher ?? fetch;
    this.now = options.now ?? Date.now;
    this.dataFile = options.dataDir ? join(options.dataDir, "daily-history.json") : null;
  }

  private async ensureDataDir(): Promise<void> {
    if (!this.dataFile) return;
    const dir = this.dataFile.split("/").slice(0, -1).join("/");
    if (!existsSync(dir)) {
      await mkdir(dir, { recursive: true });
    }
  }

  private async loadCache(): Promise<void> {
    if (this.cacheLoaded || !this.dataFile) return;

    try {
      if (existsSync(this.dataFile)) {
        const data = await readFile(this.dataFile, "utf-8");
        const candles = JSON.parse(data) as DailyCandle[];
        this.cache = new Map(candles.map((c) => [c.date, c]));
      }
    } catch (error) {
      console.error("Failed to load daily history cache:", error);
    }

    this.cacheLoaded = true;
  }

  private async saveCache(): Promise<void> {
    if (!this.dataFile) return;

    try {
      await this.ensureDataDir();
      const candles = Array.from(this.cache.values()).sort((a, b) =>
        a.date.localeCompare(b.date)
      );
      await writeFile(this.dataFile, JSON.stringify(candles, null, 2), "utf-8");
    } catch (error) {
      console.error("Failed to save daily history cache:", error);
    }
  }

  async backfillFromCoinbase(): Promise<void> {
    await this.loadCache();

    const launchDate = new Date(LAUNCH_DATE);
    const today = new Date(this.now());
    const start = new Date(launchDate);
    start.setUTCHours(0, 0, 0, 0);

    const end = new Date(today);
    end.setUTCHours(23, 59, 59, 999);

    try {
      const candles = await this.fetchDailyCandles(start, end);

      for (const candle of candles) {
        this.cache.set(candle.date, candle);
      }

      await this.saveCache();
    } catch (error) {
      console.error("Backfill error:", error);
      throw error;
    }
  }

  private async fetchDailyCandles(start: Date, end: Date): Promise<DailyCandle[]> {
    const url = new URL("/products/BTC-USD/candles", this.apiUrl);
    url.searchParams.set("start", start.toISOString());
    url.searchParams.set("end", end.toISOString());
    url.searchParams.set("granularity", "86400");

    const response = await this.fetcher(url, {
      headers: { Accept: "application/json", "User-Agent": "priceb.tc/1.0" },
      signal: AbortSignal.timeout(15_000),
    });

    if (!response.ok) {
      throw new Error(`Coinbase daily candles returned ${response.status}`);
    }

    const parsed = CANDLES_SCHEMA.safeParse(await response.json());
    if (!parsed.success) {
      throw new Error("Invalid daily candle payload");
    }

    const candles = parsed.data.map((candle) => {
      const dateObj = new Date(candle[0] * 1_000);
      const date = dateObj.toISOString().split("T")[0];
      const low = String(candle[1]);
      const high = String(candle[2]);
      const open = String(candle[3]);
      const close = String(candle[4]);
      const avg = String((Number(high) + Number(low)) / 2);

      const lowNum = Number(low);
      const highNum = Number(high);
      const openNum = Number(open);
      const closeNum = Number(close);

      if (lowNum > highNum) {
        throw new Error(`Invalid OHLC: low ${low} > high ${high} for ${date}`);
      }
      if (!(lowNum <= openNum && openNum <= highNum)) {
        throw new Error(`Invalid OHLC: open ${open} outside [${low}, ${high}] for ${date}`);
      }
      if (!(lowNum <= closeNum && closeNum <= highNum)) {
        throw new Error(`Invalid OHLC: close ${close} outside [${low}, ${high}] for ${date}`);
      }

      return {
        date,
        open,
        high,
        low,
        close,
        avg,
        source: "coinbase",
        method: "daily-backfill",
        degraded: false,
        currency: "USD",
      };
    });

    return candles.sort((a, b) => a.date.localeCompare(b.date));
  }

  async getDailyHistory(fromDate?: string, toDate?: string): Promise<DailyCandle[]> {
    await this.loadCache();

    const from = fromDate ?? LAUNCH_DATE;
    const to = toDate ?? new Date(this.now()).toISOString().split("T")[0];

    return Array.from(this.cache.values())
      .filter((candle) => candle.date >= from && candle.date <= to)
      .sort((a, b) => a.date.localeCompare(b.date));
  }

  async rollupLatestDay(): Promise<void> {
    await this.loadCache();

    const today = new Date(this.now());
    const todayStr = today.toISOString().split("T")[0];

    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().split("T")[0];

    try {
      const candles = await this.fetchDailyCandles(yesterday, today);

      for (const candle of candles) {
        if (candle.date === todayStr || candle.date === yesterdayStr) {
          this.cache.set(candle.date, {
            ...candle,
            method: "daily-rollup",
          });
        }
      }

      await this.saveCache();
    } catch (error) {
      console.error("Rollup error:", error);
    }
  }

  static getLaunchDate(): string {
    return LAUNCH_DATE;
  }
}
