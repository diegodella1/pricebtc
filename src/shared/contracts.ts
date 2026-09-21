import type { HistoryRange } from "./widget-config.js";

export type FeedState = "connecting" | "live" | "degraded" | "stopped";
export type DataFreshness = "live" | "stale" | "unavailable";

export interface MarketSnapshot {
  priceUsd: string;
  change24h: number;
  high24h?: string | null;
  low24h?: string | null;
  volume24h?: string | null;
  marketTimestamp: string;
  receivedAt: string;
  sequence: number | null;
}

export interface PricePayload {
  currency: string;
  price: string;
  priceUsd: string;
  change24h: number;
  high24h?: string | null;
  low24h?: string | null;
  volume24h?: string | null;
  volume24hUsd?: string | null;
  marketTimestamp: string;
  receivedAt: string;
  fxUpdatedAt: string | null;
  status: DataFreshness;
  source: "coinbase";
}

export interface PriceObservation extends PricePayload {
  asset: "Bitcoin";
  symbol: "BTC";
  sourceDetails: { name: "Coinbase Exchange"; market: "BTC-USD" };
  provider: { name: "PRICEB.TC"; url: "https://priceb.tc/" };
}

export interface HistoryPoint {
  timestamp: string;
  price: string;
  volume?: string;
}

export interface HistoryPayload {
  currency: string;
  range: HistoryRange;
  points: HistoryPoint[];
  cachedAt: string;
  source: "coinbase";
}

export interface CurrencyInfo {
  code: string;
  name: string;
  indicative: boolean;
}

export interface HealthPayload {
  status: "ok" | "degraded";
  uptimeSeconds: number;
  memoryRssMb: number;
  market: {
    state: FeedState;
    lastUpdateAt: string | null;
  };
  fx: {
    state: "live" | "stale" | "expired" | "unavailable";
    updatedAt: string | null;
  };
  streams: number;
}
