import { database } from "../sats-bid/db.js";
import { createStripeClient, parseStripeConfig, type StripeConfig } from "./stripe-config.js";
import { SubscriptionService } from "./subscription-service.js";
import type { Pool } from "pg";
import type Stripe from "stripe";

export interface StripeRuntime {
  stripe: Stripe;
  subscriptions: SubscriptionService;
  config: StripeConfig;
  pool: Pool;
}

export function createStripeRuntime(databaseUrl: string | undefined): StripeRuntime | null {
  const config = parseStripeConfig();
  
  if (!databaseUrl) {
    process.stderr.write("Stripe integration disabled: DATABASE_URL not configured\n");
    return null;
  }

  const stripe = createStripeClient(config);
  
  if (!stripe) {
    process.stderr.write("Stripe integration disabled: STRIPE_SECRET_KEY not configured\n");
    return null;
  }

  const pool = database(databaseUrl);
  const subscriptions = new SubscriptionService(pool);

  return {
    stripe,
    subscriptions,
    config,
    pool,
  };
}
