import { randomUUID } from "node:crypto";
import type { BidService } from "./service.js";

// Delivery is at least once. The receiver must deduplicate using event_id.
export async function exportEvents(service: BidService, fetcher = fetch) {
  if (!service.config.ANALYTICS_EXPORT_URL) return;
  const owner = randomUUID();
  const now = service.clock();
  const lease = await service.pool.query(
    "INSERT INTO job_leases(name,owner,expires_at) VALUES('analytics',$1,$2) ON CONFLICT(name) DO UPDATE SET owner=excluded.owner,expires_at=excluded.expires_at WHERE job_leases.expires_at<$3 RETURNING name",
    [owner, new Date(now.getTime() + 120000), now],
  );
  if (!lease.rowCount) return;
  try {
    const events = (
      await service.pool.query(
        "SELECT * FROM domain_events WHERE exported_at IS NULL AND export_next_at<=$1 ORDER BY occurred_at,id LIMIT 10",
        [now],
      )
    ).rows;
    for (const event of events) {
      try {
        const response = await fetcher(service.config.ANALYTICS_EXPORT_URL, {
          method: "POST",
          redirect: "error",
          signal: AbortSignal.timeout(5000),
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${service.config.ANALYTICS_EXPORT_TOKEN}`,
            "Idempotency-Key": event.id,
          },
          body: JSON.stringify({
            event_id: event.id,
            type: event.type,
            reason: event.reason,
            round_id: event.round_id,
            participant_id: event.participant_id,
            payment_id: event.payment_id,
            round_sequence: event.round_sequence,
            occurred_at: event.occurred_at,
            payload: event.payload,
          }),
        });
        await response.body?.cancel();
        if (!response.ok) throw new Error("DELIVERY_FAILED");
        await service.pool.query(
          "UPDATE domain_events SET exported_at=$2 WHERE id=$1",
          [event.id, service.clock()],
        );
      } catch {
        const delay = Math.min(
          3600000,
          1000 * 2 ** Math.min(event.export_attempts + 1, 12),
        );
        await service.pool.query(
          "UPDATE domain_events SET export_attempts=export_attempts+1,export_next_at=$2 WHERE id=$1",
          [event.id, new Date(service.clock().getTime() + delay)],
        );
      }
    }
    await service.pool.query(
      "UPDATE job_leases SET last_success_at=$2 WHERE name='analytics' AND owner=$1",
      [owner, service.clock()],
    );
  } finally {
    await service.pool.query(
      "UPDATE job_leases SET expires_at=$2 WHERE name='analytics' AND owner=$1",
      [owner, new Date(0)],
    );
  }
}
