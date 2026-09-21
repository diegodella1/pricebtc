import { randomUUID } from "node:crypto";
import type { BidService, Round } from "./service.js";
import { transaction } from "./db.js";

export async function maintainBidding(service: BidService) {
  const now = service.clock();
  const key = `maintenance:${now.toISOString().slice(0, 10)}`;
  const claimed = await service.pool.query(
    "INSERT INTO operational_settings(key,value) VALUES($1,'false') ON CONFLICT(key) DO UPDATE SET value='false' WHERE operational_settings.value='false'::jsonb RETURNING key",
    [key],
  );
  if (!claimed.rowCount) return;
  try {
    await service.pool.query("DELETE FROM rate_limits WHERE expires_at<$1", [
      now,
    ]);
    await service.pool.query("DELETE FROM client_events WHERE occurred_at<$1", [
      new Date(now.getTime() - 90 * 86400000),
    ]);
    await service.pool.query(
      "DELETE FROM webhook_inbox WHERE processed_at<$1",
      [new Date(now.getTime() - 30 * 86400000)],
    );
    await service.pool.query(
      "UPDATE participant_sessions SET revoked_at=$1,token_hash=encode(sha256((id::text || $2)::bytea),'hex') WHERE expires_at<$1 AND revoked_at IS NULL",
      [now, randomUUID()],
    );
    await service.pool.query("DELETE FROM admin_sessions WHERE expires_at<$1", [
      now,
    ]);
    const rounds = (
      await service.pool.query<Round>(
        "SELECT * FROM rounds ORDER BY date DESC LIMIT 32",
      )
    ).rows;
    for (const round of rounds) await rebuildRound(service, round.id);
    await service.pool.query(
      "UPDATE operational_settings SET value='true' WHERE key=$1",
      [key],
    );
  } catch (error) {
    await service.pool.query("DELETE FROM operational_settings WHERE key=$1", [
      key,
    ]);
    throw error;
  }
}

export async function rebuildRound(service: BidService, roundId: string) {
  await transaction(service.pool, async (sql) => {
    const round = (
      await sql.query<Round>("SELECT * FROM rounds WHERE id=$1 FOR UPDATE", [
        roundId,
      ])
    ).rows[0];
    const differences = (
      await sql.query(
        `WITH ledger AS (
      SELECT p.id AS participant_id,coalesce(sum(pay.amount_sats) FILTER(WHERE pay.credit_status='credited' AND pay.settlement_status='settled'),0)::bigint AS total,
      coalesce(max(pay.credit_sequence) FILTER(WHERE pay.credit_status='credited' AND pay.settlement_status='settled'),0) AS sequence
      FROM participants p LEFT JOIN payments pay ON pay.participant_id=p.id WHERE p.round_id=$1 GROUP BY p.id
    ) SELECT l.*,t.total_sats AS previous FROM ledger l LEFT JOIN participant_totals t USING(participant_id) WHERE coalesce(t.total_sats,0)<>l.total OR coalesce(t.total_reached_sequence,0)<>l.sequence`,
        [roundId],
      )
    ).rows;
    if (!differences.length) return;
    for (const row of differences)
      await sql.query(
        "INSERT INTO participant_totals(participant_id,round_id,total_sats,total_reached_sequence) VALUES($1,$2,$3,$4) ON CONFLICT(participant_id) DO UPDATE SET total_sats=excluded.total_sats,total_reached_sequence=excluded.total_reached_sequence,updated_at=now()",
        [row.participant_id, roundId, row.total, row.sequence],
      );
    await service.audit(
      sql,
      "worker",
      "rebuild_totals",
      "round",
      roundId,
      "Ledger and projection differed",
      differences.map((d) => ({ id: d.participant_id, total: d.previous })),
      differences.map((d) => ({ id: d.participant_id, total: d.total })),
    );
    await service.refreshLeader(
      sql,
      round,
      "reconciliation",
      null,
      round.credit_sequence,
    );
    if (round.status === "closed")
      await sql.query(
        "UPDATE rounds SET result_revision=result_revision+1 WHERE id=$1",
        [roundId],
      );
  });
}
