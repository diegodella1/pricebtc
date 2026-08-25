import { EventEmitter } from "node:events";

import Decimal from "decimal.js";
import WebSocket, { type RawData } from "ws";
import { z } from "zod";

import type { FeedState, MarketSnapshot } from "../../shared/contracts.js";

const TICKER_SCHEMA = z
  .object({
    type: z.literal("ticker"),
    product_id: z.literal("BTC-USD"),
    price: z.string().regex(/^\d+(?:\.\d+)?$/),
    open_24h: z.string().regex(/^\d+(?:\.\d+)?$/),
    time: z.string(),
    sequence: z.number().int().nonnegative().optional(),
  })
  .passthrough();

const REST_TICKER_SCHEMA = z
  .object({
    price: z.string().regex(/^\d+(?:\.\d+)?$/),
    time: z.string(),
  })
  .passthrough();

const REST_STATS_SCHEMA = z
  .object({
    open: z.string().regex(/^\d+(?:\.\d+)?$/),
  })
  .passthrough();

const HEARTBEAT_TIMEOUT_MS = 30_000;
const FALLBACK_INTERVAL_MS = 15_000;
const MAX_RECONNECT_DELAY_MS = 30_000;

type Fetcher = typeof fetch;
type SocketFactory = (url: string) => WebSocket;
type MarketListener = (snapshot: MarketSnapshot) => void;
type StatusListener = (state: FeedState) => void;

interface MarketServiceOptions {
  wsUrl?: string;
  apiUrl?: string;
  fetcher?: Fetcher;
  socketFactory?: SocketFactory;
  now?: () => number;
  random?: () => number;
  logger?: Pick<Console, "info" | "warn" | "error">;
}

export function parseTickerMessage(rawMessage: string, receivedAt: string): MarketSnapshot | null {
  let decoded: unknown;
  try {
    decoded = JSON.parse(rawMessage);
  } catch {
    return null;
  }

  const parsed = TICKER_SCHEMA.safeParse(decoded);
  if (!parsed.success) return null;

  const price = new Decimal(parsed.data.price);
  const open = new Decimal(parsed.data.open_24h);
  if (open.isZero()) return null;

  return {
    priceUsd: parsed.data.price,
    change24h: price.minus(open).div(open).mul(100).toNumber(),
    marketTimestamp: parsed.data.time,
    receivedAt,
    sequence: parsed.data.sequence ?? null,
  };
}

export class MarketService {
  private readonly wsUrl: string;
  private readonly apiUrl: string;
  private readonly fetcher: Fetcher;
  private readonly socketFactory: SocketFactory;
  private readonly now: () => number;
  private readonly random: () => number;
  private readonly logger: Pick<Console, "info" | "warn" | "error">;
  private readonly events = new EventEmitter();

  private socket: WebSocket | null = null;
  private snapshot: MarketSnapshot | null = null;
  private state: FeedState = "stopped";
  private stopping = false;
  private reconnectAttempts = 0;
  private lastMessageAt = 0;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private heartbeatTimer: NodeJS.Timeout | null = null;
  private fallbackTimer: NodeJS.Timeout | null = null;
  private fallbackRequestActive = false;

  constructor(options: MarketServiceOptions = {}) {
    this.wsUrl = options.wsUrl ?? "wss://ws-feed.exchange.coinbase.com";
    this.apiUrl = options.apiUrl ?? "https://api.exchange.coinbase.com";
    this.fetcher = options.fetcher ?? fetch;
    this.socketFactory =
      options.socketFactory ??
      ((url) => new WebSocket(url, { handshakeTimeout: 10_000, maxPayload: 1_048_576, perMessageDeflate: false }));
    this.now = options.now ?? Date.now;
    this.random = options.random ?? Math.random;
    this.logger = options.logger ?? console;
  }

  async start(): Promise<void> {
    if (this.state !== "stopped") return;
    this.stopping = false;
    this.setState("connecting");
    await this.refreshFromRest().catch((error: unknown) => {
      this.logger.warn("Initial Coinbase snapshot failed", error);
    });
    this.connect();
  }

  stop(): void {
    this.stopping = true;
    this.clearTimers();
    const socket = this.socket;
    this.socket = null;
    if (socket && socket.readyState !== WebSocket.CLOSED) socket.close(1000, "Service stopping");
    this.setState("stopped");
  }

  getSnapshot(): MarketSnapshot | null {
    return this.snapshot ? { ...this.snapshot } : null;
  }

  getState(): FeedState {
    return this.state;
  }

  onPrice(listener: MarketListener): () => void {
    this.events.on("price", listener);
    return () => this.events.off("price", listener);
  }

  onStatus(listener: StatusListener): () => void {
    this.events.on("status", listener);
    return () => this.events.off("status", listener);
  }

  private connect(): void {
    if (this.stopping || this.socket) return;
    this.setState("connecting");

    try {
      const socket = this.socketFactory(this.wsUrl);
      this.socket = socket;

      socket.on("open", () => this.handleOpen(socket));
      socket.on("message", (data) => this.handleMessage(data));
      socket.on("error", (error) => this.logger.warn("Coinbase WebSocket error", error));
      socket.on("close", (code, reason) => this.handleClose(socket, code, reason.toString()));
    } catch (error) {
      this.logger.warn("Coinbase WebSocket connection failed", error);
      this.socket = null;
      this.handleDisconnected();
    }
  }

  private handleOpen(socket: WebSocket): void {
    this.reconnectAttempts = 0;
    this.lastMessageAt = this.now();
    socket.send(
      JSON.stringify({
        type: "subscribe",
        product_ids: ["BTC-USD"],
        channels: ["ticker", "heartbeat"],
      }),
    );
    this.startHeartbeatWatchdog(socket);
    this.logger.info("Coinbase WebSocket connected");
  }

  private handleMessage(data: RawData): void {
    this.lastMessageAt = this.now();
    const snapshot = parseTickerMessage(data.toString(), new Date(this.now()).toISOString());
    if (!snapshot) return;

    this.snapshot = snapshot;
    this.stopFallbackPolling();
    this.setState("live");
    this.events.emit("price", this.getSnapshot());
  }

  private handleClose(socket: WebSocket, code: number, reason: string): void {
    if (this.socket !== socket) return;
    this.socket = null;
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    this.heartbeatTimer = null;

    if (this.stopping) return;
    this.logger.warn(`Coinbase WebSocket closed (${code}): ${reason || "no reason"}`);
    this.handleDisconnected();
  }

  private handleDisconnected(): void {
    this.setState("degraded");
    this.startFallbackPolling();
    this.scheduleReconnect();
  }

  private scheduleReconnect(): void {
    if (this.stopping || this.reconnectTimer) return;
    const exponentialDelay = Math.min(MAX_RECONNECT_DELAY_MS, 1_000 * 2 ** this.reconnectAttempts);
    const jitter = Math.round(exponentialDelay * 0.2 * this.random());
    this.reconnectAttempts += 1;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, exponentialDelay + jitter);
    this.reconnectTimer.unref();
  }

  private startHeartbeatWatchdog(socket: WebSocket): void {
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    this.heartbeatTimer = setInterval(() => {
      if (this.now() - this.lastMessageAt > HEARTBEAT_TIMEOUT_MS) {
        this.logger.warn("Coinbase heartbeat timed out; reconnecting");
        socket.terminate();
      }
    }, 10_000);
    this.heartbeatTimer.unref();
  }

  private startFallbackPolling(): void {
    if (this.fallbackTimer) return;
    this.runFallbackRefresh();
    this.fallbackTimer = setInterval(() => this.runFallbackRefresh(), FALLBACK_INTERVAL_MS);
    this.fallbackTimer.unref();
  }

  private runFallbackRefresh(): void {
    void this.refreshFromRest().catch((error: unknown) => {
      this.logger.warn("Coinbase REST fallback failed", error);
    });
  }

  private stopFallbackPolling(): void {
    if (this.fallbackTimer) clearInterval(this.fallbackTimer);
    this.fallbackTimer = null;
  }

  private async refreshFromRest(): Promise<void> {
    if (this.fallbackRequestActive) return;
    this.fallbackRequestActive = true;

    try {
      const requestOptions = {
        headers: { Accept: "application/json", "User-Agent": "priceb.tc/1.0" },
        signal: AbortSignal.timeout(10_000),
      };
      const [tickerResponse, statsResponse] = await Promise.all([
        this.fetcher(`${this.apiUrl}/products/BTC-USD/ticker`, requestOptions),
        this.fetcher(`${this.apiUrl}/products/BTC-USD/stats`, requestOptions),
      ]);
      if (!tickerResponse.ok || !statsResponse.ok) {
        throw new Error(`Coinbase REST returned ${tickerResponse.status}/${statsResponse.status}`);
      }

      const ticker = REST_TICKER_SCHEMA.parse(await tickerResponse.json());
      const stats = REST_STATS_SCHEMA.parse(await statsResponse.json());
      const price = new Decimal(ticker.price);
      const open = new Decimal(stats.open);
      const receivedAt = new Date(this.now()).toISOString();
      this.snapshot = {
        priceUsd: ticker.price,
        change24h: open.isZero() ? 0 : price.minus(open).div(open).mul(100).toNumber(),
        marketTimestamp: ticker.time,
        receivedAt,
        sequence: null,
      };
      this.events.emit("price", this.getSnapshot());
    } finally {
      this.fallbackRequestActive = false;
    }
  }

  private setState(state: FeedState): void {
    if (state === this.state) return;
    this.state = state;
    this.events.emit("status", state);
  }

  private clearTimers(): void {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    if (this.fallbackTimer) clearInterval(this.fallbackTimer);
    this.reconnectTimer = null;
    this.heartbeatTimer = null;
    this.fallbackTimer = null;
  }
}
