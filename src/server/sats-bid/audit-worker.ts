import { biddingHealth } from "./health.js";
import { randomUUID } from "node:crypto";
import type { BidService } from "./service.js";
import { auditInvoices } from "./worker.js";
import { maintainBidding } from "./maintenance.js";
export async function auditTick(service: BidService) {
  const owner = randomUUID();
  const now = service.clock();
  const lease = await service.pool.query(
    "INSERT INTO job_leases(name,owner,expires_at) VALUES('audit',$1,$2) ON CONFLICT(name) DO UPDATE SET owner=excluded.owner,expires_at=excluded.expires_at WHERE job_leases.expires_at<$3 RETURNING name",
    [owner, new Date(now.getTime() + 60000), now],
  );
  if (!lease.rowCount) return;
  const heartbeat = setInterval(() => {
    void service.pool
      .query(
        "UPDATE job_leases SET expires_at=$2 WHERE name='audit' AND owner=$1",
        [owner, new Date(service.clock().getTime() + 60000)],
      )
      .catch(() => undefined);
  }, 15000);
  try {
    await maintainBidding(service);
    const health = await biddingHealth(service);
    if (health.alerts.length)
      process.stderr.write(
        JSON.stringify({ event: "sats_bid_alert", codes: health.alerts }) +
          "\n",
      );
    const stored = (
      await service.pool.query(
        "SELECT value FROM operational_settings WHERE key='audit_cursor'",
      )
    ).rows[0]?.value;
    if (!stored || stored.next_at <= now.getTime()) {
      const continuing = stored && stored.offset !== null;
      const until = continuing ? new Date(stored.until) : now;
      const since = continuing
        ? new Date(stored.since)
        : new Date(until.getTime() - 604800000);
      const offset = await auditInvoices(
        service,
        since,
        until,
        continuing ? stored.offset : 0,
      );
      await service.pool.query(
        "INSERT INTO operational_settings(key,value) VALUES('audit_cursor',$1) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
        [
          {
            since,
            until,
            offset,
            next_at: offset === null ? now.getTime() + 86400000 : now.getTime(),
          },
        ],
      );
    }
    await service.pool.query(
      "UPDATE job_leases SET last_success_at=$2 WHERE name='audit' AND owner=$1",
      [owner, service.clock()],
    );
  } finally {
    clearInterval(heartbeat);
    await service.pool.query(
      "UPDATE job_leases SET expires_at=$2 WHERE name='audit' AND owner=$1",
      [owner, new Date(0)],
    );
  }
}
