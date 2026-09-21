import { randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";
const origin = process.env.SATS_MEASURE_URL ?? "http://127.0.0.1:3478";
let cookie = "";
async function request(path, body, extra = {}) {
  const response = await fetch(`${origin}/api/sats-bid${path}`, {
    method: body ? "POST" : "GET",
    headers: {
      Origin: origin,
      "X-Sats-Bid-Csrf": "1",
      "Content-Type": "application/json",
      Cookie: cookie,
      ...extra,
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const setCookie = response.headers
    .getSetCookie()
    .find((value) => value.startsWith("pricebtc_participant="));
  if (setCookie) cookie = setCookie.split(";")[0];
  const value = await response.json();
  if (!response.ok)
    throw new Error(
      `${response.status}: ${value.error?.code ?? "request failed"}`,
    );
  return value;
}
const round = await request("/round/current");
if (round.provider !== "mock" || !round.bids_open)
  throw new Error("Requires an open, isolated mock environment");
await request("/participants", {
  name: "Recovery check · Demo",
  description: "Simulated payment without a webhook",
  url: "https://example.com/recovery",
});
const payment = await request(
  "/bids",
  {
    round_id: round.id,
    amount_sats: round.minimum_sats,
    rules_version: round.rules_version,
    accepted_rules: true,
  },
  { "Idempotency-Key": randomUUID() },
);
await request(`/dev/payments/${payment.id}/simulate`, { scenario: "lost" });
const start = performance.now();
let state;
do {
  await new Promise((resolve) => setTimeout(resolve, 2000));
  state = await request(`/payments/${payment.id}`);
} while (
  state.credit_status !== "credited" &&
  performance.now() - start < 120000
);
const result = {
  measured_at: new Date().toISOString(),
  provider: "mock",
  payment_id: payment.id,
  webhook_delivered: false,
  recovery_ms: Math.round(performance.now() - start),
  credit_status: state.credit_status,
};
process.stdout.write(JSON.stringify(result, null, 2) + "\n");
if (state.credit_status !== "credited") process.exitCode = 1;
