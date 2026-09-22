import type { Pool } from "pg";
import { randomBytes, createHash } from "node:crypto";

export type SubscriptionTier = "free" | "pro" | "business";

export interface ApiKey {
  id: string;
  userId: string;
  keyPrefix: string;
  tier: SubscriptionTier;
  name: string;
  createdAt: Date;
  lastUsedAt: Date | null;
}

export interface User {
  id: string;
  email: string;
  stripeCustomerId: string | null;
  createdAt: Date;
}

export interface Subscription {
  id: string;
  userId: string;
  stripeSubscriptionId: string;
  stripePriceId: string;
  tier: SubscriptionTier;
  status: string;
  currentPeriodEnd: Date | null;
  cancelAtPeriodEnd: boolean;
}

export class SubscriptionService {
  constructor(private pool: Pool) {}

  async findOrCreateUser(email: string, stripeCustomerId?: string): Promise<User> {
    const result = await this.pool.query<User>(
      `INSERT INTO users (email, stripe_customer_id)
       VALUES ($1, $2)
       ON CONFLICT (email) DO UPDATE
       SET stripe_customer_id = COALESCE(users.stripe_customer_id, EXCLUDED.stripe_customer_id),
           updated_at = now()
       RETURNING *`,
      [email, stripeCustomerId || null]
    );
    return result.rows[0]!;
  }

  async getUserByStripeCustomerId(stripeCustomerId: string): Promise<User | null> {
    const result = await this.pool.query<User>(
      "SELECT * FROM users WHERE stripe_customer_id = $1",
      [stripeCustomerId]
    );
    return result.rows[0] || null;
  }

  async upsertSubscription(
    userId: string,
    stripeSubscriptionId: string,
    stripePriceId: string,
    tier: SubscriptionTier,
    status: string,
    currentPeriodEnd: Date | null
  ): Promise<void> {
    await this.pool.query(
      `INSERT INTO subscriptions (user_id, stripe_subscription_id, stripe_price_id, tier, status, current_period_end)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (stripe_subscription_id) DO UPDATE
       SET tier = EXCLUDED.tier,
           status = EXCLUDED.status,
           current_period_end = EXCLUDED.current_period_end,
           updated_at = now()`,
      [userId, stripeSubscriptionId, stripePriceId, tier, status, currentPeriodEnd]
    );
  }

  async updateSubscriptionStatus(
    stripeSubscriptionId: string,
    status: string,
    cancelAtPeriodEnd: boolean
  ): Promise<void> {
    await this.pool.query(
      `UPDATE subscriptions 
       SET status = $2, cancel_at_period_end = $3, updated_at = now()
       WHERE stripe_subscription_id = $1`,
      [stripeSubscriptionId, status, cancelAtPeriodEnd]
    );
  }

  async getActiveSubscription(userId: string): Promise<Subscription | null> {
    const result = await this.pool.query<Subscription>(
      `SELECT * FROM subscriptions 
       WHERE user_id = $1 AND status IN ('active', 'trialing')
       ORDER BY created_at DESC LIMIT 1`,
      [userId]
    );
    return result.rows[0] || null;
  }

  async generateApiKey(userId: string, name: string, tier: SubscriptionTier): Promise<string> {
    const keyBytes = randomBytes(32);
    const key = `pricebtc_${tier}_${keyBytes.toString("base64url")}`;
    const keyHash = createHash("sha256").update(key).digest("hex");
    const keyPrefix = key.slice(0, 16);

    await this.pool.query(
      `INSERT INTO api_keys (user_id, key_hash, key_prefix, name, tier)
       VALUES ($1, $2, $3, $4, $5)`,
      [userId, keyHash, keyPrefix, name, tier]
    );

    return key;
  }

  async verifyApiKey(key: string): Promise<ApiKey | null> {
    const keyHash = createHash("sha256").update(key).digest("hex");
    
    const result = await this.pool.query<ApiKey>(
      `SELECT * FROM api_keys 
       WHERE key_hash = $1 AND revoked_at IS NULL`,
      [keyHash]
    );

    if (result.rows.length === 0) {
      return null;
    }

    const apiKey = result.rows[0]!;

    await this.pool.query(
      "UPDATE api_keys SET last_used_at = now() WHERE id = $1",
      [apiKey.id]
    );

    return apiKey;
  }

  async getUserApiKeys(userId: string): Promise<ApiKey[]> {
    const result = await this.pool.query<ApiKey>(
      `SELECT id, user_id, key_prefix, tier, name, created_at, last_used_at
       FROM api_keys 
       WHERE user_id = $1 AND revoked_at IS NULL
       ORDER BY created_at DESC`,
      [userId]
    );
    return result.rows;
  }

  async revokeApiKey(userId: string, keyId: string): Promise<boolean> {
    const result = await this.pool.query(
      `UPDATE api_keys 
       SET revoked_at = now()
       WHERE id = $1 AND user_id = $2 AND revoked_at IS NULL`,
      [keyId, userId]
    );
    return result.rowCount! > 0;
  }
}
