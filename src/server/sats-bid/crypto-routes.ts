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
import { hash } from "./service.js";

const uuid = z.string().uuid();

export async function registerCryptoRoutes(
  app: FastifyInstance,
  pool: pg.Pool,
  config: BidConfig,
  getSession: (request: FastifyRequest, reply: FastifyReply, create?: boolean) => Promise<string>,
  quota: (key: string, max: number, seconds: number, reply: FastifyReply) => Promise<void>,
  csrf: (request: FastifyRequest) => void,
  clock: () => Date = () => new Date(),
) {
  const prefix = "/api/crypto-sponsors";

  app.get(`${prefix}/config`, async () => {
    const assets = getAvailableAssets(config);
    return {
      enabled: assets.length > 0,
      assets: assets.map((a) => ({
        type: a.type,
        address: a.address,
        label: a.label,
        network: a.network,
        minUsd: a.minUsd,
        confirmations: a.confirmations,
        warningMessage: a.warningMessage,
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
        name: z.string(),
        description: z.string(),
        url: z.string(),
        logo_asset_id: uuid.nullable().optional(),
        asset_type: z.enum(["USDT_TRC20", "USDC_SOL", "BTC"]),
        tx_hash: z.string(),
      })
      .parse(request.body);

    const profile = validateProfile({
      name: input.name,
      description: input.description,
      url: input.url,
    });

    const payment = await createCryptoPayment(pool, config, sessionId, {
      ...profile,
      logo_asset_id: input.logo_asset_id || null,
      asset_type: input.asset_type as AssetType,
      tx_hash: input.tx_hash,
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
    };
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
