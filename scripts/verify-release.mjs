import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

export async function verifyRelease(base, directory) {
  const request = async path => {
    const response = await fetch(`${base}${path}`, { signal: AbortSignal.timeout(15_000), cache: "no-store" });
    if (!response.ok) throw new Error(`${path}: HTTP ${response.status}`);
    return response;
  };
  const health = await (await request("/healthz")).json();
  if (health.market?.state !== "live" || !["live", "stale"].includes(health.fx?.state)) throw new Error("Market or FX not ready");
  if (!(Date.now() - Date.parse(health.market.lastUpdateAt) < 15_000)) throw new Error("Market data is stale");
  const expected = readFileSync(`${directory}/client/index.html`, "utf8").match(/\/assets\/index-[\w-]+\.js/)?.[0];
  if (!expected) throw new Error("Build has no entry asset");
  for (const path of ["/", "/studio"]) {
    const html = await (await request(path)).text();
    if (!html.includes(expected)) throw new Error(`${path}: wrong release asset`);
  }
  const asset = await (await request(expected)).text();
  if (asset !== readFileSync(`${directory}/client${expected}`, "utf8")) throw new Error("Asset content differs from release");
  for (const path of ["/api/price?currency=USD", "/api/history?currency=EUR&range=1h"]) {
    await (await request(path)).json();
  }
  await request("/embed?currency=USD&layout=card");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    await verifyRelease(process.argv[2], process.argv[3]);
    console.log(`Release verified: ${process.argv[2]}`);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
