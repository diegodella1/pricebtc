import Stripe from "stripe";
import { z } from "zod";

const STRIPE_CONFIG_SCHEMA = z.object({
  STRIPE_SECRET_KEY: z.string().min(1).optional(),
  STRIPE_PUBLISHABLE_KEY: z.string().min(1).optional(),
  STRIPE_WEBHOOK_SECRET: z.string().min(1).optional(),
  STRIPE_PRICE_PRO_MONTHLY: z.string().optional(),
  STRIPE_PRICE_PRO_YEARLY: z.string().optional(),
  STRIPE_PRICE_BUSINESS_MONTHLY: z.string().optional(),
  STRIPE_PRICE_BUSINESS_YEARLY: z.string().optional(),
  PUBLIC_SITE_URL: z.string().url().default("http://127.0.0.1:5173"),
});

export type StripeConfig = z.infer<typeof STRIPE_CONFIG_SCHEMA>;

export function parseStripeConfig(environment: NodeJS.ProcessEnv = process.env): StripeConfig {
  return STRIPE_CONFIG_SCHEMA.parse(environment);
}

export function createStripeClient(config: StripeConfig): Stripe | null {
  if (!config.STRIPE_SECRET_KEY) {
    return null;
  }
  
  return new Stripe(config.STRIPE_SECRET_KEY, {
    apiVersion: "2026-08-26.dahlia",
    typescript: true,
  });
}

export function isStripeConfigured(config: StripeConfig): boolean {
  return Boolean(
    config.STRIPE_SECRET_KEY &&
    config.STRIPE_WEBHOOK_SECRET &&
    config.STRIPE_PRICE_PRO_MONTHLY &&
    config.STRIPE_PRICE_BUSINESS_MONTHLY
  );
}
