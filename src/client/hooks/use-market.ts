import { useEffect, useState } from "react";

import type { CurrencyInfo, FeedState, HistoryPoint, PricePayload } from "../../shared/contracts.js";
import type { HistoryRange } from "../../shared/widget-config.js";
import { getCurrencies, getHistory, getPrice, subscribeToPrice } from "../lib/api.js";

export type ClientConnectionState = FeedState | "unavailable";

function initialPrice(currency: string): PricePayload | null {
  if (currency !== "USD") return null;
  const raw = document.getElementById("initial-price")?.getAttribute("data-price");
  if (!raw) return null;
  try {
    const price = JSON.parse(raw) as PricePayload;
    if (price.currency !== currency || !Number.isFinite(Number(price.price)) || !Number.isFinite(Date.parse(price.receivedAt))) return null;
    return { ...price, status: Date.now() - Date.parse(price.receivedAt) > 15_000 ? "stale" : price.status };
  } catch { return null; }
}

// React replaces the fallback root; retain its observation before the first render.
const bootstrapPrice = typeof document === "undefined" ? null : initialPrice("USD");
function priceForCurrency(currency: string): PricePayload | null {
  if (currency !== "USD" || !bootstrapPrice) return null;
  return { ...bootstrapPrice, status: Date.now() - Date.parse(bootstrapPrice.receivedAt) > 15_000 ? "stale" : bootstrapPrice.status };
}

export function useLivePrice(currency: string): {
  price: PricePayload | null;
  connectionState: ClientConnectionState;
  error: string | null;
} {
  const [price, setPrice] = useState<PricePayload | null>(() => priceForCurrency(currency));
  const [connectionState, setConnectionState] = useState<ClientConnectionState>("connecting");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    setPrice(priceForCurrency(currency));
    setConnectionState("connecting");
    setError(null);

    void getPrice(currency, controller.signal)
      .then((snapshot) => {
        if (!active) return;
        setPrice(snapshot);
        setConnectionState(snapshot.status === "live" ? "live" : "degraded");
      })
      .catch((requestError: unknown) => {
        if (!active || controller.signal.aborted) return;
        setError(requestError instanceof Error ? requestError.message : "Price unavailable");
        setConnectionState("unavailable");
      });

    const unsubscribe = subscribeToPrice(currency, {
      onPrice: (nextPrice) => {
        if (!active) return;
        setPrice(nextPrice);
        setConnectionState(nextPrice.status === "live" ? "live" : "degraded");
        setError(null);
      },
      onStatus: (state) => {
        if (active) setConnectionState(state);
      },
    });

    return () => {
      active = false;
      controller.abort();
      unsubscribe();
    };
  }, [currency]);

  return { price, connectionState, error };
}

export function usePriceHistory(
  currency: string,
  range: HistoryRange,
  enabled = true,
): { points: HistoryPoint[]; loading: boolean; error: string | null } {
  const [points, setPoints] = useState<HistoryPoint[]>([]);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled) {
      setPoints([]);
      setLoading(false);
      setError(null);
      return;
    }

    const controller = new AbortController();
    setPoints([]);
    setLoading(true);
    setError(null);
    let pending = false;
    const refresh = async () => {
      if (pending || controller.signal.aborted) return;
      pending = true;
      try {
        const history = await getHistory(currency, range, controller.signal);
        if (controller.signal.aborted) return;
        setPoints(history.points);
        setError(null);
      } catch (requestError) {
        if (!controller.signal.aborted) setError(requestError instanceof Error ? requestError.message : "History unavailable");
      } finally {
        pending = false;
        if (!controller.signal.aborted) setLoading(false);
      }
    };
    void refresh();
    const timer = window.setInterval(() => { void refresh(); }, 30_000);
    return () => { controller.abort(); window.clearInterval(timer); };
  }, [currency, enabled, range]);

  return { points, loading, error };
}

export function useCurrencies(): { currencies: CurrencyInfo[]; loading: boolean } {
  const [currencies, setCurrencies] = useState<CurrencyInfo[]>([
    { code: "USD", name: "US Dollar", indicative: false },
  ]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();
    void getCurrencies(controller.signal)
      .then(setCurrencies)
      .catch(() => undefined)
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, []);

  return { currencies, loading };
}
