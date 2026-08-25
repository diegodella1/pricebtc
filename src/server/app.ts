import { join } from "node:path";

import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import fastifyStatic from "@fastify/static";
import Fastify, {
  type FastifyInstance,
  type FastifyReply,
  type FastifyServerOptions,
} from "fastify";
import { z } from "zod";

import type { CurrencyInfo, FeedState, HistoryPayload, MarketSnapshot } from "../shared/contracts.js";
import { HISTORY_RANGES, type HistoryRange } from "../shared/widget-config.js";
import type { FxService } from "./services/fx-service.js";
import { createPricePayload } from "./services/pricing.js";
import { StreamCapacityError, type StreamRegistry } from "./services/sse-hub.js";

const CURRENCY_SCHEMA = z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/).default("USD");
const RANGE_SCHEMA = z.enum(HISTORY_RANGES).default("24h");

interface MarketReader {
  getSnapshot(): MarketSnapshot | null;
  getState(): FeedState;
}

interface FxReader {
  supportsCurrency(currency: string): boolean;
  convertUsd(priceUsd: string, currency: string): string;
  getCurrencies(): CurrencyInfo[];
  getStatus(): ReturnType<FxService["getStatus"]>;
}

interface HistoryReader {
  getHistory(
    range: HistoryRange,
    convertPrice: (priceUsd: string) => string,
  ): Promise<Omit<HistoryPayload, "currency">>;
}

interface BuildAppOptions {
  market: MarketReader;
  fx: FxReader;
  history: HistoryReader;
  streams: StreamRegistry;
  serveFrontend?: boolean;
  logger?: FastifyServerOptions["logger"];
}

export function buildApp(options: BuildAppOptions): FastifyInstance {
  const app = Fastify({
    logger: options.logger ?? true,
    trustProxy: true,
    bodyLimit: 16 * 1_024,
    requestTimeout: 15_000,
  });

  void app.register(helmet, {
    contentSecurityPolicy: false,
    frameguard: false,
    crossOriginEmbedderPolicy: false,
  });
  void app.register(rateLimit, {
    max: 120,
    timeWindow: "1 minute",
    hook: "onRequest",
  });

  app.addHook("onRequest", async (request, reply) => {
    if (request.hostname.toLowerCase() === "www.priceb.tc") {
      return reply.redirect(`https://priceb.tc${request.url}`, 308);
    }
  });

  app.addHook("onSend", async (request, reply, payload) => {
    const path = request.url.split("?", 1)[0] ?? "/";
    const isRenderer = path === "/embed" || path === "/overlay";
    const framePolicy = isRenderer ? "*" : "'none'";
    reply.header(
      "Content-Security-Policy",
      `default-src 'self'; connect-src 'self'; img-src 'self' data:; font-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self'; frame-ancestors ${framePolicy}; base-uri 'none'; form-action 'self'`,
    );
    reply.header("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=()");
    if (isRenderer) {
      reply.header("Cross-Origin-Resource-Policy", "cross-origin");
      reply.header("Cross-Origin-Opener-Policy", "unsafe-none");
    } else {
      reply.header("X-Frame-Options", "DENY");
    }
    return payload;
  });

  app.get("/api/price", async (request, reply) => {
    reply.header("Cache-Control", "no-store");
    const currency = parseCurrency(request.query, options.fx, reply);
    if (!currency) return;

    const snapshot = options.market.getSnapshot();
    if (!snapshot) {
      return reply.code(503).send({ code: "PRICE_UNAVAILABLE", message: "Live price is not available yet" });
    }

    const fxStatus = options.fx.getStatus();
    return createPricePayload({
      snapshot,
      currency,
      convertUsd: (price) => options.fx.convertUsd(price, currency),
      fxUpdatedAt: fxStatus.updatedAt,
    });
  });

  app.get("/api/history", async (request, reply) => {
    reply.header("Cache-Control", "no-store");
    const query = request.query as Record<string, unknown>;
    const currency = parseCurrency(query, options.fx, reply);
    if (!currency) return;

    const parsedRange = RANGE_SCHEMA.safeParse(query.range);
    if (!parsedRange.success) {
      return reply.code(400).send({ code: "INVALID_RANGE", message: "Unsupported history range" });
    }

    const history = await options.history.getHistory(parsedRange.data, (price) =>
      options.fx.convertUsd(price, currency),
    );
    return { currency, ...history };
  });

  app.get("/api/currencies", async (_request, reply) => {
    reply.header("Cache-Control", "public, max-age=3600");
    return options.fx.getCurrencies();
  });

  app.get("/api/stream", { config: { rateLimit: { max: 20, timeWindow: "1 minute" } } }, (request, reply) => {
    const currency = parseCurrency(request.query, options.fx, reply);
    if (!currency) return;

    try {
      options.streams.open(request, reply, currency);
    } catch (error) {
      if (error instanceof StreamCapacityError) {
        reply.header("Retry-After", "30");
        return reply.code(error.statusCode).send({ code: "STREAM_LIMIT", message: error.message });
      }
      throw error;
    }
  });

  app.get("/healthz", async (_request, reply) => {
    reply.header("Cache-Control", "no-store");
    const marketState = options.market.getState();
    const snapshot = options.market.getSnapshot();
    const fxStatus = options.fx.getStatus();
    const healthy = marketState === "live" && fxStatus.state !== "expired" && fxStatus.state !== "unavailable";
    return {
      status: healthy ? "ok" : "degraded",
      uptimeSeconds: Math.round(process.uptime()),
      memoryRssMb: Math.round(process.memoryUsage().rss / 1_048_576),
      market: { state: marketState, lastUpdateAt: snapshot?.receivedAt ?? null },
      fx: fxStatus,
      streams: options.streams.getClientCount(),
    };
  });

  if (options.serveFrontend !== false) registerFrontend(app);

  app.setErrorHandler((error, request, reply) => {
    request.log.error({ error }, "Request failed");
    const candidateStatus =
      typeof error === "object" && error !== null && "statusCode" in error
        ? Number(error.statusCode)
        : Number.NaN;
    const statusCode = Number.isInteger(candidateStatus) && candidateStatus < 500 ? candidateStatus : 500;
    const message = statusCode < 500 && error instanceof Error ? error.message : "Unexpected server error";
    void reply.code(statusCode).send({ code: statusCode < 500 ? "BAD_REQUEST" : "INTERNAL_ERROR", message });
  });

  return app;
}

function parseCurrency(query: unknown, fx: FxReader, reply: FastifyReply): string | null {
  const rawCurrency = (query as Record<string, unknown> | null)?.currency;
  const parsed = CURRENCY_SCHEMA.safeParse(rawCurrency);
  if (!parsed.success || !fx.supportsCurrency(parsed.data)) {
    void reply.code(400).send({ code: "INVALID_CURRENCY", message: "Unsupported currency" });
    return null;
  }
  return parsed.data;
}

function registerFrontend(app: FastifyInstance): void {
  void app.register(fastifyStatic, {
    root: join(process.cwd(), "dist/client"),
    prefix: "/",
    wildcard: false,
    maxAge: "1y",
    immutable: true,
    index: false,
  });

  app.setNotFoundHandler((request, reply) => {
    if (request.url.startsWith("/api/") || request.url === "/healthz") {
      return reply.code(404).send({ code: "NOT_FOUND", message: "Route not found" });
    }
    if (request.method !== "GET") {
      return reply.code(404).send({ code: "NOT_FOUND", message: "Route not found" });
    }
    reply.header("Cache-Control", "no-cache");
    return reply.sendFile("index.html", { cacheControl: false });
  });
}
