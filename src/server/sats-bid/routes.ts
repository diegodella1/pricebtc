import { registerAdminRoutes } from "./admin-routes.js";
import { uuid, day, pagination } from "./validation.js";
import { createHmac, randomBytes, randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import cookie from "@fastify/cookie";
import multipart from "@fastify/multipart";
import { normalizeLogo } from "./logo.js";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { BidError } from "./domain.js";
import { hash, type BidService, type Participant } from "./service.js";
import type { MockPaymentProvider } from "./provider.js";

const authCookie = "pricebtc_participant";
const adminCookie = "pricebtc_admin";
export async function registerBidRoutes(
  app: FastifyInstance,
  service: BidService,
  getBtcPrice?: () => Promise<number>,
) {
  await app.register(cookie);
  await app.register(multipart, {
    limits: { fileSize: 2 * 1024 * 1024, files: 1, fields: 0 },
  });
  const config = service.config;
  const secure = config.PUBLIC_SITE_URL.startsWith("https:");
  const prefix = "/api/sats-bid";
  const cookieOptions = {
    httpOnly: true,
    secure,
    sameSite: "lax" as const,
    path: "/",
  };
  const rateSecret = config.ADMIN_SESSION_SECRET || config.MOCK_WEBHOOK_SECRET;
  // Public read limits are per process, like the existing market API. Do not
  // turn every leaderboard read into a serialized write to one PostgreSQL row.
  const publicReaders = new Map<string, number>();
  let publicWindow = 0;
  function publicQuota(ip: string, reply: FastifyReply) {
    const window = Math.floor(Date.now() / 60000);
    if (window !== publicWindow) {
      publicReaders.clear();
      publicWindow = window;
    }
    const key = createHmac("sha256", rateSecret || "disabled-bidding")
      .update(`${window}:${ip}`)
      .digest("hex");
    const count = publicReaders.get(key) ?? 0;
    if (count >= 240 || (!count && publicReaders.size >= 10000)) {
      reply.header("Retry-After", "60");
      throw new BidError(
        "RATE_LIMITED",
        "Please wait before trying again.",
        429,
      );
    }
    publicReaders.set(key, count + 1);
  }

  function csrf(request: FastifyRequest) {
    if (
      request.headers.origin !== new URL(config.PUBLIC_SITE_URL).origin ||
      request.headers["x-sats-bid-csrf"] !== "1"
    )
      throw new BidError(
        "FORBIDDEN",
        "Request origin could not be verified.",
        403,
      );
  }
  async function quota(
    key: string,
    maximum: number,
    seconds: number,
    reply: FastifyReply,
  ) {
    const bucket = Math.floor(Date.now() / (seconds * 1000));
    const digest = createHmac("sha256", rateSecret || "disabled-bidding")
      .update(`${bucket}:${key}`)
      .digest("hex");
    const result = (
      await service.pool.query(
        "INSERT INTO rate_limits(key,count,expires_at) VALUES($1,1,$2) ON CONFLICT(key) DO UPDATE SET count=rate_limits.count+1 RETURNING count",
        [digest, new Date((bucket + 1) * seconds * 1000)],
      )
    ).rows[0];
    if (result.count > maximum) {
      reply.header("Retry-After", String(seconds));
      throw new BidError(
        "RATE_LIMITED",
        "Please wait before trying again.",
        429,
      );
    }
  }
  async function session(
    request: FastifyRequest,
    reply: FastifyReply,
    create = false,
  ): Promise<string> {
    const token = request.cookies[authCookie];
    if (token) {
      const found = (
        await service.pool.query(
          "UPDATE participant_sessions SET last_seen_at=$2,expires_at=$3 WHERE token_hash=$1 AND revoked_at IS NULL AND expires_at>$2 RETURNING id",
          [
            hash(token),
            service.clock(),
            new Date(service.clock().getTime() + 2592000000),
          ],
        )
      ).rows[0];
      if (found) {
        reply.setCookie(authCookie, token, {
          ...cookieOptions,
          maxAge: 2592000,
        });
        return found.id;
      }
    }
    if (!create)
      throw new BidError(
        "UNAUTHORIZED",
        "Create a participation in this browser first.",
        401,
      );
    const nextToken = randomBytes(32).toString("base64url");
    const id = randomUUID();
    await service.pool.query(
      "INSERT INTO participant_sessions(id,token_hash,expires_at) VALUES($1,$2,$3)",
      [id, hash(nextToken), new Date(service.clock().getTime() + 2592000000)],
    );
    reply.setCookie(authCookie, nextToken, {
      ...cookieOptions,
      maxAge: 2592000,
    });
    return id;
  }
  async function admin(request: FastifyRequest) {
    const token = request.cookies[adminCookie];
    if (!token)
      throw new BidError(
        "UNAUTHORIZED",
        "Sign in to administer Sats Bid.",
        401,
      );
    const row = (
      await service.pool.query(
        "SELECT admin_identity FROM admin_sessions WHERE token_hash=$1 AND expires_at>$2 AND revoked_at IS NULL",
        [hash(token), service.clock()],
      )
    ).rows[0];
    if (!row) throw new BidError("UNAUTHORIZED", "Admin session expired.", 401);
    return row.admin_identity as string;
  }
  app.addHook("onRequest", async (request, reply) => {
    const path = request.url.split("?")[0];
    if (
      path.startsWith(`${prefix}/admin`) &&
      path !== `${prefix}/admin/login`
    ) {
      const identity = await admin(request);
      await quota(`admin:${identity}:${request.ip}`, 120, 60, reply);
    }
    if (
      request.method === "GET" &&
      (path === `${prefix}/round/current` ||
        path === `${prefix}/leaderboard` ||
        path.startsWith(`${prefix}/history`))
    ) {
      publicQuota(request.ip, reply);
    }
    if (
      path.startsWith(prefix) &&
      request.method !== "GET" &&
      request.method !== "HEAD"
    )
      csrf(request);
    if (
      path.startsWith(prefix) &&
      ![
        `${prefix}/leaderboard`,
        `${prefix}/round/current`,
        `${prefix}/history`,
      ].includes(path) &&
      !path.startsWith(`${prefix}/history/`)
    )
      reply.header("Cache-Control", "no-store");
    reply.header("X-Robots-Tag", "noindex, nofollow");
  });
  app.setErrorHandler((error, request, reply) => {
    const validation = error instanceof z.ZodError;
    const bid = error instanceof BidError;
    const httpStatus =
      typeof error === "object" && error !== null && "statusCode" in error
        ? Number(error.statusCode)
        : 503;
    const status = bid
      ? error.statusCode
      : validation
        ? 422
        : httpStatus < 500
          ? httpStatus
          : 503;
    void reply.code(status).send({
      error: {
        code: bid
          ? error.code
          : validation
            ? "INVALID_INPUT"
            : status === 413
              ? "PAYLOAD_TOO_LARGE"
              : "BIDDING_UNAVAILABLE",
        message: bid
          ? error.message
          : validation
            ? "Check the submitted fields."
            : "Sats Bid is temporarily unavailable. Your Bitcoin price remains available.",
        request_id: request.id,
      },
    });
  });
  app.get(`${prefix}/round/current`, async () => {
    const round = await service.current();
    return {
      ...round,
      server_time: service.clock().toISOString(),
      enabled: config.SATS_BID_ENABLED,
      bids_open:
        (await service.bidsOpen()) &&
        service.clock().getTime() <
          round.ends_at.getTime() - config.BID_CUTOFF_SECONDS * 1000,
      minimum_sats: config.MINIMUM_BID_SATS,
      maximum_sats: config.MAXIMUM_BID_SATS,
      rules_version: config.RULES_VERSION,
      provider: config.PAYMENT_PROVIDER,
      support_contact_url: config.SUPPORT_CONTACT_URL,
    };
  });
  const leaderboard = async (
    request: FastifyRequest,
    reply: FastifyReply,
    date?: string,
  ) => {
    const page = pagination(request.query);
    const result = await service.leaderboard(
      date ?? page.date,
      page.offset,
      page.limit,
    );
    const etag = `"${result.round.id}-${result.version}-${page.offset}-${page.limit}"`;
    reply
      .header("ETag", etag)
      .header("Cache-Control", "public, max-age=0, must-revalidate");
    if (request.headers["if-none-match"] === etag)
      return reply.code(304).send();
    return result;
  };
  app.get(`${prefix}/leaderboard`, (request, reply) =>
    leaderboard(request, reply),
  );
  app.get(`${prefix}/history/:date`, (request, reply) =>
    leaderboard(
      request,
      reply,
      day.parse((request.params as { date: string }).date),
    ),
  );
  app.get(`${prefix}/history`, async (request) => {
    const page = pagination(request.query);
    const rows = (
      await service.pool.query(
        `SELECT r.id,r.date::text,r.status,r.result_revision,p.name AS winner,p.url AS winner_url,
      (SELECT coalesce(sum(amount_sats),0)::text FROM payments WHERE round_id=r.id AND credit_status='credited' AND settlement_status='settled') AS total_sats
      FROM rounds r LEFT JOIN participants p ON p.id=r.current_leader_id AND p.moderation_status='approved' AND NOT p.hidden
      WHERE r.ends_at<=$1 ORDER BY r.date DESC LIMIT $2 OFFSET $3`,
        [service.clock(), page.limit + 1, page.offset],
      )
    ).rows;
    return {
      rounds: rows.slice(0, page.limit),
      next_cursor:
        rows.length > page.limit
          ? Buffer.from(String(page.offset + page.limit)).toString("base64url")
          : null,
    };
  });
  app.post(`${prefix}/participants`, async (request, reply) => {
    await quota(`participant:${request.ip}`, 10, 3600, reply);
    const id = await session(request, reply, true);
    return service.profile(
      id,
      z
        .object({
          name: z.string(),
          description: z.string(),
          url: z.string(),
          logo_asset_id: uuid.optional(),
        })
        .parse(request.body),
    );
  });
  app.patch(`${prefix}/participants/me`, async (request, reply) =>
    service.profile(
      await session(request, reply),
      z
        .object({
          name: z.string(),
          description: z.string(),
          url: z.string(),
          logo_asset_id: uuid.nullable().optional(),
        })
        .parse(request.body),
      true,
    ),
  );
  app.get(`${prefix}/participants/me`, async (request, reply) => {
    if (!request.cookies[authCookie])
      return { participant: null, payment: null };
    let id: string;
    try {
      id = await session(request, reply);
    } catch (error) {
      if (!(error instanceof BidError) || error.statusCode !== 401) throw error;
      reply.clearCookie(authCookie, cookieOptions);
      return { participant: null, payment: null, total_sats: "0" };
    }
    await quota(`private:${id}`, 60, 60, reply);
    const round = await service.current();
    const participant =
      (
        await service.pool.query<Participant>(
          "SELECT * FROM participants WHERE session_id=$1 AND round_id=$2",
          [id, round.id],
        )
      ).rows[0] ?? null;
    const draft =
      (
        await service.pool.query(
          "SELECT name,description,url FROM participants WHERE session_id=$1 ORDER BY created_at DESC LIMIT 1",
          [id],
        )
      ).rows[0] ?? null;
    const currentPayment = participant
      ? ((
          await service.pool.query(
            "SELECT id FROM payments WHERE participant_id=$1 ORDER BY created_at DESC LIMIT 1",
            [participant.id],
          )
        ).rows[0] ?? null)
      : null;
    const total = participant
      ? ((
          await service.pool.query(
            "SELECT total_sats FROM participant_totals WHERE participant_id=$1",
            [participant.id],
          )
        ).rows[0]?.total_sats ?? "0")
      : "0";
    const payment =
      currentPayment ??
      (
        await service.pool.query(
          "SELECT pay.id,pay.round_id FROM payments pay JOIN participants p ON p.id=pay.participant_id WHERE p.session_id=$1 AND (pay.creation_status IN ('creating','creation_unknown') OR pay.credit_status='review' OR (pay.creation_status='ready' AND pay.settlement_status IN ('pending','processing') AND pay.credit_status='uncredited')) ORDER BY pay.created_at DESC LIMIT 1",
          [id],
        )
      ).rows[0] ??
      null;
    return {
      participant,
      draft,
      payment,
      total_sats: total,
      profile_locked: !!currentPayment,
    };
  });
  app.post(`${prefix}/bids`, async (request, reply) => {
    const id = await session(request, reply);
    await quota(`bid-session:${id}`, 10, 600, reply);
    await quota(`bid-ip:${request.ip}`, 30, 600, reply);
    const input = z
      .object({
        amount_sats: z.string(),
        rules_version: z.string(),
        accepted_rules: z.literal(true),
        round_id: uuid,
      })
      .parse(request.body);
    const payment = await service.createBid(
      id,
      String(request.headers["idempotency-key"] ?? ""),
      input,
    );
    reply.code(payment.creation_status === "ready" ? 201 : 202);
    return { id: payment.id, creation_status: payment.creation_status };
  });
  app.get(`${prefix}/payments/:id`, async (request, reply) => {
    const payment = await service.payment(
      uuid.parse((request.params as { id: string }).id),
    );
    let owned = false;
    if (request.cookies[authCookie]) {
      const owner = await session(request, reply);
      await quota(`private:${owner}`, 60, 60, reply);
      owned = !!(
        await service.pool.query(
          "SELECT 1 FROM participants WHERE id=$1 AND session_id=$2",
          [payment.participant_id, owner],
        )
      ).rowCount;
    }
    if (!owned) {
      try {
        await admin(request);
      } catch {
        throw new BidError("NOT_FOUND", "Payment not found.", 404);
      }
    }
    const valid =
      payment.creation_status === "ready" &&
      payment.credit_status === "uncredited" &&
      payment.settlement_status === "pending" &&
      payment.expires_at &&
      payment.expires_at > service.clock();
    return {
      id: payment.id,
      amount_sats: payment.amount_sats,
      round_date: payment.created_at.toISOString().slice(0, 10),
      creation_status: payment.creation_status,
      settlement_status: payment.settlement_status,
      credit_status: payment.credit_status,
      expires_at: payment.expires_at,
      review_reason: payment.review_reason,
      bolt11: valid ? payment.bolt11 : null,
      provider: payment.provider,
      server_time: service.clock().toISOString(),
    };
  });
  app.post(
    `${prefix}/assets/logo`,
    { bodyLimit: 2 * 1024 * 1024 + 4096 },
    async (request, reply) => {
      const owner = await session(request, reply, true);
      await quota(`upload:${owner}`, 10, 3600, reply);
      const file = await request.file();
      if (!file)
        throw new BidError(
          "INVALID_ASSET",
          "Choose a PNG, JPEG or WebP image.",
        );
      const buffer = await file.toBuffer();
      const result = await normalizeLogo(buffer);
      const id = randomUUID();
      const key = `${id}.webp`;
      await mkdir(join(config.PRICEBTC_DATA_DIR, "logos"), { recursive: true });
      await writeFile(
        join(config.PRICEBTC_DATA_DIR, "logos", key),
        result.data,
        { flag: "wx", mode: 0o600 },
      );
      await service.pool.query(
        "INSERT INTO assets(id,storage_key,session_id,mime,byte_size,width,height) VALUES($1,$2,$3,'image/webp',$4,$5,$6)",
        [id, key, owner, result.data.length, result.width, result.height],
      );
      return { id };
    },
  );
  app.get(`${prefix}/assets/:id`, async (request, reply) => {
    const id = uuid.parse((request.params as { id: string }).id);
    const row = (
      await service.pool.query(
        `SELECT a.storage_key FROM assets a WHERE a.id=$1 AND (
          EXISTS(
            SELECT 1 FROM participants p 
            JOIN participant_totals t ON t.participant_id=p.id 
            WHERE p.logo_asset_id=a.id 
              AND NOT p.hidden 
              AND p.moderation_status='approved' 
              AND t.total_sats>0
          )
          OR EXISTS(
            SELECT 1 FROM participants p
            JOIN sponsor_usd_totals s ON s.participant_id=p.id
            WHERE p.logo_asset_id=a.id
              AND NOT p.hidden
              AND p.moderation_status='approved'
              AND s.total_usd>0
          )
        )`,
        [id],
      )
    ).rows[0];
    if (!row) throw new BidError("NOT_FOUND", "Logo not found.", 404);
    reply.type("image/webp").header("Cache-Control", "no-store");
    return readFile(join(config.PRICEBTC_DATA_DIR, "logos", row.storage_key));
  });
  await app.register(async (webhook) => {
    webhook.removeContentTypeParser("application/json");
    webhook.addContentTypeParser(
      "application/json",
      { parseAs: "buffer", bodyLimit: 256 * 1024 },
      (_request, body, done) => done(null, body),
    );
    webhook.post(
      "/api/webhooks/btcpay",
      { bodyLimit: 256 * 1024, config: { rateLimit: false } },
      async (request, reply) => {
        if (config.PAYMENT_PROVIDER !== "btcpay") return reply.code(404).send();
        await service.receive(
          request.body as Buffer,
          String(request.headers["btcpay-sig"] ?? ""),
        );
        return reply.code(202).send({ received: true });
      },
    );
  });
  if (
    config.APP_ENV !== "production" &&
    config.PAYMENT_PROVIDER === "mock" &&
    config.MOCK_PAYMENTS_ENABLED
  )
    app.post(`${prefix}/dev/payments/:id/simulate`, async (request, reply) => {
      const owner = await session(request, reply);
      const id = uuid.parse((request.params as { id: string }).id);
      const payment = await service.payment(id);
      if (
        !(
          await service.pool.query(
            "SELECT 1 FROM participants WHERE id=$1 AND session_id=$2",
            [payment.participant_id, owner],
          )
        ).rowCount
      )
        throw new BidError("NOT_FOUND", "Payment not found.", 404);
      const scenario = z
        .object({
          scenario: z
            .enum(["settle", "expire", "mismatch", "lost", "duplicate"])
            .default("settle"),
        })
        .parse(request.body ?? {}).scenario;
      const event = await (service.provider as MockPaymentProvider).simulate(
        payment.provider_invoice_id!,
        scenario,
      );
      if (scenario !== "lost")
        await service.receive(event.raw, event.signature);
      if (scenario === "duplicate")
        await service.receive(event.raw, event.signature);
      return { queued: true };
    });
  registerAdminRoutes(app, service, { admin, quota, cookieOptions });
  app.post(`${prefix}/events`, async (request, reply) => {
    await quota(`events:${request.ip}`, 60, 60, reply);
    const { type } = z
      .object({
        type: z.enum([
          "homepage_view",
          "take_spot_clicked",
          "bid_form_submitted",
          "invoice_displayed",
          "invoice_copied",
          "wallet_open_clicked",
          "top_spot_link_clicked",
        ]),
      })
      .parse(request.body);
    await service.pool.query(
      "INSERT INTO client_events(id,type) VALUES($1,$2)",
      [randomUUID(), type],
    );
    return reply.code(202).send({ received: true });
  });

  const { registerCryptoRoutes } = await import("./crypto-routes.js");
  await registerCryptoRoutes(app, service.pool, service.config, session, quota, csrf, service.clock, getBtcPrice);
}
