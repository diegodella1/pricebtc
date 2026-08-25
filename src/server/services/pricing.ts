import type { MarketSnapshot, PricePayload } from "../../shared/contracts.js";

const LIVE_WINDOW_MS = 15_000;

interface CreatePricePayloadOptions {
  snapshot: MarketSnapshot;
  currency: string;
  convertUsd: (priceUsd: string) => string;
  fxUpdatedAt: string | null;
  now?: () => number;
}

export function createPricePayload(options: CreatePricePayloadOptions): PricePayload {
  const now = options.now ?? Date.now;
  const ageMs = now() - Date.parse(options.snapshot.receivedAt);

  return {
    currency: options.currency,
    price: options.convertUsd(options.snapshot.priceUsd),
    priceUsd: options.snapshot.priceUsd,
    change24h: options.snapshot.change24h,
    marketTimestamp: options.snapshot.marketTimestamp,
    receivedAt: options.snapshot.receivedAt,
    fxUpdatedAt: options.fxUpdatedAt,
    status: ageMs <= LIVE_WINDOW_MS ? "live" : "stale",
    source: "coinbase",
  };
}
