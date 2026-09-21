import type { BidService } from "./service.js";
export async function biddingHealth(service: BidService) {
  const now = service.clock();
  const [jobs, queue, rounds, references] = await Promise.all([
    service.pool.query("SELECT name,last_success_at FROM job_leases"),
    service.pool.query(
      "SELECT count(*)::int AS count,min(created_at) AS oldest FROM payments WHERE credit_status='review' OR creation_status IN ('creating','creation_unknown') OR (settlement_status IN ('pending','processing') AND created_at<$1)",
      [new Date(now.getTime() - 300000)],
    ),
    service.pool.query(
      "SELECT count(*)::int AS count FROM rounds WHERE status<>'closed' AND ends_at<$1",
      [new Date(now.getTime() - 900000)],
    ),
    service.pool.query(
      "SELECT count(*)::int AS count FROM invoice_references WHERE disposition<>'canonical'",
    ),
  ]);
  const success = jobs.rows.find(
    (job) => job.name === "reconcile",
  )?.last_success_at;
  const alerts: string[] = [];
  if (!success || now.getTime() - new Date(success).getTime() > 300000)
    alerts.push("RECONCILIATION_STALE");
  if (queue.rows[0].count) alerts.push("PAYMENTS_REQUIRE_ATTENTION");
  if (rounds.rows[0].count) alerts.push("ROUND_CLOSE_DELAYED");
  if (references.rows[0].count) alerts.push("INVOICE_REFERENCE_ANOMALY");
  return {
    status: alerts.length ? "degraded" : "ok",
    alerts,
    jobs: jobs.rows,
    pending_attention: queue.rows[0],
    delayed_rounds: rounds.rows[0].count,
    reference_anomalies: references.rows[0].count,
  };
}
