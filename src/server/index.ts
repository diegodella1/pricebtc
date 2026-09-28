import { buildApp } from "./app.js";
import { parseEnvironment } from "./config.js";
import { FxService } from "./services/fx-service.js";
import { HistoryService } from "./services/history-service.js";
import { TradeVolumeService } from "./services/trade-volume.js";
import { MarketService } from "./services/market-service.js";
import { CoinbaseFeed } from "./services/coinbase-feed.js";
import { BinanceFeed } from "./services/binance-feed.js";
import { PriceAggregator } from "./services/price-aggregator.js";
import { SseHub } from "./services/sse-hub.js";
import { PlausibleService } from "./services/plausible.js";
import { createBidRuntime } from "./sats-bid/runtime.js";
import { createStripeRuntime } from "./services/stripe-runtime.js";
import { bidConfig } from "./sats-bid/config.js";

const environment = parseEnvironment();
const fx = new FxService({ dataDir: environment.PRICEBTC_DATA_DIR, apiUrl: environment.FX_API_URL });

let market: MarketService | PriceAggregator;
let coinbaseMarket: MarketService | null = null;

if (environment.PRICE_INDEX === "vwap") {
  const coinbaseFeed = new CoinbaseFeed({
    wsUrl: environment.COINBASE_WS_URL,
    apiUrl: environment.COINBASE_API_URL,
  });

  const binanceFeed = new BinanceFeed({
    wsUrl: environment.BINANCE_WS_URL,
    apiUrl: environment.BINANCE_API_URL,
  });

  coinbaseMarket = new MarketService({
    wsUrl: environment.COINBASE_WS_URL,
    apiUrl: environment.COINBASE_API_URL,
  });

  market = new PriceAggregator({
    feeds: [coinbaseFeed, binanceFeed],
    coinbaseFallbackStats: () => {
      const snapshot = coinbaseMarket?.getSnapshot();
      if (!snapshot) return null;
      return {
        high: snapshot.high24h ?? "0",
        low: snapshot.low24h ?? "0",
        volume: snapshot.volume24h ?? "0",
        change24h: snapshot.change24h,
      };
    },
  });
} else {
  market = new MarketService({
    wsUrl: environment.COINBASE_WS_URL,
    apiUrl: environment.COINBASE_API_URL,
  });
  coinbaseMarket = market;
}

const tradeVolume = new TradeVolumeService({ dataDir: environment.PRICEBTC_DATA_DIR, apiUrl: environment.COINBASE_API_URL });
const history = new HistoryService({ apiUrl: environment.COINBASE_API_URL, tradeVolume });
const streams = new SseHub({
  market,
  fx,
  maxClients: environment.MAX_SSE_CLIENTS,
  maxClientsPerIp: environment.MAX_SSE_CLIENTS_PER_IP,
});
const plausible = new PlausibleService(environment.PLAUSIBLE_DOMAIN, environment.PLAUSIBLE_API_KEY);
let bidding: ReturnType<typeof createBidRuntime> = null;
try {
  const getBtcPrice = async () => {
    const snapshot = coinbaseMarket?.getSnapshot() ?? market.getSnapshot();
    return snapshot ? parseFloat(snapshot.priceUsd) : 0;
  };
  bidding = createBidRuntime(getBtcPrice);
} catch {
  process.stderr.write("Sats Bid disabled: invalid configuration\n");
}
let stripe: ReturnType<typeof createStripeRuntime> = null;
try {
  const bidCfg = bidConfig();
  stripe = createStripeRuntime(bidCfg.DATABASE_URL || undefined);
} catch {
  process.stderr.write("Stripe integration disabled: invalid configuration\n");
}
const app = buildApp({ 
  market, 
  fx, 
  history, 
  streams, 
  plausible,
  bidding,
  stripe,
  dataDir: environment.PRICEBTC_DATA_DIR,
  logger: { level: environment.LOG_LEVEL } 
});

let shuttingDown = false;

async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  app.log.info({ signal }, "Shutting down");
  streams.stop();
  market.stop();
  if (coinbaseMarket && coinbaseMarket !== market) {
    coinbaseMarket.stop();
  }
  fx.stop();
  await app.close();
  await tradeVolume.stop();
  if (bidding) {
    bidding.stop();
    await bidding.pool.end();
  }
  await stripe?.pool.end();
}

async function main(): Promise<void> {
  const marketStarts = [];
  if (environment.PRICE_INDEX === "vwap" && coinbaseMarket && coinbaseMarket !== market) {
    marketStarts.push(coinbaseMarket.start());
  }
  marketStarts.push(market.start());

  await Promise.all([fx.start(), ...marketStarts, tradeVolume.start()]);
  streams.start();
  await app.listen({ host: environment.HOST, port: environment.PORT });
}

process.once("SIGTERM", () => void shutdown("SIGTERM"));
process.once("SIGINT", () => void shutdown("SIGINT"));

main().catch(async (error: unknown) => {
  app.log.fatal({ error }, "Startup failed");
  await shutdown("startup-error");
  process.exitCode = 1;
});
