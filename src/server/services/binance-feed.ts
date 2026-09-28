import { EventEmitter } from "node:events";

import WebSocket, { type RawData } from "ws";
import { z } from "zod";

import { BaseVenueFeed, type VenueSnapshot } from "./venue-feed.js";

const MINI_TICKER_SCHEMA = z.object({
  e: z.literal("24hrMiniTicker"),
  s: z.literal("BTCUSDT"),
  c: z.string().regex(/^\d+(?:\.\d+)?$/),
  E: z.number(),
});

const TICKER_24H_SCHEMA = z.object({
  symbol: z.literal("BTCUSDT"),
  lastPrice: z.string().regex(/^\d+(?:\.\d+)?$/),
  volume: z.string().regex(/^\d+(?:\.\d+)?$/),
});

const HEARTBEAT_TIMEOUT_MS = 30_000;
const FALLBACK_INTERVAL_MS = 15_000;
const MAX_RECONNECT_DELAY_MS = 30_000;

type Fetcher = typeof fetch;
type SocketFactory = (url: string) => WebSocket;

interface BinanceFeedOptions {
  wsUrl?: string;
  apiUrl?: string;
  fetcher?: Fetcher;
  socketFactory?: SocketFactory;
  now?: () => number;
  random?: () => number;
  logger?: Pick<Console, "info" | "warn" | "error">;
}

export class BinanceFeed extends BaseVenueFeed {
  protected readonly venueId = "binance";
  protected readonly pair = "BTCUSDT";
  protected readonly events = new EventEmitter();

  private readonly wsUrl: string;
  private readonly apiUrl: string;
  private readonly fetcher: Fetcher;
  private readonly socketFactory: SocketFactory;
  private readonly now: () => number;
  private readonly random: () => number;
  private readonly logger: Pick<Console, "info" | "warn" | "error">;

  private socket: WebSocket | null = null;
  private volume24h: string | null = null;
  private stopping = false;
  private reconnectAttempts = 0;
  private lastMessageAt = 0;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private heartbeatTimer: NodeJS.Timeout | null = null;
  private fallbackTimer: NodeJS.Timeout | null = null;
  private volumeRefreshTimer: NodeJS.Timeout | null = null;
  private fallbackRequestActive = false;

  constructor(options: BinanceFeedOptions = {}) {
    super();
    this.wsUrl = options.wsUrl ?? "wss://stream.binance.com:9443/ws";
    this.apiUrl = options.apiUrl ?? "https://api.binance.com";
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
    await this.refresh24hData().catch((error: unknown) => {
      this.logger.warn("Initial Binance 24h data refresh failed", error);
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

  private connect(): void {
    if (this.stopping || this.socket) return;
    this.setState("connecting");

    try {
      const socket = this.socketFactory(`${this.wsUrl}/btcusdt@miniTicker`);
      this.socket = socket;

      socket.on("open", () => this.handleOpen(socket));
      socket.on("message", (data) => this.handleMessage(data));
      socket.on("error", (error) => this.logger.warn("Binance WebSocket error", error));
      socket.on("close", (code, reason) => this.handleClose(socket, code, reason.toString()));
    } catch (error) {
      this.logger.warn("Binance WebSocket connection failed", error);
      this.socket = null;
      this.handleDisconnected();
    }
  }

  private handleOpen(socket: WebSocket): void {
    this.reconnectAttempts = 0;
    this.lastMessageAt = this.now();
    this.startHeartbeatWatchdog(socket);
    this.startVolumeRefresh();
    this.logger.info("Binance WebSocket connected");
  }

  private handleMessage(data: RawData): void {
    this.lastMessageAt = this.now();
    const snapshot = this.parseMiniTicker(data.toString());
    if (!snapshot) return;

    this.snapshot = snapshot;
    this.stopFallbackPolling();
    this.setState("live");
    this.emitPrice();
  }

  private parseMiniTicker(rawMessage: string): VenueSnapshot | null {
    let decoded: unknown;
    try {
      decoded = JSON.parse(rawMessage);
    } catch {
      return null;
    }

    const parsed = MINI_TICKER_SCHEMA.safeParse(decoded);
    if (!parsed.success) return null;

    const receivedAt = new Date(this.now()).toISOString();
    const timestamp = new Date(parsed.data.E).toISOString();

    return {
      venueId: this.venueId,
      pair: this.pair,
      price: parsed.data.c,
      volume24h: this.volume24h,
      quote: "USDT",
      timestamp,
      receivedAt,
    };
  }

  private handleClose(socket: WebSocket, code: number, reason: string): void {
    if (this.socket !== socket) return;
    this.socket = null;
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    this.heartbeatTimer = null;

    if (this.stopping) return;
    this.logger.warn(`Binance WebSocket closed (${code}): ${reason || "no reason"}`);
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
        this.logger.warn("Binance heartbeat timed out; reconnecting");
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
    void this.refresh24hData().catch((error: unknown) => {
      this.logger.warn("Binance REST fallback failed", error);
    });
  }

  private stopFallbackPolling(): void {
    if (this.fallbackTimer) clearInterval(this.fallbackTimer);
    this.fallbackTimer = null;
  }

  private startVolumeRefresh(): void {
    if (this.volumeRefreshTimer) return;
    this.volumeRefreshTimer = setInterval(() => this.refresh24hData(), 15_000);
    this.volumeRefreshTimer.unref();
  }

  private async refresh24hData(): Promise<void> {
    if (this.fallbackRequestActive) return;
    this.fallbackRequestActive = true;

    try {
      const response = await this.fetcher(`${this.apiUrl}/api/v3/ticker/24hr?symbol=BTCUSDT`, {
        headers: { Accept: "application/json", "User-Agent": "priceb.tc/1.0" },
        signal: AbortSignal.timeout(10_000),
      });
      if (!response.ok) {
        throw new Error(`Binance REST returned ${response.status}`);
      }

      const ticker = TICKER_24H_SCHEMA.parse(await response.json());
      this.volume24h = ticker.volume;

      const receivedAt = new Date(this.now()).toISOString();
      this.snapshot = {
        venueId: this.venueId,
        pair: this.pair,
        price: ticker.lastPrice,
        volume24h: ticker.volume,
        quote: "USDT",
        timestamp: receivedAt,
        receivedAt,
      };
      this.emitPrice();
    } finally {
      this.fallbackRequestActive = false;
    }
  }

  private clearTimers(): void {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    if (this.fallbackTimer) clearInterval(this.fallbackTimer);
    if (this.volumeRefreshTimer) clearInterval(this.volumeRefreshTimer);
    this.reconnectTimer = null;
    this.heartbeatTimer = null;
    this.fallbackTimer = null;
    this.volumeRefreshTimer = null;
  }
}
