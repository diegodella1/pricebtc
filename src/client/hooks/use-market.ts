import { useEffect, useState } from "react";

import type { CurrencyInfo, FeedState, HistoryPoint, PricePayload } from "../../shared/contracts.js";
import type { HistoryRange } from "../../shared/widget-config.js";
import { getCurrencies, getHistory, getPrice, type StreamStatusPayload } from "../lib/api.js";

export type ClientConnectionState = FeedState | "unavailable";

export function useLivePrice(currency: string): {
  price: PricePayload | null;
  connectionState: ClientConnectionState;
  error: string | null;
} {
  const [price, setPrice] = useState<PricePayload | null>(null);
  const [connectionState, setConnectionState] = useState<ClientConnectionState>("connecting");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
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
      });

    const eventSource = new EventSource(`/api/stream?currency=${encodeURIComponent(currency)}`);
    eventSource.addEventListener("price", (event) => {
      if (!active) return;
      const nextPrice = JSON.parse((event as MessageEvent<string>).data) as PricePayload;
      setPrice(nextPrice);
      setConnectionState(nextPrice.status === "live" ? "live" : "degraded");
      setError(null);
    });
    eventSource.addEventListener("status", (event) => {
      if (!active) return;
      const status = JSON.parse((event as MessageEvent<string>).data) as StreamStatusPayload;
      setConnectionState(status.state);
    });
    eventSource.onerror = () => {
      if (active) setConnectionState("degraded");
    };

    return () => {
      active = false;
      controller.abort();
      eventSource.close();
    };
  }, [currency]);

  return { price, connectionState, error };
}

export function usePriceHistory(
  currency: string,
  range: HistoryRange,
  enabled = true,
): { points: HistoryPoint[]; loading: boolean } {
  const [points, setPoints] = useState<HistoryPoint[]>([]);
  const [loading, setLoading] = useState(enabled);

  useEffect(() => {
    if (!enabled) {
      setPoints([]);
      setLoading(false);
      return;
    }

    const controller = new AbortController();
    setLoading(true);
    void getHistory(currency, range, controller.signal)
      .then((history) => setPoints(history.points))
      .catch(() => setPoints([]))
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [currency, enabled, range]);

  return { points, loading };
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
