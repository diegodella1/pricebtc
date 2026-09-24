import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import type pg from "pg";
import { BidError, validateProfile } from "./domain.js";
import type { BidConfig } from "./config.js";
import {
  createCryptoPayment,
  getCryptoPayment,
  getAvailableAssets,
  type AssetType,
} from "./crypto-sponsors.js";

const uuid = z.string().uuid();

export async function registerCryptoRoutes(
  app: FastifyInstance,
  pool: pg.Pool,
  config: BidConfig,
  getSession: (request: FastifyRequest, reply: FastifyReply, create?: boolean) => Promise<string>,
  quota: (key: string, max: number, seconds: number, reply: FastifyReply) => Promise<void>,
  csrf: (request: FastifyRequest) => void,
  clock: () => Date = () => new Date(),
  getBtcPrice?: () => Promise<number>,
) {
  const prefix = "/api/sats-bid/crypto-sponsors";

  app.get(`${prefix}/config`, async () => {
    const assets = getAvailableAssets(config);
    const btcPriceUsd = getBtcPrice ? await getBtcPrice() : 0;
    return {
      enabled: assets.length > 0,
      btcPriceUsd: btcPriceUsd.toFixed(2),
      assets: assets.map((a) => ({
        type: a.type,
        address: a.address,
        label: a.label,
        network: a.network,
        minUsd: a.minUsd,
        confirmations: a.confirmations,
        warningMessage: a.warningMessage,
        confirmationWaitMessage: a.confirmationWaitMessage,
      })),
    };
  });

  app.post(`${prefix}/payments`, async (request, reply) => {
    csrf(request);
    const sessionId = await getSession(request, reply, true);
    await quota(`crypto-payment:${sessionId}`, 5, 600, reply);
    await quota(`crypto-payment-ip:${request.ip}`, 20, 3600, reply);

    const input = z
      .object({
        name: z.string().optional(),
        description: z.string().optional(),
        url: z.string().optional(),
        logo_asset_id: uuid.nullable().optional(),
        asset_type: z.enum(["USDT_TRC20", "USDC_SOL", "BTC"]),
        tx_hash: z.string().optional(),
      })
      .parse(request.body);

    let profile = { name: "", description: "", url: "", normalized_domain: "" };
    
    if (input.name && input.description && input.url) {
      profile = validateProfile({
        name: input.name,
        description: input.description,
        url: input.url,
      });
    }

    const payment = await createCryptoPayment(pool, config, sessionId, {
      ...profile,
      logo_asset_id: input.logo_asset_id || null,
      asset_type: input.asset_type as AssetType,
      tx_hash: input.tx_hash || null,
    }, clock);

    reply.code(202);
    return {
      id: payment.id,
      validation_status: payment.validation_status,
    };
  });

  app.get(`${prefix}/payments/:id`, async (request, reply) => {
    const id = uuid.parse((request.params as { id: string }).id);
    const payment = await getCryptoPayment(pool, id);

    if (!payment) {
      throw new BidError("NOT_FOUND", "Payment not found.", 404);
    }

    let owned = false;
    if (request.cookies?.pricebtc_participant) {
      try {
        const sessionId = await getSession(request, reply);
        await quota(`private:${sessionId}`, 60, 60, reply);
        owned = payment.session_id === sessionId;
      } catch {
        // Not authenticated, check admin below
      }
    }

    if (!owned) {
      throw new BidError("NOT_FOUND", "Payment not found.", 404);
    }

    return {
      id: payment.id,
      asset_type: payment.asset_type,
      tx_hash: payment.tx_hash,
      amount_usd: payment.amount_usd,
      validation_status: payment.validation_status,
      confirmations: payment.confirmations,
      required_confirmations: payment.required_confirmations,
      validation_error: payment.validation_error,
      created_at: payment.created_at.toISOString(),
      validated_at: payment.validated_at?.toISOString() || null,
      confirmed_at: payment.confirmed_at?.toISOString() || null,
      server_time: clock().toISOString(),
      name: payment.name,
      description: payment.description,
      url: payment.url,
      logo_asset_id: payment.logo_asset_id,
    };
  });

  app.patch(`${prefix}/payments/:id/profile`, async (request, reply) => {
    csrf(request);
    const id = uuid.parse((request.params as { id: string }).id);
    const sessionId = await getSession(request, reply);
    await quota(`crypto-profile:${sessionId}`, 10, 600, reply);

    const payment = await getCryptoPayment(pool, id);
    if (!payment || payment.session_id !== sessionId) {
      throw new BidError("NOT_FOUND", "Payment not found.", 404);
    }

    const input = z
      .object({
        name: z.string(),
        description: z.string(),
        url: z.string(),
        logo_asset_id: uuid.nullable().optional(),
      })
      .parse(request.body);

    const profile = validateProfile({
      name: input.name,
      description: input.description,
      url: input.url,
    });

    await pool.query(
      `UPDATE crypto_sponsors 
       SET name = $1, description = $2, url = $3, normalized_domain = $4, logo_asset_id = $5
       WHERE id = $6`,
      [profile.name, profile.description, profile.url, profile.normalized_domain, input.logo_asset_id || null, id]
    );

    return { success: true };
  });

  app.get(`${prefix}/leaderboard`, async (request, reply) => {
    const limit = Math.min(
      Math.max(1, Number((request.query as { limit?: string })?.limit) || 21),
      100,
    );

    const result = await pool.query(
      `SELECT 
        p.id, p.name, p.description, p.url, p.normalized_domain, 
        p.logo_asset_id, t.total_usd, t.payment_count
      FROM sponsor_usd_totals t
      JOIN participants p ON p.id = t.participant_id
      WHERE p.moderation_status = 'approved' AND NOT p.hidden AND t.total_usd > 0
      ORDER BY t.total_usd DESC, t.last_payment_at ASC
      LIMIT $1`,
      [limit],
    );

    const participants = result.rows.map((row, index) => ({
      id: row.id,
      name: row.name,
      description: row.description,
      url: row.url,
      normalized_domain: row.normalized_domain,
      logo_asset_id: row.logo_asset_id,
      total_usd: Number(row.total_usd).toFixed(2),
      payment_count: row.payment_count,
      position: index + 1,
    }));

    const totalResult = await pool.query(
      "SELECT COALESCE(SUM(total_usd), 0) as total FROM sponsor_usd_totals WHERE total_usd > 0",
    );

    reply.header("Cache-Control", "public, max-age=5");

    return {
      participants,
      leader: participants[0] || null,
      total_usd: Number(totalResult.rows[0].total).toFixed(2),
      participant_count: participants.length,
      server_time: clock().toISOString(),
    };
  });
}
