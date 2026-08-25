import { readFile, mkdir, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";

import Decimal from "decimal.js";
import { z } from "zod";

import type { CurrencyInfo } from "../../shared/contracts.js";

const FX_RESPONSE_SCHEMA = z
  .object({
    result: z.literal("success"),
    base_code: z.literal("USD"),
    time_last_update_unix: z.number().int().positive(),
    time_next_update_unix: z.number().int().positive(),
    rates: z.record(z.string().regex(/^[A-Z]{3}$/), z.number().positive()),
  })
  .passthrough();

const INDICATIVE_CURRENCIES = new Set(["ARS", "LYD", "SSP", "SYP", "VES", "YER", "ZWL"]);
const STALE_AFTER_MS = 36 * 60 * 60 * 1_000;
const EXPIRE_AFTER_MS = 7 * 24 * 60 * 60 * 1_000;
const RETRY_AFTER_MS = 60 * 60 * 1_000;

type Fetcher = typeof fetch;

interface FxCache {
  updatedAt: string;
  nextUpdateAt: string;
  rates: Record<string, number>;
}

interface FxServiceOptions {
  dataDir: string;
  apiUrl?: string;
  fetcher?: Fetcher;
  now?: () => number;
  logger?: Pick<Console, "info" | "warn" | "error">;
}

export class FxService {
  private readonly cachePath: string;
  private readonly apiUrl: string;
  private readonly fetcher: Fetcher;
  private readonly now: () => number;
  private readonly logger: Pick<Console, "info" | "warn" | "error">;
  private cache: FxCache | null = null;
  private refreshTimer: NodeJS.Timeout | null = null;

  constructor(options: FxServiceOptions) {
    this.cachePath = join(options.dataDir, "fx-rates.json");
    this.apiUrl = options.apiUrl ?? "https://open.er-api.com/v6/latest/USD";
    this.fetcher = options.fetcher ?? fetch;
    this.now = options.now ?? Date.now;
    this.logger = options.logger ?? console;
  }

  async start(): Promise<void> {
    await this.loadCache();
    try {
      await this.refresh();
    } catch (error) {
      this.logger.warn("FX refresh failed; using last valid cache", error);
      this.scheduleRefresh(RETRY_AFTER_MS);
    }
  }

  stop(): void {
    if (this.refreshTimer) clearTimeout(this.refreshTimer);
    this.refreshTimer = null;
  }

  convertUsd(priceUsd: string, requestedCurrency: string): string {
    const currency = requestedCurrency.toUpperCase();
    if (currency === "USD") return new Decimal(priceUsd).toString();

    const rate = this.getUsableRates()[currency];
    if (rate === undefined) throw new Error(`Unsupported currency: ${currency}`);
    return new Decimal(priceUsd).mul(rate).toSignificantDigits(16).toString();
  }

  supportsCurrency(requestedCurrency: string): boolean {
    const currency = requestedCurrency.toUpperCase();
    if (currency === "USD") return true;
    return this.getUsableRates()[currency] !== undefined;
  }

  getCurrencies(): CurrencyInfo[] {
    const displayNames = new Intl.DisplayNames(["en"], { type: "currency" });
    const codes = new Set(["USD", ...Object.keys(this.getUsableRates())]);

    return [...codes]
      .filter((code) => /^[A-Z]{3}$/.test(code))
      .map((code) => ({
        code,
        name: displayNames.of(code) ?? code,
        indicative: INDICATIVE_CURRENCIES.has(code),
      }))
      .sort((left, right) => {
        if (left.code === "USD") return -1;
        if (right.code === "USD") return 1;
        return left.name.localeCompare(right.name, "en");
      });
  }

  getStatus(): { state: "live" | "stale" | "expired" | "unavailable"; updatedAt: string | null } {
    if (!this.cache) return { state: "unavailable", updatedAt: null };
    const age = this.now() - Date.parse(this.cache.updatedAt);
    if (age <= STALE_AFTER_MS) return { state: "live", updatedAt: this.cache.updatedAt };
    if (age <= EXPIRE_AFTER_MS) return { state: "stale", updatedAt: this.cache.updatedAt };
    return { state: "expired", updatedAt: this.cache.updatedAt };
  }

  private getUsableRates(): Record<string, number> {
    if (!this.cache || this.getStatus().state === "expired") return { USD: 1 };
    return this.cache.rates;
  }

  private async refresh(): Promise<void> {
    const response = await this.fetcher(this.apiUrl, {
      headers: { Accept: "application/json", "User-Agent": "priceb.tc/1.0" },
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) throw new Error(`FX upstream returned ${response.status}`);

    const payload = FX_RESPONSE_SCHEMA.parse(await response.json());
    this.cache = {
      updatedAt: new Date(payload.time_last_update_unix * 1_000).toISOString(),
      nextUpdateAt: new Date(payload.time_next_update_unix * 1_000).toISOString(),
      rates: { ...payload.rates, USD: 1 },
    };
    await this.persistCache();

    const nextUpdateDelay = Date.parse(this.cache.nextUpdateAt) - this.now() + 5 * 60 * 1_000;
    this.scheduleRefresh(Math.max(RETRY_AFTER_MS, nextUpdateDelay));
    this.logger.info(`FX rates refreshed at ${this.cache.updatedAt}`);
  }

  private async loadCache(): Promise<void> {
    try {
      const parsed = JSON.parse(await readFile(this.cachePath, "utf8")) as unknown;
      const cached = z
        .object({
          updatedAt: z.string().datetime(),
          nextUpdateAt: z.string().datetime(),
          rates: z.record(z.string(), z.number().positive()),
        })
        .parse(parsed);
      this.cache = cached;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        this.logger.warn("Ignoring invalid FX cache", error);
      }
    }
  }

  private async persistCache(): Promise<void> {
    if (!this.cache) return;
    const directory = this.cachePath.slice(0, this.cachePath.lastIndexOf("/"));
    await mkdir(directory, { recursive: true });
    const temporaryPath = `${this.cachePath}.${process.pid}.tmp`;
    await writeFile(temporaryPath, `${JSON.stringify(this.cache)}\n`, { mode: 0o600 });
    await rename(temporaryPath, this.cachePath);
  }

  private scheduleRefresh(delayMs: number): void {
    if (this.refreshTimer) clearTimeout(this.refreshTimer);
    this.refreshTimer = setTimeout(() => {
      void this.refresh().catch((error: unknown) => {
        this.logger.warn("Scheduled FX refresh failed", error);
        this.scheduleRefresh(RETRY_AFTER_MS);
      });
    }, Math.min(delayMs, 24 * 60 * 60 * 1_000));
    this.refreshTimer.unref();
  }
}
