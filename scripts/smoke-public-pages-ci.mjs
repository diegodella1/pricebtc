// Exercise the deployment browser contract against the built frontend and real
// HTTP routes, using local market fixtures instead of external exchange services.
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { buildApp } from "../src/server/app.ts";
import { PlausibleService } from "../src/server/services/plausible.ts";
import { verifyPublicPages } from "./smoke-public-pages.mjs";

process.env.PRICEBTC_FRONTEND_DIR = resolve(process.argv[2] ?? "dist/client");
const directory = await mkdtemp(join(tmpdir(), "pricebtc-browser-ci-"));
const timestamp = () => new Date().toISOString();
const app = buildApp({
  market: {
    getState: () => "live",
    getSnapshot: () => ({ priceUsd: "90000", change24h: 1, high24h: "91000", low24h: "89000", volume24h: "100", sequence: 1, marketTimestamp: timestamp(), receivedAt: timestamp() }),
  },
  fx: {
    supportsCurrency: () => true, convertUsd: price => price,
    getCurrencies: () => ["USD", "ARS", "EUR"].map(code => ({ code, name: code, symbol: code })),
    getStatus: () => ({ state: "live", updatedAt: timestamp() }),
  },
  history: { getHistory: async range => ({ range, source: "coinbase", cachedAt: timestamp(), high24h: "91000", low24h: "89000", volume24h: "100", points: [
    { timestamp: new Date(Date.now() - 300_000).toISOString(), price: "89000", volume: "10" },
    { timestamp: timestamp(), price: "90000", volume: "20" },
  ] }) },
  streams: { getClientCount: () => 0, open: (_request, reply) => reply.code(503).send({ code: "CI_STREAM_DISABLED" }) },
  plausible: new PlausibleService(), dataDir: directory, logger: false,
});

try {
  const base = await app.listen({ host: "127.0.0.1", port: 0 });
  await verifyPublicPages(base, { offline: true });
} finally {
  await app.close();
  await rm(directory, { recursive: true, force: true });
}
