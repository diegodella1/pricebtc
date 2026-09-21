import { randomBytes, randomUUID } from "node:crypto";
import argon2 from "argon2";
import { z } from "zod";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import {
  BidError,
  normalizedDomain,
  roundWindow,
  validateProfile,
} from "./domain.js";
import {
  hash,
  type BidService,
  type Participant,
  type Round,
} from "./service.js";
import { transaction } from "./db.js";
import { biddingHealth } from "./health.js";
import { uuid, day, pagination } from "./validation.js";
interface AdminContext {
  admin: (request: FastifyRequest) => Promise<string>;
  quota: (
    key: string,
    maximum: number,
    seconds: number,
    reply: FastifyReply,
  ) => Promise<void>;
  cookieOptions: {
    httpOnly: boolean;
    secure: boolean;
    sameSite: "lax";
    path: string;
  };
}
export function registerAdminRoutes(
  app: FastifyInstance,
  service: BidService,
  { admin, quota, cookieOptions }: AdminContext,
) {
  const prefix = "/api/sats-bid";
  const config = service.config;
  const adminCookie = "pricebtc_admin";
  app.post(`${prefix}/admin/login`, async (request, reply) => {
    const body = z
      .object({ email: z.string().max(200), password: z.string().max(1024) })
      .parse(request.body);
    await quota(
      `login:${request.ip}:${body.email.toLowerCase()}`,
      5,
      900,
      reply,
    );
    if (
      !config.ADMIN_PASSWORD_HASH ||
      body.email.toLowerCase() !== config.ADMIN_EMAIL.toLowerCase() ||
      !(await argon2.verify(config.ADMIN_PASSWORD_HASH, body.password))
    )
      throw new BidError("UNAUTHORIZED", "Invalid email or password.", 401);
    const token = randomBytes(32).toString("base64url");
    await service.pool.query(
      "INSERT INTO admin_sessions(id,token_hash,admin_identity,expires_at) VALUES($1,$2,$3,$4)",
      [
        randomUUID(),
        hash(token),
        config.ADMIN_EMAIL,
        new Date(service.clock().getTime() + 28800000),
      ],
    );
    reply.setCookie(adminCookie, token, { ...cookieOptions, maxAge: 28800 });
    return { authenticated: true };
  });
  app.post(`${prefix}/admin/logout`, async (request, reply) => {
    await service.pool.query(
      "UPDATE admin_sessions SET revoked_at=$2 WHERE token_hash=$1",
      [hash(request.cookies[adminCookie] ?? ""), service.clock()],
    );
    reply.clearCookie(adminCookie, cookieOptions);
    return { authenticated: false };
  });
  for (const name of [
    "rounds",
    "participants",
    "payments",
    "blocked-domains",
    "incidents",
  ] as const)
    app.get(`${prefix}/admin/${name}`, async (request) => {
      const page = pagination(request.query);
      const table = {
        rounds: "rounds",
        participants: "participants",
        payments: "payments",
        "blocked-domains": "blocked_domains",
        incidents: "invoice_references",
      }[name];
      const order =
        name === "rounds"
          ? "date DESC"
          : name === "incidents"
            ? "discovered_at DESC"
            : "created_at DESC";
      const columns =
        name === "payments"
          ? "id,participant_id,round_id,provider,provider_store_id,provider_invoice_id,amount_sats,creation_status,settlement_status,credit_status,review_reason,snapshot,created_at"
          : "*";
      const filters = z
        .object({
          round_id: uuid.optional(),
          participant_id: uuid.optional(),
          invoice_id: z.string().max(200).optional(),
          domain: z.string().max(253).optional(),
          moderation_status: z
            .enum(["pending", "approved", "rejected"])
            .optional(),
          credit_status: z
            .enum(["uncredited", "credited", "review", "excluded"])
            .optional(),
          from: day.optional(),
          to: day.optional(),
        })
        .parse(request.query);
      const values: unknown[] = [page.limit + 1, page.offset];
      const conditions: string[] = [];
      function filter(column: string, value: unknown, operator = "=") {
        if (value === undefined || value === "") return;
        values.push(value);
        conditions.push(`${column} ${operator} $${values.length}`);
      }
      if (name === "participants" || name === "payments")
        filter("round_id", filters.round_id);
      if (name === "participants") {
        filter("moderation_status", filters.moderation_status);
        if (filters.domain)
          filter("normalized_domain", normalizedDomain(filters.domain));
      }
      if (name === "payments") {
        filter("participant_id", filters.participant_id);
        filter("provider_invoice_id", filters.invoice_id);
        filter("credit_status", filters.credit_status);
      }
      if (name !== "incidents") {
        filter(name === "rounds" ? "date" : "created_at", filters.from, ">=");
        if (filters.to)
          filter(
            name === "rounds" ? "date" : "created_at",
            new Date(new Date(filters.to).getTime() + 86400000),
            "<",
          );
      }
      const rows = (
        await service.pool.query(
          `SELECT ${columns} FROM ${table}${conditions.length ? " WHERE " + conditions.join(" AND ") : ""} ORDER BY ${order} LIMIT $1 OFFSET $2`,
          values,
        )
      ).rows;
      return {
        items: rows.slice(0, page.limit),
        next_cursor:
          rows.length > page.limit
            ? Buffer.from(String(page.offset + page.limit)).toString(
                "base64url",
              )
            : null,
      };
    });
  app.patch(`${prefix}/admin/participants/:id`, async (request) => {
    const id = uuid.parse((request.params as { id: string }).id);
    const actor = await admin(request);
    const body = z
      .object({
        action: z.enum(["approve", "reject", "hide", "unhide", "edit"]),
        reason: z.string().trim().min(1).max(500),
        version: z.number().int(),
        name: z.string().optional(),
        description: z.string().optional(),
        url: z.string().optional(),
      })
      .parse(request.body);
    return transaction(service.pool, async (sql) => {
      const p = (
        await sql.query<Participant>("SELECT * FROM participants WHERE id=$1", [
          id,
        ])
      ).rows[0];
      if (!p) throw new BidError("NOT_FOUND", "Participant not found.", 404);
      const round = (
        await sql.query<Round>(
          "SELECT *,date::text FROM rounds WHERE id=$1 FOR UPDATE",
          [p.round_id],
        )
      ).rows[0];
      const locked = (
        await sql.query<Participant>(
          "SELECT * FROM participants WHERE id=$1 FOR UPDATE",
          [id],
        )
      ).rows[0];
      if (locked.version !== body.version)
        throw new BidError(
          "VERSION_CONFLICT",
          "This participant changed. Refresh first.",
          409,
        );
      const profile =
        body.action === "edit"
          ? validateProfile({
              name: body.name ?? locked.name,
              description: body.description ?? locked.description,
              url: body.url ?? locked.url,
            })
          : locked;
      if (
        ["approve", "unhide", "edit"].includes(body.action) &&
        (
          await sql.query(
            "SELECT 1 FROM blocked_domains WHERE disabled_at IS NULL AND (normalized_domain=$1 OR (include_subdomains AND right($1,length(normalized_domain)+1)='.'||normalized_domain))",
            [profile.normalized_domain],
          )
        ).rowCount
      )
        throw new BidError(
          "DOMAIN_BLOCKED",
          "Unblock the domain before restoring this content.",
          409,
        );
      const hidden =
        body.action === "hide"
          ? true
          : body.action === "unhide"
            ? false
            : locked.hidden;
      const status =
        body.action === "approve"
          ? "approved"
          : body.action === "reject"
            ? "rejected"
            : locked.moderation_status;
      const after = (
        await sql.query(
          "UPDATE participants SET name=$2,description=$3,url=$4,normalized_domain=$5,hidden=$6,moderation_status=$7,moderation_reason=$8,version=version+1,updated_at=now() WHERE id=$1 RETURNING *",
          [
            id,
            profile.name,
            profile.description,
            profile.url,
            profile.normalized_domain,
            hidden,
            status,
            body.reason,
          ],
        )
      ).rows[0];
      await sql.query(
        "INSERT INTO moderation_actions(id,participant_id,admin_id,action,reason,before_json,after_json) VALUES($1,$2,$3,$4,$5,$6,$7)",
        [randomUUID(), id, actor, body.action, body.reason, locked, after],
      );
      await service.audit(
        sql,
        actor,
        body.action,
        "participant",
        id,
        body.reason,
        locked,
        after,
      );
      await service.event(
        sql,
        "moderation_action",
        randomUUID(),
        round.id,
        id,
        null,
        "moderation",
        null,
      );
      await service.refreshLeader(
        sql,
        round,
        "moderation",
        null,
        round.credit_sequence,
      );
      if (round.status === "closed")
        await sql.query(
          "UPDATE rounds SET result_revision=result_revision+1 WHERE id=$1",
          [round.id],
        );
      return after;
    });
  });
  app.post(`${prefix}/admin/payments/:id/reconcile`, async (request) => {
    const id = uuid.parse((request.params as { id: string }).id);
    await service.payment(id);
    await service.pool.query(
      "INSERT INTO verification_requests(payment_id,requested_by) VALUES($1,$2) ON CONFLICT(payment_id) DO UPDATE SET created_at=now(),requested_by=excluded.requested_by",
      [id, await admin(request)],
    );
    await service.pool.query(
      "UPDATE payments SET next_retry_at=$2,retry_count=0 WHERE id=$1",
      [id, service.clock()],
    );
    await service.audit(
      service.pool,
      await admin(request),
      "reconcile",
      "payment",
      id,
      "Operator requested verification",
    );
    return { queued: true };
  });
  app.post(`${prefix}/admin/payments/:id/resolve`, async (request) => {
    const actor = await admin(request);
    const id = uuid.parse((request.params as { id: string }).id);
    const { reason } = z
      .object({ reason: z.string().trim().min(1).max(500) })
      .parse(request.body);
    await transaction(service.pool, async (sql) => {
      const p = (
        await sql.query("SELECT * FROM payments WHERE id=$1 FOR UPDATE", [id])
      ).rows[0];
      if (!p || p.credit_status !== "review" || p.creation_status !== "ready")
        throw new BidError(
          "INVALID_RESOLUTION",
          "Only verified review cases can be excluded.",
          409,
        );
      await sql.query(
        "UPDATE payments SET credit_status='excluded',resolved_at=$2,resolution_reason=$3 WHERE id=$1",
        [id, service.clock(), reason],
      );
      await service.audit(
        sql,
        actor,
        "resolve_without_credit",
        "payment",
        id,
        reason,
        { credit_status: p.credit_status },
        { credit_status: "excluded" },
      );
    });
    return { resolved: true };
  });
  app.patch(`${prefix}/admin/settings`, async (request) => {
    const { paused } = z.object({ paused: z.boolean() }).parse(request.body);
    const actor = await admin(request);
    await transaction(service.pool, async (sql) => {
      await sql.query(
        "INSERT INTO operational_settings(key,value,updated_by) VALUES('paused',$1,$2) ON CONFLICT(key) DO UPDATE SET value=excluded.value,version=operational_settings.version+1,updated_by=excluded.updated_by",
        [JSON.stringify(paused), actor],
      );
      await service.audit(
        sql,
        actor,
        "pause",
        "settings",
        "paused",
        "Operator toggled new invoices",
        null,
        { paused },
      );
    });
    return { paused, environment_enabled: config.BIDS_ENABLED };
  });
  app.post(`${prefix}/admin/blocked-domains`, async (request) => {
    const body = z
      .object({
        domain: z.string(),
        include_subdomains: z.boolean().default(true),
        reason: z.string().trim().min(1).max(500),
      })
      .parse(request.body);
    const domain = normalizedDomain(body.domain);
    const actor = await admin(request);
    await transaction(service.pool, async (sql) => {
      const rounds = (
        await sql.query<Round>(
          "SELECT r.* FROM rounds r WHERE EXISTS(SELECT 1 FROM participants p WHERE p.round_id=r.id AND (p.normalized_domain=$1 OR ($2 AND right(p.normalized_domain,length($1)+1)='.'||$1))) ORDER BY r.date FOR UPDATE",
          [domain, body.include_subdomains],
        )
      ).rows;
      await sql.query(
        "INSERT INTO blocked_domains(id,normalized_domain,include_subdomains,reason,created_by) VALUES($1,$2,$3,$4,$5) ON CONFLICT(normalized_domain) DO UPDATE SET disabled_at=NULL,reason=excluded.reason,include_subdomains=excluded.include_subdomains",
        [randomUUID(), domain, body.include_subdomains, body.reason, actor],
      );
      await sql.query(
        "UPDATE participants SET hidden=true,version=version+1,moderation_reason=$3 WHERE normalized_domain=$1 OR ($2 AND right(normalized_domain,length($1)+1)='.'||$1)",
        [domain, body.include_subdomains, body.reason],
      );
      for (const round of rounds) {
        await service.refreshLeader(
          sql,
          round,
          "moderation",
          null,
          round.credit_sequence,
        );
        if (round.status === "closed")
          await sql.query(
            "UPDATE rounds SET result_revision=result_revision+1 WHERE id=$1",
            [round.id],
          );
      }
      await service.audit(
        sql,
        actor,
        "block_domain",
        "domain",
        domain,
        body.reason,
        null,
        body,
      );
    });
    return { blocked: true };
  });
  app.delete(`${prefix}/admin/blocked-domains/:id`, async (request) => {
    const id = uuid.parse((request.params as { id: string }).id);
    await service.pool.query(
      "UPDATE blocked_domains SET disabled_at=$2 WHERE id=$1",
      [id, service.clock()],
    );
    await service.audit(
      service.pool,
      await admin(request),
      "unblock_domain",
      "domain",
      id,
      "Domain unblocked; participants remain hidden",
    );
    return { disabled: true };
  });
  app.post(`${prefix}/admin/reconcile`, async (request) => {
    const body = z.object({ from: day, to: day }).parse(request.body);
    const since = new Date(body.from);
    const until = new Date(`${body.to}T23:59:59Z`);
    if (until < since || until.getTime() - since.getTime() > 31 * 86400000)
      throw new BidError(
        "INVALID_INTERVAL",
        "Choose an interval of up to 31 days.",
      );
    await service.pool.query(
      "INSERT INTO verification_requests(payment_id,requested_by) SELECT id,$3 FROM payments WHERE created_at BETWEEN $1 AND $2 ON CONFLICT(payment_id) DO UPDATE SET created_at=now(),requested_by=excluded.requested_by",
      [since, until, await admin(request)],
    );
    await service.pool.query(
      "UPDATE payments SET next_retry_at=$3,retry_count=0 WHERE created_at BETWEEN $1 AND $2",
      [since, until, service.clock()],
    );
    await service.pool.query(
      "INSERT INTO operational_settings(key,value) VALUES('audit_cursor',$1) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
      [{ since, until, offset: 0, next_at: 0 }],
    );
    return { queued: true };
  });
  app.get(`${prefix}/admin/health`, () => biddingHealth(service));
  app.get(`${prefix}/admin/analytics`, async (request) => {
    const { days } = z
      .object({
        days: z.coerce
          .number()
          .refine((n) => [1, 7, 30].includes(n))
          .default(7),
      })
      .parse(request.query);
    const since = new Date(
      roundWindow(service.clock()).starts.getTime() - (days - 1) * 86400000,
    );
    const rows = (
      await service.pool.query(
        "SELECT e.type,count(*)::int AS count,count(DISTINCT(e.participant_id,e.round_id))::int AS participants FROM domain_events e JOIN rounds r ON r.id=e.round_id WHERE r.starts_at>=$1 AND r.starts_at<=$2 GROUP BY e.type",
        [since, service.clock()],
      )
    ).rows;
    const denominator =
      rows.find((r) => r.type === "participant_outbid")?.participants ?? 0;
    const numerator =
      rows.find((r) => r.type === "repeat_bid_after_outbid")?.participants ?? 0;
    const payments = (
      await service.pool.query(
        `SELECT
      coalesce(sum(p.amount_sats) FILTER(WHERE p.credit_status='credited'),0)::text AS gross_sats,
      count(*) FILTER(WHERE p.creation_status='ready')::int AS invoices_created,
      count(*) FILTER(WHERE p.credit_status='credited')::int AS payments_credited,
      count(DISTINCT p.participant_id) FILTER(WHERE p.credit_status='credited')::int AS paying_participants,
      avg(extract(epoch FROM (p.credited_at-p.provider_received_at))) FILTER(WHERE p.credit_status='credited')::float8 AS mean_confirmation_seconds
      FROM payments p JOIN rounds r ON r.id=p.round_id WHERE r.starts_at >= $1 AND r.starts_at <= $2`,
        [since, service.clock()],
      )
    ).rows[0];
    const jobs = (
      await service.pool.query("SELECT name,last_success_at FROM job_leases")
    ).rows;
    return {
      days,
      events: rows,
      repeat_bid_after_outbid: numerator,
      participants_outbid: denominator,
      recovery_rate: denominator ? numerator / denominator : null,
      ...payments,
      invoice_conversion: payments.invoices_created
        ? payments.payments_credited / payments.invoices_created
        : null,
      payments_per_participant: payments.paying_participants
        ? payments.payments_credited / payments.paying_participants
        : null,
      reconciled_percentage: payments.payments_credited
        ? (rows.find((r) => r.type === "payment_reconciled")?.count ?? 0) /
          payments.payments_credited
        : null,
      jobs,
    };
  });
}
