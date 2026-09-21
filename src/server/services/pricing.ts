import type { MarketSnapshot, PriceObservation } from "../../shared/contracts.js";

const LIVE_WINDOW_MS = 15_000;

interface CreatePricePayloadOptions {
  snapshot: MarketSnapshot;
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
  const volume24h = options.snapshot.volume24h;
  const volume24hUsd = options.snapshot.volume24h && options.snapshot.priceUsd
    ? String(Number(options.snapshot.volume24h) * Number(options.snapshot.priceUsd))
    : null;

  return {
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
    volume24hUsd: options.currency === "USD" ? volume24hUsd : null,
    marketTimestamp: options.snapshot.marketTimestamp,
    receivedAt: options.snapshot.receivedAt,
    fxUpdatedAt: options.fxUpdatedAt,
    status: ageMs <= LIVE_WINDOW_MS ? "live" : "stale",
    source: "coinbase",
  };
}
