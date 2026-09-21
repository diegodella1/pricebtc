import { BidError } from "./domain.js";
import { randomUUID } from "node:crypto";
import { transaction } from "./db.js";
import type { BidService, Payment, Round } from "./service.js";

export async function reconcilePayment(
  service: BidService,
  payment: Payment,
  source = "reconciliation",
) {
  if (
    payment.provider !== service.config.PAYMENT_PROVIDER ||
    payment.provider_store_id !==
      (payment.provider === "mock" ? "mock" : service.config.BTCPAY_STORE_ID)
  )
    return;
  try {
    if (!payment.provider_invoice_id) {
      const found = await service.provider.findInvoicesByBidId(
        payment.id,
        payment.created_at,
      );
      if (found.length !== 1) {
        for (const invoice of found)
          await service.pool.query(
            "INSERT INTO invoice_references(provider,store_id,invoice_id,bid_id,disposition) VALUES($1,$2,$3,$4,'duplicate') ON CONFLICT DO NOTHING",
            [
              payment.provider,
              payment.provider_store_id,
              invoice.invoiceId,
              payment.id,
            ],
          );
        throw new Error("CREATION_UNCERTAIN");
      }
      await service.link(payment, found[0]);
      payment = await service.payment(payment.id);
    }
    const snapshot = await service.provider.getInvoice(
      payment.provider_invoice_id!,
    );
    await service.verify(payment, snapshot, source);
  } catch (error) {
    const retryAfterMs = error instanceof BidError ? error.retryAfterMs : 0;
    const delay =
      Math.min(3600000, 1000 * 2 ** Math.min(payment.retry_count + 1, 12)) +
      Math.floor(Math.random() * 1000);
    await service.pool.query(
      "UPDATE payments SET retry_count=retry_count+1,next_retry_at=$2,review_reason=CASE WHEN retry_count>=9 THEN 'RECONCILIATION_REQUIRES_OPERATOR' ELSE 'VERIFICATION_DELAYED' END WHERE id=$1",
      [
        payment.id,
        new Date(service.clock().getTime() + Math.max(delay, retryAfterMs)),
      ],
    );
  }
}

export async function workerTick(service: BidService) {
  const owner = randomUUID();
  const now = service.clock();
  const lease = await service.pool.query(
    "INSERT INTO job_leases(name,owner,expires_at) VALUES('reconcile',$1,$2) ON CONFLICT(name) DO UPDATE SET owner=excluded.owner,expires_at=excluded.expires_at WHERE job_leases.expires_at<$3 RETURNING name",
    [owner, new Date(now.getTime() + 60000), now],
  );
  if (!lease.rowCount) return;
  const heartbeat = setInterval(() => {
    void service.pool
      .query(
        "UPDATE job_leases SET expires_at=$2 WHERE name='reconcile' AND owner=$1",
        [owner, new Date(service.clock().getTime() + 60000)],
      )
      .catch(() => undefined);
  }, 15000);
  try {
    await service.current();
    const inbox = (
      await service.pool.query(
        "SELECT * FROM webhook_inbox WHERE processed_at IS NULL AND next_retry_at<=$1 ORDER BY received_at LIMIT 25",
        [now],
      )
    ).rows;
    for (const event of inbox) {
      const known = [
        "InvoiceSettled",
        "InvoiceProcessing",
        "InvoiceExpired",
        "InvoiceInvalid",
        "InvoiceReceivedPayment",
        "InvoicePaymentSettled",
      ].includes(event.event_type);
      const payment = (
        await service.pool.query<Payment>(
          "SELECT * FROM payments WHERE provider=$1 AND provider_store_id=$2 AND provider_invoice_id=$3",
          [event.provider, event.store_id, event.invoice_id],
        )
      ).rows[0];
      if (!known)
        await service.pool.query(
          "UPDATE webhook_inbox SET processed_at=$2,error_code='IGNORED_EVENT' WHERE id=$1",
          [event.id, now],
        );
      else if (payment) {
        await reconcilePayment(service, payment, "webhook");
        const checked = await service.payment(payment.id);
        if (checked.retry_count === 0)
          await service.pool.query(
            "UPDATE webhook_inbox SET processed_at=$2 WHERE id=$1",
            [event.id, now],
          );
        else
          await service.pool.query(
            "UPDATE webhook_inbox SET attempt_count=attempt_count+1,next_retry_at=$2,error_code='VERIFICATION_DELAYED' WHERE id=$1",
            [event.id, new Date(now.getTime() + 60000)],
          );
      } else
        await service.pool.query(
          "UPDATE webhook_inbox SET attempt_count=attempt_count+1,next_retry_at=$2,error_code='UNLINKED_INVOICE' WHERE id=$1",
          [event.id, new Date(now.getTime() + 60000)],
        );
    }
    const pending = (
      await service.pool.query<Payment>(
        "SELECT p.* FROM payments p LEFT JOIN verification_requests v ON v.payment_id=p.id WHERE p.next_retry_at<=$1 AND p.retry_count<10 AND (v.payment_id IS NOT NULL OR p.creation_status IN ('creating','creation_unknown') OR (p.credit_status NOT IN ('credited','excluded') AND p.created_at >= $2)) ORDER BY (v.payment_id IS NULL),p.next_retry_at,p.id LIMIT 25",
        [now, new Date(now.getTime() - 172800000)],
      )
    ).rows;
    for (const payment of pending) {
      await reconcilePayment(service, payment);
      const checked = await service.payment(payment.id);
      if (checked.retry_count === 0)
        await service.pool.query(
          "DELETE FROM verification_requests WHERE payment_id=$1",
          [payment.id],
        );
    }
    await closeRounds(service);
    await service.pool.query(
      "UPDATE job_leases SET last_success_at=$2 WHERE name='reconcile' AND owner=$1",
      [owner, service.clock()],
    );
  } finally {
    clearInterval(heartbeat);
    await service.pool.query(
      "UPDATE job_leases SET expires_at=$2 WHERE name='reconcile' AND owner=$1",
      [owner, new Date(0)],
    );
  }
}

async function closeRounds(service: BidService) {
  const now = service.clock();
  const rounds = (
    await service.pool.query<Round>(
      "SELECT *,date::text FROM rounds WHERE ends_at<=$1 AND status<>'closed' ORDER BY rounds.date LIMIT 20",
      [now],
    )
  ).rows;
  for (const row of rounds)
    await transaction(service.pool, async (sql) => {
      const round = (
        await sql.query<Round>(
          "SELECT *,date::text FROM rounds WHERE id=$1 FOR UPDATE",
          [row.id],
        )
      ).rows[0];
      await sql.query("UPDATE rounds SET status='closing' WHERE id=$1", [
        round.id,
      ]);
      const unresolved = await sql.query(
        "SELECT 1 FROM payments WHERE round_id=$1 AND (creation_status IN ('creating','creation_unknown') OR (credit_status NOT IN ('credited','excluded') AND (settlement_status IN ('pending','processing') OR credit_status='review' OR last_checked_at IS NULL OR last_checked_at<$2))) LIMIT 1",
        [round.id, round.ends_at],
      );
      if (
        !unresolved.rowCount &&
        now.getTime() >=
          round.ends_at.getTime() +
            service.config.ROUND_CLOSE_GRACE_SECONDS * 1000
      )
        await sql.query(
          "UPDATE rounds SET status='closed',closed_at=$2,version=version+1,updated_at=$2 WHERE id=$1",
          [round.id, now],
        );
    });
}

export async function auditInvoices(
  service: BidService,
  since: Date,
  until: Date,
  offset = 0,
) {
  const rows = await service.provider.listInvoices(since, until, offset);
  for (const reference of rows) {
    if (!/^[0-9a-f-]{36}$/i.test(reference.bidId)) continue;
    const payment = (
      await service.pool.query<Payment>("SELECT * FROM payments WHERE id=$1", [
        reference.bidId,
      ])
    ).rows[0];
    await service.pool.query(
      "INSERT INTO invoice_references(provider,store_id,invoice_id,bid_id,disposition) VALUES($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING",
      [
        service.config.PAYMENT_PROVIDER,
        service.config.PAYMENT_PROVIDER === "mock"
          ? "mock"
          : service.config.BTCPAY_STORE_ID,
        reference.invoiceId,
        payment?.id ?? null,
        payment
          ? payment.provider_invoice_id === reference.invoiceId
            ? "canonical"
            : "duplicate"
          : "orphan",
      ],
    );
    if (payment) await reconcilePayment(service, payment);
  }
  return rows.length === 100 ? offset + 100 : null;
}
