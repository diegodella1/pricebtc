import { z } from "zod";

const flag = (fallback: boolean) =>
  z
    .enum(["true", "false"])
    .default(String(fallback) as "true" | "false")
    .transform((v) => v === "true");
const seconds = (fallback: number) =>
  z.coerce.number().int().positive().default(fallback);
const schema = z.object({
  APP_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.string().default(""),
  PUBLIC_SITE_URL: z.string().url().default("http://127.0.0.1:5173"),
  SATS_BID_ENABLED: flag(false),
  BIDS_ENABLED: flag(false),
  PAYMENT_PROVIDER: z.enum(["mock", "btcpay"]).default("mock"),
  MOCK_PAYMENTS_ENABLED: flag(false),
  MINIMUM_BID_SATS: z
    .string()
    .regex(/^[1-9]\d*$/)
    .default("1000"),
  MAXIMUM_BID_SATS: z
    .string()
    .regex(/^[1-9]\d*$/)
    .default("1000000"),
  INVOICE_TTL_SECONDS: seconds(600),
  BID_CUTOFF_SECONDS: seconds(120),
  INVOICE_END_BUFFER_SECONDS: seconds(60),
  ROUND_CLOSE_GRACE_SECONDS: seconds(300),
  RECONCILIATION_INTERVAL_SECONDS: seconds(60),
  PROVIDER_HTTP_TIMEOUT_SECONDS: seconds(10),
  MOCK_WEBHOOK_SECRET: z.string().default(""),
  BTCPAY_URL: z.string().default(""),
  BTCPAY_API_KEY: z.string().default(""),
  BTCPAY_STORE_ID: z.string().default(""),
  BTCPAY_WEBHOOK_SECRET: z.string().default(""),
  BTCPAY_NETWORK: z.enum(["mainnet", "testnet", "regtest"]).default("mainnet"),
  ADMIN_EMAIL: z.string().default(""),
  ADMIN_PASSWORD_HASH: z.string().default(""),
  ADMIN_SESSION_SECRET: z.string().default(""),
  SUPPORT_CONTACT_URL: z.string().default("mailto:contact@foreign.rodeo"),
  RULES_VERSION: z.string().default("1.0"),
  MODERATION_MODE: z.enum(["auto_basic", "manual"]).default("auto_basic"),
  PRICEBTC_DATA_DIR: z.string().default(".data"),
  ANALYTICS_EXPORT_URL: z.string().url().or(z.literal("")).default(""),
  ANALYTICS_EXPORT_TOKEN: z.string().default(""),
  SPONSOR_ADDR_USDT_TRC20: z.string().default(""),
  SPONSOR_ADDR_USDC_SOL: z.string().default(""),
  SPONSOR_ADDR_BTC: z.string().default(""),
  SPONSOR_MIN_USD_USDT: z.coerce.number().positive().default(10),
  SPONSOR_MIN_USD_USDC: z.coerce.number().positive().default(10),
  SPONSOR_MIN_USD_BTC: z.coerce.number().positive().default(10),
  SPONSOR_CONFIRM_USDT_TRC20: z.coerce.number().int().positive().default(19),
  SPONSOR_CONFIRM_USDC_SOL: z.coerce.number().int().positive().default(32),
  SPONSOR_CONFIRM_BTC: z.coerce.number().int().positive().default(3),
  TRONSCAN_API_URL: z.string().url().default("https://apilist.tronscan.org"),
  TRONSCAN_API_KEY: z.string().default(""),
  SOLANA_RPC_URL: z.string().url().default("https://api.mainnet-beta.solana.com"),
  SOLANA_RPC_TOKEN: z.string().default(""),
  BITCOIN_EXPLORER_URL: z.string().url().default("https://mempool.space/api"),
});
export type BidConfig = z.infer<typeof schema>;
export function bidConfig(env: NodeJS.ProcessEnv = process.env): BidConfig {
  const config = schema.parse({
    ...env,
    APP_ENV: env.NODE_ENV === "production" ? "production" : env.APP_ENV,
  });
  if (
    config.APP_ENV === "production" &&
    config.ANALYTICS_EXPORT_URL &&
    (!config.ANALYTICS_EXPORT_URL.startsWith("https://") ||
      config.ANALYTICS_EXPORT_TOKEN.length < 32)
  )
    throw new Error("Analytics export requires HTTPS and an independent token");
  if (
    BigInt(config.MINIMUM_BID_SATS) > BigInt(config.MAXIMUM_BID_SATS) ||
    BigInt(config.MAXIMUM_BID_SATS) > 9223372036854775807n
  )
    throw new Error("Invalid bid limits");
  if (
    config.BID_CUTOFF_SECONDS <= config.INVOICE_END_BUFFER_SECONDS ||
    config.INVOICE_TTL_SECONDS < 60 ||
    config.BID_CUTOFF_SECONDS >= 86400
  )
    throw new Error("Invalid invoice timing");
  if (
    config.APP_ENV === "production" &&
    (config.SATS_BID_ENABLED || config.BIDS_ENABLED || !!config.DATABASE_URL)
  ) {
    if (
      !config.PUBLIC_SITE_URL.startsWith("https://") ||
      config.PAYMENT_PROVIDER !== "btcpay" ||
      config.MOCK_PAYMENTS_ENABLED
    )
      throw new Error(
        "Production bidding requires HTTPS and BTCPay; simulation is forbidden",
      );
    if (
      !config.DATABASE_URL ||
      !config.BTCPAY_URL.startsWith("https://") ||
      !config.BTCPAY_STORE_ID ||
      !config.BTCPAY_API_KEY ||
      config.BTCPAY_WEBHOOK_SECRET.length < 32 ||
      config.ADMIN_SESSION_SECRET.length < 32 ||
      !config.ADMIN_PASSWORD_HASH.startsWith("$argon2id$") ||
      !config.ADMIN_EMAIL ||
      !config.SUPPORT_CONTACT_URL
    )
      throw new Error("Production bidding configuration incomplete");
    if (config.BTCPAY_WEBHOOK_SECRET === config.ADMIN_SESSION_SECRET)
      throw new Error("Use independent secrets");
  }
  return config;
}
