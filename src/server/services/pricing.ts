import type { MarketSnapshot, PriceObservation } from "../../shared/contracts.js";

const LIVE_WINDOW_MS = 15_000;

interface CreatePricePayloadOptions {
  snapshot: MarketSnapshot & {
    method?: "vwap" | "single-venue-fallback" | "coinbase-only";
    degraded?: boolean;
    sources?: Array<{
      id: string;
      pair: string;
      price: string;
      volume24h?: string | null;
      weight?: number;
      weightSource?: "24h";
      ok: boolean;
      excluded?: boolean;
      excludeReason?: string;
      quote?: string;
      asOf: string;
    }>;
  };
  currency: string;
  convertUsd: (priceUsd: string) => string;
  fxUpdatedAt: string | null;
  now?: () => number;
}

export function createPricePayload(options: CreatePricePayloadOptions): PriceObservation {
  const now = options.now ?? Date.now;
  const ageMs = now() - Date.parse(options.snapshot.receivedAt);

  const high24h = options.snapshot.high24h ? options.convertUsd(options.snapshot.high24h) : null;
  const low24h = options.snapshot.low24h ? options.convertUsd(options.snapshot.low24h) : null;
  const volume24h = options.snapshot.volume24h ?? null;
  const volume24hUsd =
    options.snapshot.volume24h && options.snapshot.priceUsd
      ? String(Number(options.snapshot.volume24h) * Number(options.snapshot.priceUsd))
      : null;

  const isIndexMethod = options.snapshot.method === "vwap";
  const isFallback = options.snapshot.method === "single-venue-fallback";

  let source: "coinbase" | "index" = "coinbase";
  if (isIndexMethod && !options.snapshot.degraded) {
    source = "index";
  } else if (isFallback) {
    const coinbaseFallback = options.snapshot.sources?.some((s) => s.id === "coinbase" && s.ok);
    source = coinbaseFallback ? "coinbase" : "index";
  }

  const basePayload: PriceObservation = {
    asset: "Bitcoin",
    symbol: "BTC",
    sourceDetails: { name: "Coinbase Exchange", market: "BTC-USD" },
    provider: { name: "PRICEB.TC", url: "https://priceb.tc/" },
    currency: options.currency,
    price: options.convertUsd(options.snapshot.priceUsd),
    priceUsd: options.snapshot.priceUsd,
    change24h: options.snapshot.change24h,
    high24h,
    low24h,
    volume24h,
    volume24hUsd: options.currency === "USD" ? volume24hUsd : undefined,
    marketTimestamp: options.snapshot.marketTimestamp,
    receivedAt: options.snapshot.receivedAt,
    fxUpdatedAt: options.fxUpdatedAt,
    status: ageMs <= LIVE_WINDOW_MS ? "live" : "stale",
    source,
  };

  if (isIndexMethod || isFallback) {
    basePayload.method = options.snapshot.method;
    basePayload.degraded = options.snapshot.degraded ?? false;
    basePayload.sources = options.snapshot.sources;
  }

  return basePayload;
}
