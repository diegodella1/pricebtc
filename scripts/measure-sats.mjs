import { performance } from "node:perf_hooks";
const origin = process.env.SATS_MEASURE_URL ?? "http://127.0.0.1:3478";
const warmup = await fetch(`${origin}/api/sats-bid/leaderboard`);
const dataset = await warmup.json();
const measurements = await Promise.all(
  Array.from({ length: 50 }, async () => {
    const start = performance.now();
    const response = await fetch(`${origin}/api/sats-bid/leaderboard`);
    await response.arrayBuffer();
    return { status: response.status, milliseconds: performance.now() - start };
  }),
);
const timings = measurements.map((m) => m.milliseconds).sort((a, b) => a - b);
process.stdout.write(
  JSON.stringify(
    {
      origin,
      measured_at: new Date().toISOString(),
      readers: 50,
      visible_participants: dataset.participant_count,
      p95_ms: timings[Math.ceil(timings.length * 0.95) - 1],
      maximum_ms: timings.at(-1),
      errors: measurements.filter((m) => m.status !== 200).length,
    },
    null,
    2,
  ) + "\n",
);
