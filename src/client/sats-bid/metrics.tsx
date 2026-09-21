import { sats } from "./api.js";
export interface Metrics {
  days: number;
  gross_sats: string;
  repeat_bid_after_outbid: number;
  participants_outbid: number;
  recovery_rate: number | null;
  invoices_created: number;
  payments_credited: number;
  paying_participants: number;
  invoice_conversion: number | null;
  mean_confirmation_seconds: number | null;
  events: { type: string; count: number; participants: number }[];
  jobs: { name: string; last_success_at: string | null }[];
}
const percentage = (value: number | null) =>
  value === null ? "No data" : `${(value * 100).toFixed(1)}%`;
export function MetricsPanel({ metrics }: { metrics: Metrics }) {
  return (
    <section>
      <div className="bid-metrics">
        <article>
          <span>RETURNED AFTER BEING OUTBID</span>
          <strong>{metrics.repeat_bid_after_outbid}</strong>
          <p>
            {percentage(metrics.recovery_rate)} of {metrics.participants_outbid}{" "}
            displaced participants
          </p>
        </article>
        <article>
          <span>GROSS PARTICIPATION</span>
          <strong>{sats(metrics.gross_sats)}</strong>
          <p>Sats credited · before operating costs</p>
        </article>
        <article>
          <span>INVOICE → CREDIT</span>
          <strong>{percentage(metrics.invoice_conversion)}</strong>
          <p>
            {metrics.payments_credited} payments / {metrics.invoices_created}{" "}
            invoices
          </p>
        </article>
        <article>
          <span>PAYING PARTICIPANTS</span>
          <strong>{metrics.paying_participants}</strong>
          <p>
            Mean confirmation:{" "}
            {metrics.mean_confirmation_seconds === null
              ? "No data"
              : `${metrics.mean_confirmation_seconds.toFixed(1)}s`}
          </p>
        </article>
      </div>
      <p className="bid-caption">
        UTC rounds · {metrics.days} day window. Returning after being outbid
        does not require reclaiming first place. Moderation and historical
        corrections do not create commercial outbid events.
      </p>
      <div className="bid-admin-list">
        {metrics.jobs.map((job) => (
          <p key={job.name}>
            {job.name}:{" "}
            {job.last_success_at
              ? `last success ${new Date(job.last_success_at).toISOString()}`
              : "No successful run yet"}
          </p>
        ))}
        <table>
          <thead>
            <tr>
              <th>Event</th>
              <th>Count</th>
              <th>Participants / rounds</th>
            </tr>
          </thead>
          <tbody>
            {metrics.events.map((event) => (
              <tr key={event.type}>
                <td>{event.type.replaceAll("_", " ")}</td>
                <td>{event.count}</td>
                <td>{event.participants}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
