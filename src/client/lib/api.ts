import type { CurrencyInfo, FeedState, HistoryPayload, PricePayload } from "../../shared/contracts.js";
import type { HistoryRange } from "../../shared/widget-config.js";
import {
  getStaticCurrencies,
  getStaticHistory,
  getStaticPrice,
  subscribeToStaticPrice,
} from "./static-market.js";

export const IS_STATIC_BUILD = import.meta.env.VITE_STATIC_BUILD === "true";

let currencyRequest: Promise<CurrencyInfo[]> | null = null;

async function getJson<T>(url: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(url, { headers: { Accept: "application/json" }, signal });
  if (!response.ok) {
    const error = (await response.json().catch(() => null)) as { message?: string } | null;
    throw new Error(error?.message ?? `Request failed (${response.status})`);
  }
  return response.json() as Promise<T>;
}

export function getPrice(currency: string, signal?: AbortSignal): Promise<PricePayload> {
  if (IS_STATIC_BUILD) return getStaticPrice(currency, signal);
  return getJson(`/api/price?currency=${encodeURIComponent(currency)}`, signal);
}

export function getHistory(
  currency: string,
  range: HistoryRange,
  signal?: AbortSignal,
): Promise<HistoryPayload> {
  if (IS_STATIC_BUILD) return getStaticHistory(currency, range, signal);
  return getJson(
    `/api/history?currency=${encodeURIComponent(currency)}&range=${encodeURIComponent(range)}`,
    signal,
  );
}

export function getCurrencies(signal?: AbortSignal): Promise<CurrencyInfo[]> {
  if (!currencyRequest) {
    const request = IS_STATIC_BUILD ? getStaticCurrencies() : getJson<CurrencyInfo[]>("/api/currencies", signal);
    currencyRequest = request.catch((error: unknown) => {
      currencyRequest = null;
      throw error;
    });
  }
  return currencyRequest;
}

export interface StreamStatusPayload {
  state: FeedState | "unavailable";
}

interface PriceSubscriptionHandlers {
  onPrice: (price: PricePayload) => void;
  onStatus: (state: FeedState | "unavailable") => void;
}

export function subscribeToPrice(currency: string, handlers: PriceSubscriptionHandlers): () => void {
  if (IS_STATIC_BUILD) return subscribeToStaticPrice(currency, handlers);

  const eventSource = new EventSource(`/api/stream?currency=${encodeURIComponent(currency)}`);
  eventSource.addEventListener("price", (event) => {
    try {
      handlers.onPrice(JSON.parse((event as MessageEvent<string>).data) as PricePayload);
    } catch {
      handlers.onStatus("degraded");
    }
  });
  eventSource.addEventListener("status", (event) => {
    try {
      const status = JSON.parse((event as MessageEvent<string>).data) as StreamStatusPayload;
      handlers.onStatus(status.state);
    } catch {
      handlers.onStatus("degraded");
    }
  });
  eventSource.onerror = () => handlers.onStatus("degraded");
  return () => eventSource.close();
}
