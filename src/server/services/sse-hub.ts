import type { ServerResponse } from "node:http";

import type { FastifyReply, FastifyRequest } from "fastify";

import type { FeedState, MarketSnapshot } from "../../shared/contracts.js";
import type { FxService } from "./fx-service.js";
import type { MarketService } from "./market-service.js";
import { createPricePayload } from "./pricing.js";

const BROADCAST_INTERVAL_MS = 1_000;
const HEARTBEAT_INTERVAL_MS = 15_000;

interface StreamClient {
  response: ServerResponse;
  currency: string;
  ip: string;
  slowWrites: number;
}

interface SseHubOptions {
  market: Pick<MarketService, "getSnapshot" | "getState" | "onPrice" | "onStatus">;
  fx: Pick<FxService, "convertUsd" | "getStatus">;
  maxClients?: number;
  maxClientsPerIp?: number;
  logger?: Pick<Console, "info" | "warn">;
}

export class StreamCapacityError extends Error {
  readonly statusCode: 429 | 503;

  constructor(message: string, statusCode: 429 | 503) {
    super(message);
    this.name = "StreamCapacityError";
    this.statusCode = statusCode;
  }
}

export class SseHub {
  private readonly market: SseHubOptions["market"];
  private readonly fx: SseHubOptions["fx"];
  private readonly maxClients: number;
  private readonly maxClientsPerIp: number;
  private readonly logger: Pick<Console, "info" | "warn">;
  private readonly clients = new Set<StreamClient>();
  private readonly connectionsPerIp = new Map<string, number>();
  private broadcastTimer: NodeJS.Timeout | null = null;
  private heartbeatTimer: NodeJS.Timeout | null = null;
  private unsubscribePrice: (() => void) | null = null;
  private unsubscribeStatus: (() => void) | null = null;
  private hasPendingPrice = true;

  constructor(options: SseHubOptions) {
    this.market = options.market;
    this.fx = options.fx;
    this.maxClients = options.maxClients ?? 500;
    this.maxClientsPerIp = options.maxClientsPerIp ?? 5;
    this.logger = options.logger ?? console;
  }

  start(): void {
    if (this.broadcastTimer) return;
    this.unsubscribePrice = this.market.onPrice(() => {
      this.hasPendingPrice = true;
    });
    this.unsubscribeStatus = this.market.onStatus((state) => this.broadcastStatus(state));
    this.broadcastTimer = setInterval(() => this.flushPrice(), BROADCAST_INTERVAL_MS);
    this.heartbeatTimer = setInterval(() => this.sendHeartbeats(), HEARTBEAT_INTERVAL_MS);
    this.broadcastTimer.unref();
    this.heartbeatTimer.unref();
  }

  stop(): void {
    if (this.broadcastTimer) clearInterval(this.broadcastTimer);
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    this.broadcastTimer = null;
    this.heartbeatTimer = null;
    this.unsubscribePrice?.();
    this.unsubscribeStatus?.();
    this.unsubscribePrice = null;
    this.unsubscribeStatus = null;

    for (const client of this.clients) client.response.end();
    this.clients.clear();
    this.connectionsPerIp.clear();
  }

  open(request: FastifyRequest, reply: FastifyReply, currency: string): void {
    const ip = this.getClientIp(request);
    this.assertCapacity(ip);

    reply.hijack();
    reply.raw.writeHead(200, {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-store, must-revalidate",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });
    reply.raw.write("retry: 3000\n\n");

    const client: StreamClient = { response: reply.raw, currency, ip, slowWrites: 0 };
    this.clients.add(client);
    this.connectionsPerIp.set(ip, (this.connectionsPerIp.get(ip) ?? 0) + 1);
    request.raw.once("close", () => this.removeClient(client));

    this.sendCurrentPrice(client);
    this.writeEvent(client, "status", { state: this.market.getState() });
    this.logger.info(`SSE connected: ${this.clients.size} active`);
  }

  getClientCount(): number {
    return this.clients.size;
  }

  private assertCapacity(ip: string): void {
    if (this.clients.size >= this.maxClients) {
      throw new StreamCapacityError("Stream capacity reached", 503);
    }
    if ((this.connectionsPerIp.get(ip) ?? 0) >= this.maxClientsPerIp) {
      throw new StreamCapacityError("Too many streams from this address", 429);
    }
  }

  private flushPrice(): void {
    if (!this.hasPendingPrice) return;
    this.hasPendingPrice = false;
    for (const client of this.clients) this.sendCurrentPrice(client);
  }

  private sendCurrentPrice(client: StreamClient): void {
    const snapshot = this.market.getSnapshot();
    if (!snapshot) {
      this.writeEvent(client, "status", { state: "unavailable" });
      return;
    }

    try {
      const fxStatus = this.fx.getStatus();
      const payload = createPricePayload({
        snapshot,
        currency: client.currency,
        convertUsd: (price) => this.fx.convertUsd(price, client.currency),
        fxUpdatedAt: fxStatus.updatedAt,
      });
      this.writeEvent(client, "price", payload, snapshot.receivedAt);
    } catch (error) {
      this.logger.warn("Could not build SSE price payload", error);
      this.writeEvent(client, "status", { state: "unavailable" });
    }
  }

  private broadcastStatus(state: FeedState): void {
    for (const client of this.clients) this.writeEvent(client, "status", { state });
  }

  private sendHeartbeats(): void {
    for (const client of this.clients) {
      if (!client.response.write(`: heartbeat ${Date.now()}\n\n`)) {
        client.slowWrites += 1;
        if (client.slowWrites >= 3) this.removeClient(client);
      } else {
        client.slowWrites = 0;
      }
    }
  }

  private writeEvent(client: StreamClient, event: string, data: unknown, id?: string): void {
    if (client.response.writableEnded || client.response.destroyed) {
      this.removeClient(client);
      return;
    }

    const idLine = id ? `id: ${id}\n` : "";
    const message = `${idLine}event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    if (!client.response.write(message)) client.slowWrites += 1;
  }

  private removeClient(client: StreamClient): void {
    if (!this.clients.delete(client)) return;
    const remaining = (this.connectionsPerIp.get(client.ip) ?? 1) - 1;
    if (remaining <= 0) this.connectionsPerIp.delete(client.ip);
    else this.connectionsPerIp.set(client.ip, remaining);
    if (!client.response.writableEnded) client.response.end();
    this.logger.info(`SSE disconnected: ${this.clients.size} active`);
  }

  private getClientIp(request: FastifyRequest): string {
    const cloudflareIp = request.headers["cf-connecting-ip"];
    return typeof cloudflareIp === "string" && cloudflareIp.length <= 64 ? cloudflareIp : request.ip;
  }
}

export type StreamRegistry = Pick<SseHub, "open" | "getClientCount">;
export type MarketReader = {
  getSnapshot(): MarketSnapshot | null;
  getState(): FeedState;
};
