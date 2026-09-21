import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import Decimal from "decimal.js";
import { z } from "zod";

const amount = z.string().regex(/^\d+(?:\.\d+)?$/);
const tradeSchema = z.object({
  trade_id: z.number().int().nonnegative().safe(),
  side: z.enum(["buy", "sell"]),
  size: amount,
  time: z.string().datetime({ offset: true }),
});
const stateSchema = z.object({
  version: z.literal(1),
  lastTradeId: z.number().int().nonnegative().safe(),
  buckets: z.array(z.object({ minute: z.number().int().nonnegative(), buyVolume: amount, sellVolume: amount })).max(12000),
});
type Trade = z.infer<typeof tradeSchema>;
export interface RecordedVolume { buyVolume: string; sellVolume: string }
const RETENTION_MS = 8 * 24 * 60 * 60 * 1000;
const POLL_MS = 10_000;
const MAX_PAGES = 5;

interface Options {
  dataDir: string;
  apiUrl?: string;
  fetcher?: typeof fetch;
  now?: () => number;
}

/** Recorded taker-side BTC volume; never inferred from candle price direction. */
export class TradeVolumeService {
  private readonly buckets = new Map<number, RecordedVolume>();
  private readonly filename: string;
  private readonly fetcher: typeof fetch;
  private readonly now: () => number;
  private lastTradeId = 0;
  private timer: NodeJS.Timeout | null = null;
  private pending: Promise<void> | null = null;

  constructor(private readonly options: Options) {
    this.filename = join(options.dataDir, "trade-volume.json");
    this.fetcher = options.fetcher ?? fetch;
    this.now = options.now ?? Date.now;
  }

  async load(): Promise<void> {
    try {
      const state = stateSchema.parse(JSON.parse(await readFile(this.filename, "utf8")));
      this.lastTradeId = state.lastTradeId;
      for (const { minute, buyVolume, sellVolume } of state.buckets) this.buckets.set(minute, { buyVolume, sellVolume });
      this.prune();
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") console.warn("Trade volume cache unavailable; collecting recent trades again");
    }
  }

  async start(): Promise<void> {
    await this.load();
    const poll = () => { void this.refresh().catch(() => console.warn("Trade volume refresh failed; retaining recorded trades")); };
    poll();
    this.timer = setInterval(poll, POLL_MS);
    this.timer.unref();
  }

  async stop(): Promise<void> {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    await this.pending?.catch(() => undefined);
  }

  refresh(): Promise<void> {
    if (!this.pending) this.pending = this.collect().finally(() => { this.pending = null; });
    return this.pending;
  }

  getVolumes(granularitySeconds: number): Map<string, RecordedVolume> {
    this.prune();
    const grouped = new Map<string, RecordedVolume>();
    const interval = granularitySeconds * 1000;
    for (const [minute, volume] of this.buckets) {
      const timestamp = new Date(Math.floor(minute / interval) * interval).toISOString();
      const current = grouped.get(timestamp) ?? { buyVolume: "0", sellVolume: "0" };
      grouped.set(timestamp, {
        buyVolume: new Decimal(current.buyVolume).plus(volume.buyVolume).toFixed(),
        sellVolume: new Decimal(current.sellVolume).plus(volume.sellVolume).toFixed(),
      });
    }
    return grouped;
  }

  private async collect(): Promise<void> {
    const trades = new Map<number, Trade>();
    let cursor: string | null = null;
    for (let page = 0; page < MAX_PAGES; page++) {
      const url = new URL("/products/BTC-USD/trades", this.options.apiUrl ?? "https://api.exchange.coinbase.com");
      url.searchParams.set("limit", "1000");
      if (cursor) url.searchParams.set("after", cursor);
      const response = await this.fetcher(url, {
        headers: { Accept: "application/json", "User-Agent": "priceb.tc/1.0" },
        signal: AbortSignal.timeout(2000),
      });
      if (!response.ok) throw new Error(`Coinbase trades returned ${response.status}`);
      const batch = z.array(tradeSchema).max(1000).parse(await response.json());
      for (const trade of batch) if (trade.trade_id > this.lastTradeId) trades.set(trade.trade_id, trade);
      const nextCursor = response.headers.get("cb-after");
      if (!batch.length || batch.some(trade => trade.trade_id <= this.lastTradeId) || !nextCursor || nextCursor === cursor) break;
      cursor = nextCursor;
    }
    // Commit only after all requested pages succeed. Retrying cannot double-count.
    for (const trade of trades.values()) {
      const timestamp = Date.parse(trade.time);
      if (timestamp < this.now() - RETENTION_MS || timestamp > this.now() + 60_000) continue;
      const minute = Math.floor(timestamp / 60_000) * 60_000;
      const volume = this.buckets.get(minute) ?? { buyVolume: "0", sellVolume: "0" };
      // Coinbase REST side identifies the maker; the initiating (taker) side is opposite.
      const field = trade.side === "sell" ? "buyVolume" : "sellVolume";
      volume[field] = new Decimal(volume[field]).plus(trade.size).toFixed();
      this.buckets.set(minute, volume);
    }
    for (const id of trades.keys()) this.lastTradeId = Math.max(this.lastTradeId, id);
    this.prune();
    await mkdir(this.options.dataDir, { recursive: true });
    const state = { version: 1, lastTradeId: this.lastTradeId, buckets: [...this.buckets].map(([minute, volume]) => ({ minute, ...volume })) };
    await writeFile(`${this.filename}.tmp`, JSON.stringify(state), { mode: 0o600 });
    await rename(`${this.filename}.tmp`, this.filename);
  }

  private prune(): void {
    for (const minute of this.buckets.keys()) if (minute < this.now() - RETENTION_MS) this.buckets.delete(minute);
  }
}
