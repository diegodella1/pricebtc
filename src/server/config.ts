import { z } from "zod";

const ENV_SCHEMA = z.object({
  HOST: z.string().default("127.0.0.1"),
  PORT: z.coerce.number().int().min(1).max(65_535).default(3466),
  PRICEBTC_DATA_DIR: z.string().min(1).default(".data"),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),
  COINBASE_WS_URL: z.string().url().default("wss://ws-feed.exchange.coinbase.com"),
  COINBASE_API_URL: z.string().url().default("https://api.exchange.coinbase.com"),
  FX_API_URL: z.string().url().default("https://open.er-api.com/v6/latest/USD"),
  MAX_SSE_CLIENTS: z.coerce.number().int().min(1).max(10_000).default(500),
  MAX_SSE_CLIENTS_PER_IP: z.coerce.number().int().min(1).max(100).default(5),
});

export function parseEnvironment(environment: NodeJS.ProcessEnv = process.env) {
  return ENV_SCHEMA.parse(environment);
}
