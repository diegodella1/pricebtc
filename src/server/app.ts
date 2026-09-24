import { readFile } from "node:fs/promises";
import seoPages from "../shared/seo-pages.json";
import { renderPriceSnapshot, renderPriceMarkdown, injectOgMeta } from "./seo.js";
import { generateOgImage } from "./og-image.js";
import { join } from "node:path";
import type { Pool } from "pg";

import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import fastifyStatic from "@fastify/static";
import Fastify, {
  type FastifyInstance,
  type FastifyReply,
  type FastifyServerOptions,
} from "fastify";
import { z } from "zod";

import type { CurrencyInfo, FeedState, HistoryPayload, MarketSnapshot, PriceObservation } from "../shared/contracts.js";
import { HISTORY_RANGES, type HistoryRange } from "../shared/widget-config.js";
import type { FxService } from "./services/fx-service.js";
import { createPricePayload } from "./services/pricing.js";
import { StreamCapacityError, type StreamRegistry } from "./services/sse-hub.js";
import type { BidService } from "./sats-bid/service.js";
import { registerBidRoutes } from "./sats-bid/routes.js";
import { registerWaitlistRoutes } from "./waitlist.js";
import { registerStripeRoutes } from "./stripe-routes.js";
import type { PlausibleService } from "./services/plausible.js";
import type { StripeRuntime } from "./services/stripe-runtime.js";

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
  bidding?: { service: BidService; pool: Pool; getBtcPrice: () => Promise<number>; stop: () => void } | null;
  stripe?: StripeRuntime | null;
  market: MarketReader;
  fx: FxReader;
  history: HistoryReader;
  streams: StreamRegistry;
  plausible: PlausibleService;
  serveFrontend?: boolean;
  logger?: FastifyServerOptions["logger"];
  dataDir?: string;
}

export function buildApp(options: BuildAppOptions): FastifyInstance {
  const app = Fastify({
    logger: options.logger ?? true,
    trustProxy: true,
    routerOptions: { ignoreTrailingSlash: true },
    bodyLimit: 16 * 1_024,
    requestTimeout: 15_000,
  });

  void app.register(helmet, {
    contentSecurityPolicy: false,
    frameguard: false,
    crossOriginEmbedderPolicy: false,
  });
  app.addHook("onRoute", (route) => {
    if (!route.url.startsWith("/api/") || route.url.startsWith("/api/sats-bid/") || route.url === "/api/webhooks/btcpay" || route.url === "/api/stripe/webhook") {
      route.config = { ...route.config, rateLimit: false };
    }
  });
  void app.register(rateLimit, {
    max: 120,
    timeWindow: "1 minute",
    hook: "onRequest",
    addHeaders: {
      "x-ratelimit-limit": true,
      "x-ratelimit-remaining": true,
      "x-ratelimit-reset": true,
      "retry-after": true,
    },
  });

  registerResponsePolicies(app);

  registerResponsePolicies(app);

  // Register routes after the limiter's onRoute hook is installed.
  void app.register(async routes => registerApplicationRoutes(routes, options));
  return app;
}

function registerResponsePolicies(app: FastifyInstance): void {
  app.addHook("onRequest", async (request, reply) => {
    const hostname = request.hostname.toLowerCase();
    if (hostname === "www.priceb.tc" || hostname === "live.priceb.tc" || (hostname === "priceb.tc" && request.protocol === "http")) {
      return reply.redirect(`https://priceb.tc${request.url}`, 308);
    }
    const url = new URL(request.url, "http://localhost");
    const normalized = url.pathname.replace(/\/index\.html$/, "").replace(/\/+$/, "") || "/";
    
    if (normalized === "/bid" || normalized.startsWith("/bid/")) {
      const newPath = normalized.replace(/^\/bid/, "/sponsors");
      return reply.redirect(`${newPath}${url.search}`, 301);
    }
    
    if ((seoPages.indexable.includes(normalized) || ["/embed", "/overlay"].includes(normalized)) && normalized !== url.pathname) {
      return reply.redirect(`${normalized}${url.search}`, 308);
    }
  });

  app.addHook("onSend", async (request, reply, payload) => {
    const rawPath = request.url.split("?", 1)[0] ?? "/";
    const path = rawPath.replace(/\/+$/, "") || "/";
    const isRenderer = path === "/embed" || path === "/overlay";
    const framePolicy = isRenderer ? "*" : "'none'";
    reply.header(
      "Content-Security-Policy",
      `default-src 'self'; connect-src 'self' https://www.google-analytics.com https://analytics.google.com https://region1.google-analytics.com; img-src 'self' data: https://www.google-analytics.com https://www.googletagmanager.com; font-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline' https://www.googletagmanager.com; frame-ancestors ${framePolicy}; base-uri 'none'; form-action 'self'`,
    );
    reply.header("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=()");
    if (isRenderer) {
      reply.header("Cross-Origin-Resource-Policy", "cross-origin");
      reply.header("Cross-Origin-Opener-Policy", "unsafe-none");
      reply.header("X-Robots-Tag", "noindex, follow, noarchive");
    } else {
      reply.header("X-Frame-Options", "DENY");
    }
    if (["/robots.txt", "/sitemap.xml", "/llms.txt"].includes(path)) reply.header("Cache-Control", "no-cache, max-age=0, must-revalidate");
    if (path.endsWith(".html")) reply.header("Cache-Control", "no-cache");
    return payload;
  });

}

function registerApplicationRoutes(app: FastifyInstance, options: BuildAppOptions): void {
  if (options.dataDir) {
    void app.register(async instance => registerWaitlistRoutes(instance, options.dataDir!));
  }
  
  if (options.bidding) {
    void app.register(async instance => registerBidRoutes(instance, options.bidding!.service, options.bidding!.getBtcPrice));
  } else {
    app.get("/api/sats-bid/round/current", async () => ({ enabled: false, bids_open: false, coming_soon: true }));
  }

  if (options.stripe) {
    void app.register(async instance => {
      instance.decorate("stripe", options.stripe!.stripe);
      registerStripeRoutes(instance, {
        stripe: options.stripe!.stripe,
        config: options.stripe!.config,
        subscriptions: options.stripe!.subscriptions,
      });
    });
  } else {
    app.post("/api/stripe/create-checkout-session", async (_, reply) => {
      return reply.code(503).send({ code: "STRIPE_NOT_CONFIGURED", message: "Stripe integration is not configured" });
    });
    app.post("/api/stripe/create-portal-session", async (_, reply) => {
      return reply.code(503).send({ code: "STRIPE_NOT_CONFIGURED", message: "Stripe integration is not configured" });
    });
  }

  app.get("/api/price", async (request, reply) => {
    reply.header("Cache-Control", "no-store");
    const currency = parseCurrency(request.query, options.fx, reply);
    if (!currency) return;

    const observation = readObservation(options, currency);
    if (!observation) return reply.code(503).send({ code: "PRICE_UNAVAILABLE", message: "Live price is not available yet" });
    return observation;
  });

  app.get("/bitcoin-price.md", async (_request, reply) => {
    const observation = readObservation(options, "USD");
    reply.header("Cache-Control", "no-store").header("X-Robots-Tag", "noindex, follow");
    reply.header("Link", '<https://priceb.tc/>; rel="canonical"');
    return reply.code(observation ? 200 : 503).type("text/markdown; charset=utf-8").send(renderPriceMarkdown(observation));
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

  app.get("/api/analytics", async (_request, reply) => {
    reply.header("Cache-Control", "public, max-age=300");
    
    if (!options.plausible.isConfigured()) {
      return reply.code(404).send({ code: "NOT_CONFIGURED", message: "Analytics not configured" });
    }

    const stats = await options.plausible.getStats();
    
    if (!stats) {
      return reply.code(503).send({ code: "UNAVAILABLE", message: "Analytics data unavailable" });
    }

    return stats;
  });

  app.get("/og-image.png", async (request, reply) => {
    const query = request.query as Record<string, unknown>;
    const currency = typeof query.currency === "string" ? query.currency.toUpperCase() : "USD";
    
    if (!options.fx.supportsCurrency(currency)) {
      return reply.code(400).send({ code: "INVALID_CURRENCY", message: "Unsupported currency" });
    }

    const observation = readObservation(options, currency);
    const imageBuffer = await generateOgImage({ price: observation, currency });
    
    reply.header("Content-Type", "image/png");
    reply.header("Cache-Control", "public, max-age=60");
    return imageBuffer;
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

  if (options.serveFrontend !== false) registerFrontend(app, options);

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

}

function readObservation(options: BuildAppOptions, currency: string): PriceObservation | null {
  const snapshot = options.market.getSnapshot();
  if (!snapshot) return null;
  const price = createPricePayload({ snapshot, currency, convertUsd: value => options.fx.convertUsd(value, currency), fxUpdatedAt: options.fx.getStatus().updatedAt });
  if (options.market.getState() !== "live") price.status = "stale";
  return price;
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

function registerFrontend(app: FastifyInstance, options: BuildAppOptions): void {
  const frontendRoot = process.env.PRICEBTC_FRONTEND_DIR ?? join(process.cwd(), "dist/client");
  const templates = new Map<string, Promise<string>>();
  void app.register(fastifyStatic, {
    root: frontendRoot,
    prefix: "/",
    wildcard: false,
    globIgnore: ["og-image.png"],
    maxAge: "1y",
    immutable: true,
    index: false,
  });

  const documents = new Map([
    ...seoPages.guides.map(guide => [guide.path, `${guide.path.slice(1)}/index.html`] as [string, string]),
    ["/", "index.html"],
    ["/about", "about/index.html"],
    ["/faq", "faq/index.html"],
    ["/studio", "studio/index.html"],
    ["/embed", "embed/index.html"],
    ["/overlay", "overlay/index.html"],
    ["/sponsors", "sponsors/index.html"],
    ["/leaderboard", "leaderboard/index.html"],
    ["/history", "history/index.html"],
    ["/rules", "rules/index.html"],
    ["/admin", "admin/index.html"],
    ["/pricing", "pricing/index.html"],
    ["/status", "status/index.html"],
    ["/terms", "terms/index.html"],
    ["/privacy", "privacy/index.html"],
  ]);

  for (const [route, filename] of documents) {
    app.get(route, async (request, reply) => {
      if (route === "/") {
        let template = templates.get(filename);
        if (!template) { template = readFile(join(frontendRoot, filename), "utf8"); templates.set(filename, template); }
        
        const query = request.query as Record<string, unknown>;
        const currency = typeof query.currency === "string" && /^[A-Z]{3}$/.test(query.currency.toUpperCase()) && options.fx.supportsCurrency(query.currency.toUpperCase()) ? query.currency.toUpperCase() : "USD";
        
        const price = readObservation(options, currency);
        reply.header("Cache-Control", "no-store").type("text/html; charset=utf-8");
        let html = await template;
        html = html.replace("<!--PRICE_SNAPSHOT-->", renderPriceSnapshot(price));
        html = injectOgMeta(html, price, currency);
        return html;
      }
      if (["/leaderboard", "/history"].includes(route)) reply.header("X-Robots-Tag", "noindex, follow");
      reply.header("Cache-Control", route === "/sponsors" || route === "/admin" ? "no-store" : "no-cache");
      if (route === "/admin") reply.header("X-Robots-Tag", "noindex, nofollow");
      if (route === "/embed" || route === "/overlay") {
        reply.header("X-Robots-Tag", "noindex, follow, noarchive");
      }
      return reply.sendFile(filename, { cacheControl: false });
    });
  }
  app.get("/api", async (request, reply) => {
    reply.header("Cache-Control", "no-cache");
    return reply.sendFile("api/index.html", { cacheControl: false });
  });

  app.get("/day/:date", (request, reply) => {
    reply.header("X-Robots-Tag", "noindex, follow");
    const date = (request.params as { date: string }).date;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return reply.code(404).send();
    reply.header("Cache-Control", "no-cache");
    return reply.sendFile("day/index.html", { cacheControl: false });
  });

  app.setNotFoundHandler((request, reply) => {
    if (request.url.startsWith("/api/") || request.url === "/healthz") {
      return reply.code(404).send({ code: "NOT_FOUND", message: "Route not found" });
    }
    if (request.method !== "GET") {
      return reply.code(404).send({ code: "NOT_FOUND", message: "Route not found" });
    }
    reply.header("Cache-Control", "no-cache");
    if (request.headers.accept?.includes("text/html")) {
      return reply.code(404).sendFile("404.html", { cacheControl: false });
    }
    return reply.code(404).send({ code: "NOT_FOUND", message: "Route not found" });
  });
}
