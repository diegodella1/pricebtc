import type {
  CurrencyInfo,
  FeedState,
  HistoryPayload,
  PricePayload,
} from "../../shared/contracts.js";
import type { HistoryRange } from "../../shared/widget-config.js";

const COINBASE_API_URL = "https://api.exchange.coinbase.com";
const COINBASE_WS_URL = "wss://ws-feed.exchange.coinbase.com";
const FX_API_URL = "https://open.er-api.com/v6/latest/USD";
const FX_STORAGE_KEY = "pricebtc:fx:v1";
const FX_MAX_STALE_MS = 7 * 24 * 60 * 60 * 1_000;
const HEARTBEAT_TIMEOUT_MS = 30_000;
const FALLBACK_INTERVAL_MS = 15_000;
const MAX_RECONNECT_DELAY_MS = 30_000;
const EMIT_INTERVAL_MS = 1_000;

const INDICATIVE_CURRENCIES = new Set(["ARS", "LYD", "SSP", "SYP", "VES", "YER", "ZWL"]);
const RANGE_CONFIG: Record<HistoryRange, { seconds: number; granularity: number }> = {
  "1h": { seconds: 60 * 60, granularity: 60 },
  "24h": { seconds: 24 * 60 * 60, granularity: 300 },
  "7d": { seconds: 7 * 24 * 60 * 60, granularity: 3_600 },
};

interface FxCache {
  updatedAt: string;
  nextUpdateAt: string;
  rates: Record<string, number>;
}

interface CoinbaseTicker {
  price: string;
  time: string;
  open24h?: string;
}

interface StaticSubscriptionHandlers {
  onPrice: (price: PricePayload) => void;
  onStatus: (state: FeedState | "unavailable") => void;
}

let fxMemoryCache: FxCache | null = null;
let fxRequest: Promise<FxCache> | null = null;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isNumericString(value: unknown): value is string {
  return typeof value === "string" && /^\d+(?:\.\d+)?$/.test(value);
}

async function getJson(url: string, signal?: AbortSignal): Promise<unknown> {
  const response = await fetch(url, { headers: { Accept: "application/json" }, signal });
  if (!response.ok) throw new Error(`Upstream request failed (${response.status})`);
  return response.json() as Promise<unknown>;
}

function parseTicker(value: unknown, requireOpen = false): CoinbaseTicker {
  if (!isRecord(value) || !isNumericString(value.price) || typeof value.time !== "string") {
    throw new Error("Invalid Coinbase ticker payload");
  }
  const open24h = value.open_24h;
  if (requireOpen && !isNumericString(open24h)) throw new Error("Invalid Coinbase ticker payload");
  return { price: value.price, time: value.time, open24h: isNumericString(open24h) ? open24h : undefined };
}

function parseOpen(value: unknown): string {
  if (!isRecord(value) || !isNumericString(value.open)) throw new Error("Invalid Coinbase stats payload");
  return value.open;
}

function parseFx(value: unknown): FxCache {
  if (
    !isRecord(value) ||
    value.result !== "success" ||
    value.base_code !== "USD" ||
    typeof value.time_last_update_unix !== "number" ||
    typeof value.time_next_update_unix !== "number" ||
    !isRecord(value.rates)
  ) {
    throw new Error("Invalid exchange-rate payload");
  }

  const rates: Record<string, number> = { USD: 1 };
  for (const [code, rate] of Object.entries(value.rates)) {
    if (/^[A-Z]{3}$/.test(code) && typeof rate === "number" && Number.isFinite(rate) && rate > 0) {
      rates[code] = rate;
    }
  }

  return {
    updatedAt: new Date(value.time_last_update_unix * 1_000).toISOString(),
    nextUpdateAt: new Date(value.time_next_update_unix * 1_000).toISOString(),
    rates,
  };
}

function readFxCache(): FxCache | null {
  if (fxMemoryCache) return fxMemoryCache;
  try {
    const raw = localStorage.getItem(FX_STORAGE_KEY);
    if (!raw) return null;
    const value = JSON.parse(raw) as unknown;
    if (!isRecord(value) || typeof value.updatedAt !== "string" || typeof value.nextUpdateAt !== "string" || !isRecord(value.rates)) {
      return null;
    }
    const rates: Record<string, number> = {};
    for (const [code, rate] of Object.entries(value.rates)) {
      if (/^[A-Z]{3}$/.test(code) && typeof rate === "number" && Number.isFinite(rate) && rate > 0) {
        rates[code] = rate;
      }
    }
    if (Object.keys(rates).length === 0 || !Number.isFinite(Date.parse(value.updatedAt))) return null;
    fxMemoryCache = { updatedAt: value.updatedAt, nextUpdateAt: value.nextUpdateAt, rates };
    return fxMemoryCache;
  } catch {
    return null;
  }
}

function writeFxCache(cache: FxCache): void {
  fxMemoryCache = cache;
  try {
    localStorage.setItem(FX_STORAGE_KEY, JSON.stringify(cache));
  } catch {
    // Storage can be unavailable in private browsing or sandboxed embeds.
  }
}

function isCurrentFxCache(cache: FxCache): boolean {
  const nextUpdate = Date.parse(cache.nextUpdateAt);
  return Number.isFinite(nextUpdate) && Date.now() < nextUpdate + 5 * 60 * 1_000;
}

function isUsableFxCache(cache: FxCache): boolean {
  const updatedAt = Date.parse(cache.updatedAt);
  return Number.isFinite(updatedAt) && Date.now() - updatedAt <= FX_MAX_STALE_MS;
}

async function getFxCache(): Promise<FxCache> {
  const cached = readFxCache();
  if (cached && isCurrentFxCache(cached)) return cached;
  if (fxRequest) return fxRequest;

  fxRequest = getJson(FX_API_URL)
    .then(parseFx)
    .then((fresh) => {
      writeFxCache(fresh);
      return fresh;
    })
    .catch((error: unknown) => {
      if (cached && isUsableFxCache(cached)) return cached;
      throw error;
    })
    .finally(() => {
      fxRequest = null;
    });
  return fxRequest;
}

async function getFxRate(currency: string): Promise<{ rate: number; updatedAt: string | null }> {
  if (currency === "USD") return { rate: 1, updatedAt: null };
  const fx = await getFxCache();
  const rate = fx.rates[currency];
  if (rate === undefined) throw new Error(`Unsupported currency: ${currency}`);
  return { rate, updatedAt: fx.updatedAt };
}

function convertUsd(priceUsd: string, rate: number): string {
  const converted = Number(priceUsd) * rate;
  if (!Number.isFinite(converted)) throw new Error("Invalid converted price");
  return String(Number(converted.toPrecision(15)));
}

function createPricePayload(
  ticker: CoinbaseTicker,
  open24h: string,
  currency: string,
  rate: number,
  fxUpdatedAt: string | null,
): PricePayload {
  const price = Number(ticker.price);
  const open = Number(open24h);
  const change24h = open === 0 ? 0 : ((price - open) / open) * 100;
  return {
    currency,
    price: convertUsd(ticker.price, rate),
    priceUsd: ticker.price,
    change24h,
    marketTimestamp: ticker.time,
    receivedAt: new Date().toISOString(),
    fxUpdatedAt,
    status: "live",
    source: "coinbase",
  };
}

export async function getStaticPrice(currency: string, signal?: AbortSignal): Promise<PricePayload> {
  const normalizedCurrency = currency.toUpperCase();
  const [tickerValue, statsValue, fx] = await Promise.all([
    getJson(`${COINBASE_API_URL}/products/BTC-USD/ticker`, signal),
    getJson(`${COINBASE_API_URL}/products/BTC-USD/stats`, signal),
    getFxRate(normalizedCurrency),
  ]);
  return createPricePayload(
    parseTicker(tickerValue),
    parseOpen(statsValue),
    normalizedCurrency,
    fx.rate,
    fx.updatedAt,
  );
}

export async function getStaticHistory(
  currency: string,
  range: HistoryRange,
  signal?: AbortSignal,
): Promise<HistoryPayload> {
  const normalizedCurrency = currency.toUpperCase();
  const config = RANGE_CONFIG[range];
  const end = new Date();
  const start = new Date(end.getTime() - config.seconds * 1_000);
  const url = new URL(`${COINBASE_API_URL}/products/BTC-USD/candles`);
  url.searchParams.set("start", start.toISOString());
  url.searchParams.set("end", end.toISOString());
  url.searchParams.set("granularity", String(config.granularity));

  const [value, fx] = await Promise.all([getJson(url.toString(), signal), getFxRate(normalizedCurrency)]);
  if (!Array.isArray(value)) throw new Error("Invalid Coinbase candle payload");

  const points = value
    .flatMap((candidate) => {
      if (
        !Array.isArray(candidate) ||
        candidate.length < 5 ||
        typeof candidate[0] !== "number" ||
        typeof candidate[4] !== "number" ||
        !Number.isFinite(candidate[0]) ||
        !Number.isFinite(candidate[4])
      ) {
        return [];
      }
      return [{ timestamp: new Date(candidate[0] * 1_000).toISOString(), price: convertUsd(String(candidate[4]), fx.rate) }];
    })
    .sort((left, right) => left.timestamp.localeCompare(right.timestamp));

  return {
    currency: normalizedCurrency,
    range,
    points,
    cachedAt: new Date().toISOString(),
    source: "coinbase",
  };
}

export async function getStaticCurrencies(): Promise<CurrencyInfo[]> {
  const fx = await getFxCache();
  const displayNames = new Intl.DisplayNames(["en"], { type: "currency" });
  return Object.keys(fx.rates)
    .map((code) => {
      let name = code;
      try {
        name = displayNames.of(code) ?? code;
      } catch {
        // Keep code when browser does not recognize a currency name.
      }
      return { code, name, indicative: INDICATIVE_CURRENCIES.has(code) };
    })
    .sort((left, right) => {
      if (left.code === "USD") return -1;
      if (right.code === "USD") return 1;
      return left.name.localeCompare(right.name, "en");
    });
}

export function subscribeToStaticPrice(currency: string, handlers: StaticSubscriptionHandlers): () => void {
  const normalizedCurrency = currency.toUpperCase();
  let active = true;
  let socket: WebSocket | null = null;
  let reconnectAttempts = 0;
  let reconnectTimer: number | null = null;
  let heartbeatTimer: number | null = null;
  let fallbackTimer: number | null = null;
  let emissionTimer: number | null = null;
  let lastMessageAt = 0;
  let lastEmissionAt = 0;
  let pendingPrice: PricePayload | null = null;

  function emitPrice(payload: PricePayload): void {
    const elapsed = Date.now() - lastEmissionAt;
    if (elapsed >= EMIT_INTERVAL_MS) {
      if (emissionTimer !== null) window.clearTimeout(emissionTimer);
      emissionTimer = null;
      pendingPrice = null;
      lastEmissionAt = Date.now();
      handlers.onPrice(payload);
      return;
    }
    pendingPrice = payload;
    if (emissionTimer !== null) return;
    emissionTimer = window.setTimeout(() => {
      emissionTimer = null;
      if (!active || !pendingPrice) return;
      const nextPrice = pendingPrice;
      pendingPrice = null;
      lastEmissionAt = Date.now();
      handlers.onPrice(nextPrice);
    }, EMIT_INTERVAL_MS - elapsed);
  }

  function stopFallback(): void {
    if (fallbackTimer !== null) window.clearInterval(fallbackTimer);
    fallbackTimer = null;
  }

  function startFallback(): void {
    if (fallbackTimer !== null) return;
    const refresh = () => {
      void getStaticPrice(normalizedCurrency)
        .then((price) => {
          if (!active) return;
          emitPrice(price);
          handlers.onStatus("degraded");
        })
        .catch(() => {
          if (active) handlers.onStatus("unavailable");
        });
    };
    refresh();
    fallbackTimer = window.setInterval(refresh, FALLBACK_INTERVAL_MS);
  }

  void getFxRate(normalizedCurrency)
    .then(({ rate, updatedAt }) => {
      if (!active) return;

      const connect = () => {
        if (!active || socket) return;
        handlers.onStatus("connecting");
        let nextSocket: WebSocket;
        try {
          nextSocket = new WebSocket(COINBASE_WS_URL);
        } catch {
          handlers.onStatus("degraded");
          startFallback();
          return;
        }
        socket = nextSocket;

        nextSocket.addEventListener("open", () => {
          if (!active || socket !== nextSocket) return;
          reconnectAttempts = 0;
          lastMessageAt = Date.now();
          nextSocket.send(JSON.stringify({ type: "subscribe", product_ids: ["BTC-USD"], channels: ["ticker", "heartbeat"] }));
          if (heartbeatTimer !== null) window.clearInterval(heartbeatTimer);
          heartbeatTimer = window.setInterval(() => {
            if (Date.now() - lastMessageAt > HEARTBEAT_TIMEOUT_MS) nextSocket.close(4_000, "Heartbeat timeout");
          }, 10_000);
        });

        nextSocket.addEventListener("message", (event) => {
          if (!active || socket !== nextSocket || typeof event.data !== "string") return;
          lastMessageAt = Date.now();
          let value: unknown;
          try {
            value = JSON.parse(event.data) as unknown;
          } catch {
            return;
          }
          if (!isRecord(value) || value.type !== "ticker" || value.product_id !== "BTC-USD") return;
          try {
            const ticker = parseTicker(value, true);
            emitPrice(createPricePayload(ticker, ticker.open24h ?? ticker.price, normalizedCurrency, rate, updatedAt));
            stopFallback();
            handlers.onStatus("live");
          } catch {
            // Ignore malformed or newly introduced message variants.
          }
        });

        nextSocket.addEventListener("error", () => {
          if (!active || socket !== nextSocket) return;
          handlers.onStatus("degraded");
          startFallback();
        });

        nextSocket.addEventListener("close", () => {
          if (socket !== nextSocket) return;
          socket = null;
          if (heartbeatTimer !== null) window.clearInterval(heartbeatTimer);
          heartbeatTimer = null;
          if (!active) return;
          handlers.onStatus("degraded");
          startFallback();
          const baseDelay = Math.min(MAX_RECONNECT_DELAY_MS, 1_000 * 2 ** reconnectAttempts);
          reconnectAttempts += 1;
          reconnectTimer = window.setTimeout(() => {
            reconnectTimer = null;
            connect();
          }, baseDelay + Math.round(baseDelay * 0.2 * Math.random()));
        });
      };

      connect();
    })
    .catch(() => {
      if (!active) return;
      handlers.onStatus("unavailable");
      startFallback();
    });

  return () => {
    active = false;
    if (reconnectTimer !== null) window.clearTimeout(reconnectTimer);
    if (heartbeatTimer !== null) window.clearInterval(heartbeatTimer);
    if (fallbackTimer !== null) window.clearInterval(fallbackTimer);
    if (emissionTimer !== null) window.clearTimeout(emissionTimer);
    socket?.close(1_000, "Page closed");
    socket = null;
  };
}
