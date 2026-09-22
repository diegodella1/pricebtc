import { createHash, randomUUID } from "node:crypto";
import type pg from "pg";
import { transaction, type Sql } from "./db.js";
import {
  amount,
  BidError,
  invoiceDeadline,
  MAX_INT64,
  roundWindow,
  validateProfile,
} from "./domain.js";
import type { BidConfig } from "./config.js";
import type { InvoiceSnapshot, PaymentProvider } from "./provider.js";

export interface Leaderboard {
  round: Round & { updated_at: Date };
  participants: (Pick<
    Participant,
    | "id"
    | "name"
    | "description"
    | "url"
    | "normalized_domain"
    | "logo_asset_id"
  > & {
    total_sats: string;
    total_reached_sequence: string;
    position: number;
  })[];
  leader: Leaderboard["participants"][number] | null;
  total_sats: string;
  participant_count: number;
  version: string;
  updated_at: Date;
  server_time: string;
  next_cursor: string | null;
}

export const hash = (value: string | Buffer) =>
  createHash("sha256").update(value).digest("hex");
export interface Round {
  id: string;
  date: string;
  starts_at: Date;
  ends_at: Date;
  status: string;
  credit_sequence: string;
  version: string;
  current_leader_id: string | null;
  result_revision: number;
}
export interface Participant {
  id: string;
  session_id: string;
  round_id: string;
  name: string;
  description: string;
  url: string;
  normalized_domain: string;
  logo_asset_id: string | null;
  moderation_status: string;
  hidden: boolean;
  version: number;
}
export interface Payment {
  id: string;
  participant_id: string;
  round_id: string;
  provider: string;
  provider_store_id: string;
  provider_invoice_id: string | null;
  amount_sats: string;
  creation_status: string;
  settlement_status: string;
  credit_status: string;
  requested_expires_at: Date;
  expires_at: Date | null;
  created_at: Date;
  retry_count: number;
  bolt11: string | null;
  review_reason: string | null;
}
export class BidService {
  constructor(
    public pool: pg.Pool,
    public config: BidConfig,
    public provider: PaymentProvider,
    public clock = () => new Date(),
  ) {}
  async current(sql: Sql = this.pool): Promise<Round> {
    const window = roundWindow(this.clock());
    const existing = (
      await sql.query<Round>("SELECT *,date::text FROM rounds WHERE date=$1", [
        window.date,
      ])
    ).rows[0];
    if (existing) return existing;
    if (sql === this.pool)
      return transaction(this.pool, (connection) => this.current(connection));
    const result = await sql.query<Round>(
      "INSERT INTO rounds(id,date,starts_at,ends_at) VALUES($1,$2,$3,$4) ON CONFLICT(date) DO UPDATE SET date=excluded.date RETURNING *,date::text",
      [randomUUID(), window.date, window.starts, window.ends],
    );
    const created = result.rows[0];
    const previous = (
      await sql.query<Round>(
        "SELECT * FROM rounds WHERE date<$1 ORDER BY date DESC LIMIT 1",
        [window.date],
      )
    ).rows[0];
    if (previous?.current_leader_id)
      await this.event(
        sql,
        "leader_changed",
        `round:${created.id}:reset`,
        created.id,
        null,
        null,
        "reset",
        "0",
        { from: previous.current_leader_id, to: null },
      );
    return created;
  }
  async bidsOpen(sql: Sql = this.pool) {
    if (!this.config.BIDS_ENABLED) return false;
    const row = (
      await sql.query(
        "SELECT value FROM operational_settings WHERE key='paused'",
      )
    ).rows[0];
    return row?.value !== true;
  }
  async event(
    sql: Sql,
    type: string,
    key: string,
    round: string,
    participant: string | null,
    payment: string | null,
    reason: string,
    sequence: string | null,
    payload: Record<string, unknown> = {},
  ) {
    await sql.query(
      "INSERT INTO domain_events(id,unique_event_key,round_id,participant_id,payment_id,type,reason,round_sequence,occurred_at,payload) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT(unique_event_key) DO NOTHING",
      [
        randomUUID(),
        key,
        round,
        participant,
        payment,
        type,
        reason,
        sequence,
        this.clock(),
        payload,
      ],
    );
  }
  async profile(
    sessionId: string,
    input: {
      name?: unknown;
      description?: unknown;
      url?: unknown;
      logo_asset_id?: unknown;
    },
    edit = false,
  ) {
    const profile = validateProfile(input);
    return transaction(this.pool, async (sql) => {
      await sql.query(
        "SELECT id FROM participant_sessions WHERE id=$1 FOR UPDATE",
        [sessionId],
      );
      const round = await this.current(sql);
      await sql.query("SELECT id FROM rounds WHERE id=$1 FOR UPDATE", [
        round.id,
      ]);
      const existing = (
        await sql.query<Participant>(
          "SELECT * FROM participants WHERE session_id=$1 AND round_id=$2",
          [sessionId, round.id],
        )
      ).rows[0];
      if (existing && !edit) return existing;
      if (
        existing &&
        (
          await sql.query(
            "SELECT 1 FROM payments WHERE participant_id=$1 LIMIT 1",
            [existing.id],
          )
        ).rowCount
      )
        throw new BidError(
          "PROFILE_LOCKED",
          "Contact the operator to edit a profile after creating an invoice.",
          409,
        );
      const blocked = await sql.query(
        "SELECT 1 FROM blocked_domains WHERE disabled_at IS NULL AND (normalized_domain=$1 OR (include_subdomains AND right($1,length(normalized_domain)+1)='.'||normalized_domain))",
        [profile.normalized_domain],
      );
      const status = blocked.rowCount
        ? "rejected"
        : this.config.MODERATION_MODE === "manual" ||
            /\b(casino|porn|guaranteed profit|double your bitcoin|seed phrase)\b/i.test(
              `${profile.name} ${profile.description}`,
            )
          ? "pending"
          : "approved";
      const asset =
        typeof input.logo_asset_id === "string" ? input.logo_asset_id : null;
      if (
        asset &&
        !(
          await sql.query(
            "SELECT 1 FROM assets WHERE id=$1 AND session_id=$2",
            [asset, sessionId],
          )
        ).rowCount
      )
        throw new BidError(
          "INVALID_ASSET",
          "Logo does not belong to this session.",
        );
      const result = await sql.query<Participant>(
        `INSERT INTO participants(id,session_id,round_id,name,description,url,normalized_domain,logo_asset_id,moderation_status,rules_version)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT(session_id,round_id) DO UPDATE SET name=excluded.name,description=excluded.description,url=excluded.url,normalized_domain=excluded.normalized_domain,logo_asset_id=excluded.logo_asset_id,moderation_status=excluded.moderation_status,version=participants.version+1,updated_at=now() RETURNING *`,
        [
          existing?.id ?? randomUUID(),
          sessionId,
          round.id,
          profile.name,
          profile.description,
          profile.url,
          profile.normalized_domain,
          asset,
          status,
          this.config.RULES_VERSION,
        ],
      );
      const participant = result.rows[0];
      if (!existing)
        await this.event(
          sql,
          "participant_created",
          `participant:${participant.id}`,
          round.id,
          participant.id,
          null,
          "participation",
          null,
        );
      return participant;
    });
  }
  async createBid(
    sessionId: string,
    key: string,
    input: {
      amount_sats: unknown;
      rules_version: unknown;
      accepted_rules: unknown;
      round_id?: unknown;
    },
  ) {
    const sats = amount(
      input.amount_sats,
      BigInt(this.config.MINIMUM_BID_SATS),
      BigInt(this.config.MAXIMUM_BID_SATS),
    );
    if (
      input.accepted_rules !== true ||
      input.rules_version !== this.config.RULES_VERSION
    )
      throw new BidError(
        "RULES_REQUIRED",
        "Accept the current rules before paying.",
      );
    if (!key || key.length > 200)
      throw new BidError(
        "IDEMPOTENCY_REQUIRED",
        "An idempotency key is required.",
        400,
      );
    const requestHash = hash(
      JSON.stringify([
        sats,
        input.rules_version,
        input.accepted_rules,
        input.round_id ?? null,
      ]),
    );
    const prepared = await transaction(this.pool, async (sql) => {
      await sql.query(
        "SELECT id FROM participant_sessions WHERE id=$1 FOR UPDATE",
        [sessionId],
      );
      const previous = (
        await sql.query(
          "SELECT request_hash,payment_id FROM idempotency_requests WHERE session_id=$1 AND scope='bid' AND key_hash=$2",
          [sessionId, hash(key)],
        )
      ).rows[0];
      if (previous) {
        if (previous.request_hash !== requestHash)
          throw new BidError(
            "IDEMPOTENCY_CONFLICT",
            "This request key was used for another bid.",
            409,
          );
        return {
          payment: await this.payment(previous.payment_id, sql),
          create: false,
        };
      }
      if (!(await this.bidsOpen(sql)))
        throw new BidError("BIDS_PAUSED", "New payments are paused.", 503);
      const now = this.clock();
      const deadline = invoiceDeadline(
        now,
        this.config.INVOICE_TTL_SECONDS,
        this.config.BID_CUTOFF_SECONDS,
        this.config.INVOICE_END_BUFFER_SECONDS,
      );
      const currentRound = await this.current(sql);
      const round = (
        await sql.query<Round>(
          "SELECT *,date::text FROM rounds WHERE id=$1 FOR UPDATE",
          [currentRound.id],
        )
      ).rows[0];
      if (input.round_id && input.round_id !== round.id)
        throw new BidError(
          "ROUND_CHANGED",
          "A new UTC round has started. Review your bid.",
          409,
        );
      const participant = (
        await sql.query<Participant>(
          "SELECT * FROM participants WHERE session_id=$1 AND round_id=$2 FOR UPDATE",
          [sessionId, round.id],
        )
      ).rows[0];
      if (
        !participant ||
        participant.moderation_status !== "approved" ||
        participant.hidden
      )
        throw new BidError(
          "PARTICIPANT_NOT_APPROVED",
          "Your profile must be approved and visible before paying.",
          409,
        );
      if (
        (
          await sql.query(
            "SELECT 1 FROM blocked_domains WHERE disabled_at IS NULL AND (normalized_domain=$1 OR (include_subdomains AND right($1,length(normalized_domain)+1)='.'||normalized_domain))",
            [participant.normalized_domain],
          )
        ).rowCount
      )
        throw new BidError(
          "PARTICIPANT_NOT_APPROVED",
          "This domain is blocked from participation.",
          409,
        );
      const active = await sql.query(
        "SELECT id FROM payments WHERE participant_id=$1 AND (creation_status IN ('creating','creation_unknown') OR (creation_status='ready' AND settlement_status IN ('pending','processing') AND credit_status='uncredited')) LIMIT 1",
        [participant.id],
      );
      if (active.rowCount)
        throw new BidError(
          "ACTIVE_INVOICE_EXISTS",
          "Reopen your existing invoice before creating another.",
          409,
        );
      const payment = (
        await sql.query<Payment>(
          `INSERT INTO payments(id,participant_id,round_id,provider,provider_store_id,amount_sats,minimum_sats,maximum_sats,requested_expires_at,rules_version,rules_accepted_at,created_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$11) RETURNING *`,
          [
            randomUUID(),
            participant.id,
            round.id,
            this.config.PAYMENT_PROVIDER,
            this.config.PAYMENT_PROVIDER === "mock"
              ? "mock"
              : this.config.BTCPAY_STORE_ID,
            sats,
            this.config.MINIMUM_BID_SATS,
            this.config.MAXIMUM_BID_SATS,
            deadline,
            this.config.RULES_VERSION,
            now,
          ],
        )
      ).rows[0];
      await sql.query(
        "INSERT INTO idempotency_requests(session_id,scope,key_hash,request_hash,payment_id) VALUES($1,'bid',$2,$3,$4)",
        [sessionId, hash(key), requestHash, payment.id],
      );
      return { payment, create: true };
    });
    if (!prepared.create) return prepared.payment;
    try {
      const p = prepared.payment;
      const snapshot = await this.provider.createInvoice({
        bidId: p.id,
        participantId: p.participant_id,
        roundId: p.round_id,
        amountSats: p.amount_sats,
        expiresNoLaterThan: p.requested_expires_at.toISOString(),
      });
      await this.link(p, snapshot);
    } catch {
      await this.pool.query(
        "UPDATE payments SET creation_status='creation_unknown',review_reason='INVOICE_CREATION_UNCERTAIN' WHERE id=$1 AND creation_status='creating'",
        [prepared.payment.id],
      );
    }
    return this.payment(prepared.payment.id);
  }
  async payment(id: string, sql: Sql = this.pool): Promise<Payment> {
    const row = (
      await sql.query<Payment>("SELECT * FROM payments WHERE id=$1", [id])
    ).rows[0];
    if (!row) throw new BidError("NOT_FOUND", "Payment not found.", 404);
    return row;
  }
  async link(p: Payment, snapshot: InvoiceSnapshot) {
    if (
      snapshot.bidId !== p.id ||
      snapshot.participantId !== p.participant_id ||
      snapshot.roundId !== p.round_id ||
      snapshot.requestedSats !== p.amount_sats ||
      snapshot.storeId !== p.provider_store_id ||
      snapshot.provider !== p.provider
    )
      throw new BidError(
        "INVALID_EVIDENCE",
        "Invoice references do not match.",
      );
    const validExpiry =
      new Date(snapshot.expiresAt) <= p.requested_expires_at &&
      (!snapshot.providerExpiresAt ||
        new Date(snapshot.providerExpiresAt) <= p.requested_expires_at);
    await transaction(this.pool, async (sql) => {
      await sql.query("SELECT id FROM payments WHERE id=$1 FOR UPDATE", [p.id]);
      await sql.query(
        "INSERT INTO invoice_references(provider,store_id,invoice_id,bid_id,disposition) VALUES($1,$2,$3,$4,'canonical') ON CONFLICT DO NOTHING",
        [p.provider, p.provider_store_id, snapshot.invoiceId, p.id],
      );
      await sql.query(
        "UPDATE payments SET provider_invoice_id=$2,creation_status='ready',expires_at=$3,bolt11=$4,snapshot=$5,credit_status=$6,review_reason=$7 WHERE id=$1 AND provider_invoice_id IS NULL",
        [
          p.id,
          snapshot.invoiceId,
          snapshot.expiresAt,
          validExpiry ? (snapshot.bolt11 ?? null) : null,
          this.sanitized(snapshot),
          validExpiry ? "uncredited" : "review",
          validExpiry ? null : "INVALID_EXPIRATION",
        ],
      );
      await this.event(
        sql,
        "invoice_created",
        `invoice:${p.id}`,
        p.round_id,
        p.participant_id,
        p.id,
        "creation",
        null,
      );
    });
  }
  sanitized(snapshot: InvoiceSnapshot) {
    const { bolt11: _bolt11, ...safe } = snapshot;
    void _bolt11;
    return safe;
  }
  async receive(raw: Buffer, signature: string) {
    const event = this.provider.verifyWebhook(raw, signature);
    const store =
      this.config.PAYMENT_PROVIDER === "mock"
        ? "mock"
        : this.config.BTCPAY_STORE_ID;
    if (event.storeId !== store)
      throw new BidError("INVALID_STORE", "Unexpected store.", 400);
    await this.pool.query(
      "INSERT INTO webhook_inbox(id,provider,store_id,delivery_id,original_delivery_id,invoice_id,event_type,body_hash,sanitized_payload) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT(provider,store_id,delivery_id) DO NOTHING",
      [
        randomUUID(),
        this.config.PAYMENT_PROVIDER,
        store,
        event.deliveryId,
        event.originalDeliveryId,
        event.invoiceId,
        event.eventType,
        hash(raw),
        event,
      ],
    );
  }
  async refreshLeader(
    sql: Sql,
    round: Round,
    reason: string,
    payment: Payment | null,
    sequence: string,
  ) {
    const leader =
      (
        await sql.query(
          "SELECT p.id FROM participants p JOIN participant_totals t ON t.participant_id=p.id WHERE p.round_id=$1 AND p.moderation_status='approved' AND NOT p.hidden AND t.total_sats>0 ORDER BY t.total_sats DESC,t.total_reached_sequence,p.id LIMIT 1",
          [round.id],
        )
      ).rows[0]?.id ?? null;
    await sql.query(
      "UPDATE rounds SET current_leader_id=$2,version=version+1,updated_at=$3 WHERE id=$1",
      [round.id, leader, this.clock()],
    );
    if (leader === round.current_leader_id) return;
    const key = payment ? payment.id : randomUUID();
    await this.event(
      sql,
      "leader_changed",
      `leader:${key}`,
      round.id,
      leader,
      payment?.id ?? null,
      reason,
      sequence,
      { from: round.current_leader_id, to: leader },
    );
    if (
      reason === "payment" &&
      round.current_leader_id &&
      leader &&
      payment &&
      leader !== round.current_leader_id
    ) {
      await this.event(
        sql,
        "participant_outbid",
        `outbid:${payment.id}`,
        round.id,
        round.current_leader_id,
        payment.id,
        reason,
        sequence,
      );
      const reclaimed = await sql.query(
        "SELECT 1 FROM domain_events WHERE round_id=$1 AND participant_id=$2 AND type='participant_outbid' LIMIT 1",
        [round.id, leader],
      );
      if (reclaimed.rowCount)
        await this.event(
          sql,
          "leader_reclaimed",
          `reclaimed:${payment.id}`,
          round.id,
          leader,
          payment.id,
          reason,
          sequence,
        );
    }
  }
  async verify(p: Payment, snapshot: InvoiceSnapshot, source = "webhook") {
    await transaction(this.pool, async (sql) => {
      const round = (
        await sql.query<Round>(
          "SELECT *,date::text FROM rounds WHERE id=$1 FOR UPDATE",
          [p.round_id],
        )
      ).rows[0];
      p = await this.payment(p.id, sql);
      await sql.query("SELECT id FROM payments WHERE id=$1 FOR UPDATE", [p.id]);
      const association =
        snapshot.provider === p.provider &&
        snapshot.storeId === p.provider_store_id &&
        snapshot.invoiceId === p.provider_invoice_id &&
        snapshot.bidId === p.id &&
        snapshot.participantId === p.participant_id &&
        snapshot.roundId === p.round_id &&
        snapshot.requestedSats === p.amount_sats;
      const network =
        snapshot.network ===
        (p.provider === "mock" ? "regtest" : this.config.BTCPAY_NETWORK);
      const received = snapshot.receivedAt
        ? new Date(snapshot.receivedAt)
        : null;
      const temporal =
        received &&
        Number.isFinite(received.getTime()) &&
        received >= round.starts_at &&
        received < round.ends_at &&
        received < (p.expires_at ?? p.requested_expires_at) &&
        received >= p.created_at;
      const normalStatus =
        !snapshot.additionalStatus || snapshot.additionalStatus === "None";
      const receipts =
        snapshot.verifiedPayments ??
        (snapshot.verifiedPaymentIds.length === 1 && snapshot.receivedAt
          ? [
              {
                id: snapshot.verifiedPaymentIds[0],
                amountSats: snapshot.receivedSats,
                receivedAt: snapshot.receivedAt,
              },
            ]
          : []);
      const receiptsMatch =
        receipts.length === snapshot.verifiedPaymentIds.length &&
        receipts.length > 0 &&
        receipts.every(
          (r) =>
            snapshot.verifiedPaymentIds.includes(r.id) &&
            /^[0-9]+$/.test(r.amountSats) &&
            Number.isFinite(new Date(r.receivedAt).getTime()),
        ) &&
        receipts
          .reduce((sum, r) => sum + BigInt(r.amountSats), 0n)
          .toString() === snapshot.receivedSats;
      const evidence =
        receiptsMatch &&
        receipts.every(
          (r) =>
            new Date(r.receivedAt) >= p.created_at &&
            new Date(r.receivedAt) < (p.expires_at ?? p.requested_expires_at),
        ) &&
        association &&
        network &&
        normalStatus &&
        snapshot.paymentMethod === "lightning" &&
        !snapshot.manuallyMarked &&
        snapshot.receivedSats === p.amount_sats &&
        snapshot.verifiedPaymentIds.length > 0 &&
        new Set(snapshot.verifiedPaymentIds).size ===
          snapshot.verifiedPaymentIds.length &&
        temporal &&
        new Date(snapshot.expiresAt) <= p.requested_expires_at &&
        (!snapshot.providerExpiresAt ||
          new Date(snapshot.providerExpiresAt) <= p.requested_expires_at);
      if (p.credit_status === "credited") {
        if (!evidence || snapshot.state !== "settled") {
          const changed = await sql.query(
            "UPDATE payments SET review_reason='CONTRADICTORY_EVIDENCE' WHERE id=$1 AND review_reason IS DISTINCT FROM 'CONTRADICTORY_EVIDENCE' RETURNING id",
            [p.id],
          );
          if (changed.rowCount)
            await this.audit(
              sql,
              "worker",
              "contradictory_evidence",
              "payment",
              p.id,
              "Later provider evidence conflicts with an existing credit; ledger preserved",
              null,
              this.sanitized(snapshot),
            );
        }
        return;
      }
      const state = snapshot.state === "new" ? "pending" : snapshot.state;
      const review =
        !association ||
        !network ||
        !normalStatus ||
        (snapshot.state === "settled" && !evidence);
      await sql.query(
        "UPDATE payments SET provider_status=$2,additional_status=$3,settlement_status=$4,snapshot=$5,last_checked_at=$6,verified_at=$6,retry_count=0,next_retry_at=$7,credit_status=CASE WHEN $8 THEN 'review' ELSE credit_status END,review_reason=CASE WHEN $8 THEN 'INVALID_EVIDENCE' ELSE review_reason END WHERE id=$1",
        [
          p.id,
          snapshot.state,
          snapshot.additionalStatus,
          association ? state : p.settlement_status,
          this.sanitized(snapshot),
          this.clock(),
          new Date(
            this.clock().getTime() +
              this.config.RECONCILIATION_INTERVAL_SECONDS * 1000,
          ),
          review,
        ],
      );
      if (
        association &&
        network &&
        receiptsMatch &&
        !snapshot.manuallyMarked &&
        snapshot.paymentMethod === "lightning"
      ) {
        for (const receipt of receipts) {
          const inserted = await sql.query(
            "INSERT INTO provider_payment_evidence(id,payment_id,provider,store_id,external_payment_id,amount_sats,method,received_at,verified_at,sanitized_snapshot) VALUES($1,$2,$3,$4,$5,$6,'lightning',$7,$8,$9) ON CONFLICT(provider,store_id,external_payment_id) DO NOTHING RETURNING payment_id",
            [
              randomUUID(),
              p.id,
              p.provider,
              p.provider_store_id,
              receipt.id,
              receipt.amountSats,
              receipt.receivedAt,
              this.clock(),
              this.sanitized(snapshot),
            ],
          );
          if (!inserted.rowCount) {
            const existing = (
              await sql.query(
                "SELECT payment_id,amount_sats FROM provider_payment_evidence WHERE provider=$1 AND store_id=$2 AND external_payment_id=$3",
                [p.provider, p.provider_store_id, receipt.id],
              )
            ).rows[0];
            if (
              !existing ||
              existing.payment_id !== p.id ||
              existing.amount_sats !== receipt.amountSats
            )
              throw new BidError(
                "INVALID_EVIDENCE",
                "Provider receipt is already associated with another payment or amount.",
              );
          }
        }
      }
      if (snapshot.state === "expired")
        await this.event(
          sql,
          "payment_expired",
          `expired:${p.id}`,
          p.round_id,
          p.participant_id,
          p.id,
          source,
          null,
        );
      if (
        association &&
        snapshot.state === "settled" &&
        snapshot.verifiedPaymentIds.length &&
        !snapshot.manuallyMarked
      )
        await this.event(
          sql,
          "payment_settled",
          `settled:${p.id}`,
          p.round_id,
          p.participant_id,
          p.id,
          source,
          null,
          {
            amount_sats: snapshot.receivedSats,
            credit_status: evidence ? "credited" : "review",
          },
        );
      if (
        snapshot.state !== "settled" ||
        !evidence ||
        p.credit_status === "excluded"
      )
        return;
      const sequence = (BigInt(round.credit_sequence) + 1n).toString();
      const total =
        (
          await sql.query(
            "SELECT total_sats FROM participant_totals WHERE participant_id=$1",
            [p.participant_id],
          )
        ).rows[0]?.total_sats ?? "0";
      if (BigInt(total) + BigInt(p.amount_sats) > MAX_INT64)
        throw new BidError("TOTAL_OVERFLOW", "Total requires review.");
      await sql.query(
        "UPDATE payments SET credit_status='credited',settlement_status='settled',credited_at=$2,provider_received_at=$3,credit_sequence=$4,review_reason=NULL WHERE id=$1",
        [p.id, this.clock(), received, sequence],
      );
      await sql.query("UPDATE rounds SET credit_sequence=$2 WHERE id=$1", [
        round.id,
        sequence,
      ]);
      await sql.query(
        "INSERT INTO participant_totals(participant_id,round_id,total_sats,total_reached_sequence) VALUES($1,$2,$3,$4) ON CONFLICT(participant_id) DO UPDATE SET total_sats=participant_totals.total_sats+excluded.total_sats,total_reached_sequence=excluded.total_reached_sequence,updated_at=now()",
        [p.participant_id, p.round_id, p.amount_sats, sequence],
      );
      const live = this.clock() < round.ends_at && round.status === "open";
      const reason = live ? "payment" : "reconciliation";
      await this.event(
        sql,
        "payment_settled",
        `settled:${p.id}`,
        p.round_id,
        p.participant_id,
        p.id,
        source,
        sequence,
        { amount_sats: p.amount_sats, credit_status: "credited" },
      );
      await this.event(
        sql,
        "payment_credited",
        `credited:${p.id}`,
        p.round_id,
        p.participant_id,
        p.id,
        source,
        sequence,
        { amount_sats: p.amount_sats },
      );
      if (BigInt(total) > 0n)
        await this.event(
          sql,
          "repeat_bid",
          `repeat:${p.id}`,
          p.round_id,
          p.participant_id,
          p.id,
          reason,
          sequence,
        );
      if (
        live &&
        (
          await sql.query(
            "SELECT 1 FROM domain_events WHERE participant_id=$1 AND round_id=$2 AND type='participant_outbid' LIMIT 1",
            [p.participant_id, p.round_id],
          )
        ).rowCount
      )
        await this.event(
          sql,
          "repeat_bid_after_outbid",
          `repeat-outbid:${p.id}`,
          p.round_id,
          p.participant_id,
          p.id,
          reason,
          sequence,
        );
      if (source === "reconciliation")
        await this.event(
          sql,
          "payment_reconciled",
          `reconciled:${p.id}`,
          p.round_id,
          p.participant_id,
          p.id,
          source,
          sequence,
        );
      await this.refreshLeader(sql, round, reason, p, sequence);
      if (round.status === "closed") {
        await sql.query(
          "UPDATE rounds SET result_revision=result_revision+1 WHERE id=$1",
          [round.id],
        );
        await this.audit(
          sql,
          "worker",
          "historical_correction",
          "round",
          round.id,
          "Verified payment received within original deadline",
          { leader: round.current_leader_id, revision: round.result_revision },
          { payment_id: p.id, revision: round.result_revision + 1 },
        );
      }
    });
  }
  async audit(
    sql: Sql,
    actor: string,
    action: string,
    entity: string,
    id: string,
    reason: string,
    before: unknown = null,
    after: unknown = null,
  ) {
    await sql.query(
      "INSERT INTO audit_log(id,actor,action,entity_type,entity_id,reason,before_json,after_json) VALUES($1,$2,$3,$4,$5,$6,$7,$8)",
      [randomUUID(), actor, action, entity, id, reason, before, after],
    );
  }
  async leaderboard(
    date?: string,
    offset = 0,
    limit = 21,
  ): Promise<Leaderboard> {
    const selectedDate = date ?? roundWindow(this.clock()).date;
    type Entry = Pick<
      Participant,
      | "id"
      | "name"
      | "description"
      | "url"
      | "normalized_domain"
      | "logo_asset_id"
    > & {
      total_sats: string;
      total_reached_sequence: string;
      position: number;
    };
    // One statement gives all public fields the same MVCC snapshot without
    // holding a pooled connection over several database round trips.
    const row = (
      await this.pool.query<
        Round & {
          participants: Entry[];
          leader: Entry | null;
          total_sats: string;
          participant_count: number;
          updated_at: Date;
        }
      >(
        `WITH eligible AS MATERIALIZED (
      SELECT p.id,p.name,p.description,p.url,p.normalized_domain,p.logo_asset_id,t.total_sats,t.total_reached_sequence,
        row_number() OVER(ORDER BY t.total_sats DESC,t.total_reached_sequence,p.id)::int AS position
      FROM participants p JOIN participant_totals t ON t.participant_id=p.id JOIN rounds r ON r.id=p.round_id
      WHERE r.date=$1 AND p.moderation_status='approved' AND NOT p.hidden AND t.total_sats>0
    ), page AS (SELECT * FROM eligible ORDER BY position LIMIT $2 OFFSET $3)
    SELECT r.*,r.date::text,
      coalesce((SELECT jsonb_agg(to_jsonb(p)||jsonb_build_object('total_sats',p.total_sats::text,'total_reached_sequence',p.total_reached_sequence::text) ORDER BY position) FROM page p),'[]'::jsonb) AS participants,
      (SELECT to_jsonb(e)||jsonb_build_object('total_sats',e.total_sats::text,'total_reached_sequence',e.total_reached_sequence::text) FROM eligible e WHERE position=1) AS leader,
      (SELECT coalesce(sum(amount_sats),0)::text FROM payments WHERE round_id=r.id AND credit_status='credited' AND settlement_status='settled') AS total_sats,
      (SELECT count(*)::int FROM eligible) AS participant_count
    FROM rounds r WHERE r.date=$1`,
        [selectedDate, limit + 1, offset],
      )
    ).rows[0];
    if (!row) {
      if (date) throw new BidError("NOT_FOUND", "Round not found.", 404);
      await this.current();
      return this.leaderboard(selectedDate, offset, limit);
    }
    const { participants, leader, total_sats, participant_count, ...round } =
      row;
    return {
      round,
      participants: participants.slice(0, limit),
      leader,
      total_sats,
      participant_count,
      version: round.version,
      updated_at: round.updated_at,
      server_time: this.clock().toISOString(),
      next_cursor:
        participants.length > limit
          ? Buffer.from(String(offset + limit)).toString("base64url")
          : null,
    };
  }
}
