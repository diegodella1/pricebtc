import { bidConfig } from "./config.js";
import { database } from "./db.js";
import { BTCPayPaymentProvider, MockPaymentProvider } from "./provider.js";
import { BidService } from "./service.js";
import { startCryptoValidationWorker } from "./crypto-validation-worker.js";
import { startDepositWatchers } from "./deposit-watchers.js";

export function createBidRuntime(getBtcPrice?: () => Promise<number>) {
  const config = bidConfig();
  if (!config.DATABASE_URL) return null;
  const pool = database(config.DATABASE_URL);
  pool.on("error", () => {
    process.stderr.write("Sats Bid database connection unavailable\n");
  });
  const provider =
    config.PAYMENT_PROVIDER === "mock"
      ? new MockPaymentProvider(pool, config.MOCK_WEBHOOK_SECRET)
      : new BTCPayPaymentProvider(config);
  const service = new BidService(pool, config, provider);
  
  const stopCryptoWorker = getBtcPrice
    ? startCryptoValidationWorker(pool, config, getBtcPrice)
    : () => {};
  
  const stopDepositWatchers = startDepositWatchers(pool, config);
  
  return {
    service,
    pool,
    stop: () => {
      stopCryptoWorker();
      stopDepositWatchers();
    },
  };
}
