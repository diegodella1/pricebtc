import { randomBytes } from "node:crypto";
import { writeFile } from "node:fs/promises";
import argon2 from "argon2";
const secret = () => randomBytes(32).toString("hex");
const password = secret();
const databasePassword = secret();
const values = {
  APP_ENV: "development",
  HOST: "127.0.0.1",
  PORT: "3478",
  PUBLIC_SITE_URL: "http://127.0.0.1:5173",
  PRICEBTC_DATA_DIR: ".data/sats-local",
  SATS_DB_PASSWORD: databasePassword,
  SATS_DB_PORT: "55432",
  DATABASE_URL: `postgresql://pricebtc:${databasePassword}@127.0.0.1:55432/pricebtc`,
  SATS_BID_ENABLED: "true",
  BIDS_ENABLED: "true",
  PAYMENT_PROVIDER: "mock",
  MOCK_PAYMENTS_ENABLED: "true",
  MOCK_WEBHOOK_SECRET: secret(),
  ADMIN_EMAIL: "operator@example.com",
  ADMIN_PASSWORD_HASH: await argon2.hash(password, { type: argon2.argon2id }),
  ADMIN_SESSION_SECRET: secret(),
  SATS_LOCAL_ADMIN_PASSWORD: password,
};
const content =
  "# LOCAL MOCK ONLY. Keep private; never use for production.\n" +
  Object.entries(values)
    .map(([key, value]) => `${key}='${value.replaceAll("'", "'\\''")}'`)
    .join("\n") +
  "\n";
await writeFile(".env.sats.local", content, { flag: "wx", mode: 0o600 });
process.stdout.write(
  "Created .env.sats.local without changing existing environments. Open it privately for the local operator password.\n",
);
