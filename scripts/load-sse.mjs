const baseUrl = process.env.LOAD_BASE_URL ?? "http://127.0.0.1:3466";
const clientCount = Number(process.env.LOAD_CLIENTS ?? 250);
const holdMs = Number(process.env.LOAD_HOLD_MS ?? 5_000);

if (!Number.isInteger(clientCount) || clientCount < 1 || clientCount > 500) {
  throw new Error("LOAD_CLIENTS must be an integer between 1 and 500");
}

const controllers = Array.from({ length: clientCount }, () => new AbortController());
const readers = [];
const startedAt = performance.now();

async function openClient(index) {
  const requestStartedAt = performance.now();
  const address = `198.51.100.${(index % 250) + 1}`;
  const response = await fetch(`${baseUrl}/api/stream?currency=USD`, {
    headers: {
      Accept: "text/event-stream",
      "CF-Connecting-IP": address,
      "X-Forwarded-For": address,
    },
    signal: controllers[index].signal,
  });
  if (!response.ok || !response.body) throw new Error(`Client ${index} failed with ${response.status}`);
  const reader = response.body.getReader();
  readers.push(reader);
  const firstChunk = await reader.read();
  if (firstChunk.done) throw new Error(`Client ${index} closed before first event`);
  return performance.now() - requestStartedAt;
}

try {
  const latencies = await Promise.all(Array.from({ length: clientCount }, (_, index) => openClient(index)));
  await new Promise((resolve) => setTimeout(resolve, holdMs));
  const healthResponse = await fetch(`${baseUrl}/healthz`);
  const health = await healthResponse.json();
  const sortedLatencies = latencies.toSorted((left, right) => left - right);
  const percentileIndex = Math.min(sortedLatencies.length - 1, Math.ceil(sortedLatencies.length * 0.95) - 1);
  console.log(
    JSON.stringify(
      {
        clients: clientCount,
        connected: readers.length,
        connectP95Ms: Math.round(sortedLatencies[percentileIndex] ?? 0),
        elapsedMs: Math.round(performance.now() - startedAt),
        health,
      },
      null,
      2,
    ),
  );
} finally {
  for (const controller of controllers) controller.abort();
  await Promise.allSettled(readers.map((reader) => reader.cancel()));
}
