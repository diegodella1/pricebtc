import type { CurrencyInfo, FeedState, HistoryPayload, PricePayload } from "../../shared/contracts.js";
import type { HistoryRange } from "../../shared/widget-config.js";

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
  return getJson(`/api/price?currency=${encodeURIComponent(currency)}`, signal);
}

export function getHistory(
  currency: string,
  range: HistoryRange,
  signal?: AbortSignal,
): Promise<HistoryPayload> {
  return getJson(
    `/api/history?currency=${encodeURIComponent(currency)}&range=${encodeURIComponent(range)}`,
    signal,
  );
}

export function getCurrencies(signal?: AbortSignal): Promise<CurrencyInfo[]> {
  if (!currencyRequest) {
    currencyRequest = getJson<CurrencyInfo[]>("/api/currencies", signal).catch((error: unknown) => {
      currencyRequest = null;
      throw error;
    });
  }
  return currencyRequest;
}

export interface StreamStatusPayload {
  state: FeedState | "unavailable";
}
