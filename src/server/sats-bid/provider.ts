import { createHmac, timingSafeEqual, randomUUID } from "node:crypto";
import type pg from "pg";
import { decode } from "light-bolt11-decoder";
import { z } from "zod";
import { BidError, btcToSats, satsToBtc } from "./domain.js";
import type { BidConfig } from "./config.js";

export interface InvoiceSnapshot {
  provider: "mock" | "btcpay";
  invoiceId: string;
  storeId: string;
  bidId: string;
  participantId: string;
  roundId: string;
  state: "new" | "processing" | "settled" | "expired" | "invalid";
  additionalStatus?: string;
  requestedSats: string;
  receivedSats: string;
  paymentMethod: "lightning" | "unsupported";
  network: string;
  expiresAt: string;
  providerExpiresAt?: string;
  receivedAt?: string;
  verifiedPaymentIds: string[];
  verifiedPayments?: { id: string; amountSats: string; receivedAt: string }[];
  manuallyMarked: boolean;
  bolt11?: string;
}
export interface InvoiceInput {
  bidId: string;
  participantId: string;
  roundId: string;
  amountSats: string;
  expiresNoLaterThan: string;
}
export interface VerifiedWebhook {
  deliveryId: string;
  originalDeliveryId?: string;
  eventType: string;
  storeId: string;
  invoiceId: string;
}
export interface PaymentProvider {
  createInvoice(input: InvoiceInput): Promise<InvoiceSnapshot>;
  getInvoice(id: string): Promise<InvoiceSnapshot>;
  findInvoicesByBidId(id: string, since: Date): Promise<InvoiceSnapshot[]>;
  listInvoices(
    since: Date,
    until: Date,
    offset: number,
  ): Promise<{ invoiceId: string; bidId: string }[]>;
  verifyWebhook(raw: Buffer, signature: string): VerifiedWebhook;
}
const webhookSchema = z.object({
  deliveryId: z.string().min(1).max(200),
  originalDeliveryId: z.string().optional(),
  type: z.string().max(100),
  storeId: z.string(),
  invoiceId: z.string(),
});
export function verifyWebhook(
  raw: Buffer,
  signature: string,
  secret: string,
): VerifiedWebhook {
  if (!secret || !/^sha256=[a-f0-9]{64}$/i.test(signature))
    throw new BidError("INVALID_SIGNATURE", "Invalid webhook signature.", 401);
  const digest = createHmac("sha256", secret).update(raw).digest();
  if (!timingSafeEqual(digest, Buffer.from(signature.slice(7), "hex")))
    throw new BidError("INVALID_SIGNATURE", "Invalid webhook signature.", 401);
  let parsed;
  try {
    parsed = webhookSchema.parse(JSON.parse(raw.toString("utf8")));
  } catch {
    throw new BidError("INVALID_WEBHOOK", "Malformed webhook.", 400);
  }
  return { ...parsed, eventType: parsed.type };
}
export function validateBolt11(
  invoice: string,
  sats: string,
  network: string,
  deadline?: Date,
) {
  if (invoice.length > 20000)
    throw new BidError("INVALID_EVIDENCE", "Lightning invoice is too large.");
  const decoded = decode(invoice);
  const prefix =
    network === "mainnet" ? "lnbc" : network === "testnet" ? "lntb" : "lnbcrt";
  const millisatoshis = decoded.sections.find(
    (section) => section.name === "amount",
  )?.value;
  const timestamp = decoded.sections.find(
    (section) => section.name === "timestamp",
  )?.value;
  const expirySeconds =
    decoded.sections.find((section) => section.name === "expiry")?.value ??
    3600;
  const signature = decoded.sections.find(
    (section) => section.name === "signature",
  )?.value;
  const expires = (timestamp ?? NaN) + expirySeconds;
  if (
    !new RegExp(`^${prefix}[0-9]`).test(invoice.toLowerCase()) ||
    millisatoshis !== (BigInt(sats) * 1000n).toString() ||
    !Number.isSafeInteger(expires) ||
    !signature ||
    !/^[a-f0-9]{130}$/i.test(signature)
  )
    throw new BidError("INVALID_EVIDENCE", "Invalid Lightning invoice.");
  const expiry = new Date(expires * 1000);
  if (deadline && expiry > deadline)
    throw new BidError(
      "INVALID_EVIDENCE",
      "Invoice exceeds the payment deadline.",
    );
  return expiry;
}
export class MockPaymentProvider implements PaymentProvider {
  constructor(
    private pool: pg.Pool,
    private secret: string,
    private clock = () => new Date(),
  ) {}
  async createInvoice(input: InvoiceInput) {
    const snapshot: InvoiceSnapshot = {
      provider: "mock",
      invoiceId: `demo-${randomUUID()}`,
      storeId: "mock",
      bidId: input.bidId,
      participantId: input.participantId,
      roundId: input.roundId,
      state: "new",
      requestedSats: input.amountSats,
      receivedSats: "0",
      paymentMethod: "lightning",
      network: "regtest",
      expiresAt: input.expiresNoLaterThan,
      verifiedPaymentIds: [],
      manuallyMarked: false,
    };
    await this.pool.query(
      "INSERT INTO mock_invoices(id,bid_id,snapshot) VALUES($1,$2,$3) ON CONFLICT(bid_id) DO NOTHING",
      [snapshot.invoiceId, input.bidId, snapshot],
    );
    return (await this.findInvoicesByBidId(input.bidId))[0];
  }
  async getInvoice(id: string): Promise<InvoiceSnapshot> {
    const row = (
      await this.pool.query("SELECT snapshot FROM mock_invoices WHERE id=$1", [
        id,
      ])
    ).rows[0];
    if (!row) throw new BidError("NOT_FOUND", "Invoice not found.", 404);
    const snapshot: InvoiceSnapshot = row.snapshot;
    if (
      snapshot.state === "new" &&
      new Date(snapshot.expiresAt) <= this.clock()
    )
      snapshot.state = "expired";
    return snapshot;
  }
  async findInvoicesByBidId(id: string) {
    const rows = (
      await this.pool.query("SELECT id FROM mock_invoices WHERE bid_id=$1", [
        id,
      ])
    ).rows;
    return Promise.all(rows.map((r) => this.getInvoice(r.id)));
  }
  async listInvoices(since: Date, until: Date, offset: number) {
    return (
      await this.pool.query(
        'SELECT id AS "invoiceId", bid_id AS "bidId" FROM mock_invoices WHERE created_at BETWEEN $1 AND $2 ORDER BY created_at,id LIMIT 100 OFFSET $3',
        [since, until, offset],
      )
    ).rows;
  }
  verifyWebhook(raw: Buffer, signature: string) {
    return verifyWebhook(raw, signature, this.secret);
  }
  async simulate(id: string, scenario: string) {
    const snapshot = await this.getInvoice(id);
    if (scenario === "expire") snapshot.state = "expired";
    else {
      snapshot.state = "settled";
      snapshot.receivedSats =
        scenario === "mismatch"
          ? (BigInt(snapshot.requestedSats) + 1n).toString()
          : snapshot.requestedSats;
      snapshot.receivedAt = this.clock().toISOString();
      snapshot.verifiedPaymentIds = [`mock-payment-${id}`];
      snapshot.verifiedPayments = [
        {
          id: snapshot.verifiedPaymentIds[0],
          amountSats: snapshot.receivedSats,
          receivedAt: snapshot.receivedAt,
        },
      ];
    }
    await this.pool.query("UPDATE mock_invoices SET snapshot=$2 WHERE id=$1", [
      id,
      snapshot,
    ]);
    const raw = Buffer.from(
      JSON.stringify({
        deliveryId: randomUUID(),
        type:
          snapshot.state === "settled" ? "InvoiceSettled" : "InvoiceExpired",
        storeId: "mock",
        invoiceId: id,
      }),
    );
    return {
      raw,
      signature: `sha256=${createHmac("sha256", this.secret).update(raw).digest("hex")}`,
    };
  }
}

const invoiceSchema = z.object({
  id: z.string(),
  storeId: z.string(),
  status: z.string(),
  additionalStatus: z.string().optional(),
  amount: z.string(),
  currency: z.literal("BTC"),
  expirationTime: z.number(),
  metadata: z.object({
    bid_id: z.string(),
    participant_id: z.string(),
    round_id: z.string(),
  }),
});
const methodSchema = z.object({
  paymentMethodId: z.string(),
  activated: z.boolean().optional(),
  destination: z.string().optional(),
  currency: z.string(),
  payments: z
    .array(
      z.object({
        id: z.string(),
        value: z.string(),
        receivedDate: z.number(),
        status: z.string(),
      }),
    )
    .default([]),
});
export class BTCPayPaymentProvider implements PaymentProvider {
  constructor(private config: BidConfig) {}
  private async request(path: string, body?: unknown): Promise<unknown> {
    const response = await fetch(
      `${this.config.BTCPAY_URL.replace(/\/$/, "")}/api/v1/stores/${encodeURIComponent(this.config.BTCPAY_STORE_ID)}/invoices${path}`,
      {
        method: body ? "POST" : "GET",
        headers: {
          Authorization: `token ${this.config.BTCPAY_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(
          this.config.PROVIDER_HTTP_TIMEOUT_SECONDS * 1000,
        ),
        redirect: "error",
      },
    );
    if (!response.ok) {
      const retry = response.headers.get("retry-after") ?? "";
      const retryAfterMs = /^\d+$/.test(retry)
        ? Number(retry) * 1000
        : Math.max(0, Date.parse(retry) - Date.now());
      throw new BidError(
        "PAYMENT_PROVIDER_UNAVAILABLE",
        "Payment verification is delayed.",
        503,
        Number.isFinite(retryAfterMs) ? retryAfterMs : 0,
      );
    }
    return response.json();
  }
  async createInvoice(input: InvoiceInput) {
    const minutes = Math.floor(
      (new Date(input.expiresNoLaterThan).getTime() - Date.now()) / 60000,
    );
    if (minutes < 1)
      throw new BidError(
        "ROUND_CLOSING",
        "Too close to the round deadline.",
        409,
      );
    const result = z.object({ id: z.string() }).parse(
      await this.request("", {
        amount: satsToBtc(input.amountSats),
        currency: "BTC",
        metadata: {
          orderId: input.bidId,
          bid_id: input.bidId,
          participant_id: input.participantId,
          round_id: input.roundId,
        },
        checkout: {
          paymentMethods: ["BTC-LN"],
          expirationMinutes: minutes,
          paymentTolerance: 0,
        },
      }),
    );
    return this.getInvoice(result.id);
  }
  async getInvoice(id: string): Promise<InvoiceSnapshot> {
    const [raw, methodsRaw] = await Promise.all([
      this.request(`/${encodeURIComponent(id)}`),
      this.request(`/${encodeURIComponent(id)}/payment-methods`),
    ]);
    const invoice = invoiceSchema.parse(raw);
    if (invoice.id !== id || invoice.storeId !== this.config.BTCPAY_STORE_ID)
      throw new BidError("INVALID_EVIDENCE", "Invoice or store mismatch.");
    const methods = z.array(methodSchema).parse(methodsRaw);
    const method = methods.find((m) => m.paymentMethodId === "BTC-LN");
    const bolt11 = method?.destination;
    const requestedSats = btcToSats(invoice.amount);
    const boltExpiry = bolt11
      ? validateBolt11(bolt11, requestedSats, this.config.BTCPAY_NETWORK)
      : undefined;
    const payments =
      method?.payments.filter((p) => p.status === "Settled") ?? [];
    const states: Record<string, InvoiceSnapshot["state"]> = {
      New: "new",
      Processing: "processing",
      Settled: "settled",
      Expired: "expired",
      Invalid: "invalid",
    };
    if (!states[invoice.status])
      throw new BidError("INVALID_EVIDENCE", "Unknown provider state.");
    return {
      provider: "btcpay",
      invoiceId: invoice.id,
      storeId: invoice.storeId,
      bidId: invoice.metadata.bid_id,
      participantId: invoice.metadata.participant_id,
      roundId: invoice.metadata.round_id,
      state: states[invoice.status],
      additionalStatus: invoice.additionalStatus,
      requestedSats,
      receivedSats: payments
        .reduce((sum, p) => sum + BigInt(btcToSats(p.value)), 0n)
        .toString(),
      paymentMethod:
        method &&
        method.currency === "BTC" &&
        methods.every(
          (m) => m.paymentMethodId === "BTC-LN" || m.activated === false,
        )
          ? "lightning"
          : "unsupported",
      network: this.config.BTCPAY_NETWORK,
      providerExpiresAt: new Date(invoice.expirationTime * 1000).toISOString(),
      expiresAt: new Date(
        Math.min(
          invoice.expirationTime * 1000,
          boltExpiry?.getTime() ?? Infinity,
        ),
      ).toISOString(),
      receivedAt: payments.length
        ? new Date(
            Math.max(...payments.map((p) => p.receivedDate * 1000)),
          ).toISOString()
        : undefined,
      verifiedPaymentIds: payments.map((p) => p.id),
      verifiedPayments: payments.map((p) => ({
        id: p.id,
        amountSats: btcToSats(p.value),
        receivedAt: new Date(p.receivedDate * 1000).toISOString(),
      })),
      manuallyMarked: /marked/i.test(invoice.additionalStatus ?? ""),
      bolt11,
    };
  }
  async listInvoices(since: Date, until: Date, offset: number) {
    const query = new URLSearchParams({
      startDate: since.toISOString(),
      endDate: until.toISOString(),
      skip: String(offset),
      take: "100",
    });
    const items = z
      .array(
        z.object({
          id: z.string(),
          metadata: z.record(z.string(), z.unknown()).optional(),
        }),
      )
      .parse(await this.request(`?${query}`));
    return items.map((row) => ({
      invoiceId: row.id,
      bidId:
        typeof row.metadata?.bid_id === "string" ? row.metadata.bid_id : "",
    }));
  }
  async findInvoicesByBidId(id: string, since: Date) {
    const found: InvoiceSnapshot[] = [];
    for (let offset = 0; offset < 10000; offset += 100) {
      const rows = await this.listInvoices(
        new Date(since.getTime() - 60000),
        new Date(since.getTime() + 3600000),
        offset,
      );
      for (const row of rows)
        if (row.bidId === id) found.push(await this.getInvoice(row.invoiceId));
      if (rows.length < 100) return found;
    }
    throw new BidError(
      "INVOICE_CREATION_UNCERTAIN",
      "Invoice search requires operational review.",
      503,
    );
  }
  verifyWebhook(raw: Buffer, signature: string) {
    return verifyWebhook(raw, signature, this.config.BTCPAY_WEBHOOK_SECRET);
  }
}
