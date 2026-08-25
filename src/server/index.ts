import { buildApp } from "./app.js";
import { parseEnvironment } from "./config.js";
import { FxService } from "./services/fx-service.js";
import { HistoryService } from "./services/history-service.js";
import { MarketService } from "./services/market-service.js";
import { SseHub } from "./services/sse-hub.js";

const environment = parseEnvironment();
const fx = new FxService({ dataDir: environment.PRICEBTC_DATA_DIR, apiUrl: environment.FX_API_URL });
const market = new MarketService({
  wsUrl: environment.COINBASE_WS_URL,
  apiUrl: environment.COINBASE_API_URL,
});
const history = new HistoryService({ apiUrl: environment.COINBASE_API_URL });
const streams = new SseHub({
  market,
  fx,
  maxClients: environment.MAX_SSE_CLIENTS,
  maxClientsPerIp: environment.MAX_SSE_CLIENTS_PER_IP,
});
const app = buildApp({ market, fx, history, streams, logger: { level: environment.LOG_LEVEL } });

let shuttingDown = false;

async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  app.log.info({ signal }, "Shutting down");
  streams.stop();
  market.stop();
  fx.stop();
  await app.close();
}

async function main(): Promise<void> {
  await Promise.all([fx.start(), market.start()]);
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
