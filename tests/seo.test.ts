import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, writeFile, rm, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildApp } from "../src/server/app.js";
import { renderPriceSnapshot } from "../src/server/seo.js";
import type { MarketSnapshot } from "../src/shared/contracts.js";

const cleanup: (() => Promise<unknown>)[] = [];
const applicationShell = '<html><h1>Live Bitcoin price</h1><!--PRICE_SNAPSHOT--><script type="module" src="/assets/app.js"></script></html>';
afterEach(async () => { for (const task of cleanup.reverse()) await task(); cleanup.length = 0; });

async function frontend(snapshot: MarketSnapshot | null, state: "live" | "degraded" = "live") {
  const root = await mkdtemp(join(tmpdir(), "pricebtc-seo-"));
  const previous = process.env.PRICEBTC_FRONTEND_DIR;
  process.env.PRICEBTC_FRONTEND_DIR = root;
  cleanup.push(async () => { if (previous === undefined) delete process.env.PRICEBTC_FRONTEND_DIR; else process.env.PRICEBTC_FRONTEND_DIR = previous; await rm(root, { recursive: true }); });
  await writeFile(join(root, "index.html"), applicationShell);
  await mkdir(join(root, "api"));
  await writeFile(join(root, "api/index.html"), '<html><h1>PRICEB.TC Bitcoin Price API</h1><!--API_OBSERVATION--></html>');
  await mkdir(join(root, "about"));
  await writeFile(join(root, "about/index.html"), '<html lang="en"><h1>About PRICEB.TC</h1></html>');
  await mkdir(join(root, "faq"));
  await writeFile(join(root, "faq/index.html"), '<html lang="en"><h1>PRICEB.TC FAQ</h1></html>');
  for (const name of ["robots.txt", "sitemap.xml", "llms.txt"]) await writeFile(join(root, name), "public");
  const app = buildApp({
    market: { getSnapshot: () => snapshot, getState: () => state },
    fx: { supportsCurrency: () => true, convertUsd: p => p, getCurrencies: () => [], getStatus: () => ({ state: "live", updatedAt: null }) },
    history: { getHistory: async range => ({ range, points: [], cachedAt: "", source: "coinbase", high24h: null, low24h: null, volume24h: null }) },
    streams: { open: () => undefined, getClientCount: () => 0 }, logger: false,
  });
  cleanup.push(() => app.close());
  return app;
}

describe("crawlable price documents", () => {
  it("serves FAQ as an indexable public HTML document", async () => {
    const response = await (await frontend(null)).inject("/faq");
    expect(response.statusCode).toBe(200);
    expect(response.headers["content-type"]).toContain("text/html");
    expect(response.headers["x-robots-tag"]).toBeUndefined();
    expect(response.body).toContain("PRICEB.TC FAQ");
  });
  it("serves About as a public HTML document", async () => {
    const response = await (await frontend(null)).inject("/about");
    expect(response.statusCode).toBe(200);
    expect(response.headers["content-type"]).toContain("text/html");
    expect(response.headers["x-robots-tag"]).toBeUndefined();
    expect(response.body).toContain("About PRICEB.TC");
  });
  it("delivers the same timestamped observation to browsers and crawlers without caching the quote", async () => {
    const receivedAt = new Date().toISOString();
    const app = await frontend({ priceUsd: "91023.45", change24h: 2.5, receivedAt, marketTimestamp: receivedAt, sequence: 1, high24h: "92000", low24h: "90000", volume24h: "12345" });
    const browser = await app.inject("/");
    const crawler = await app.inject({ url: "/", headers: { "user-agent": "OAI-SearchBot" } });
    expect(browser.body).toBe(crawler.body);
    expect(browser.body).toContain("$91,023.45");
    expect(browser.body).toContain(`title="${receivedAt}"`);
    expect(browser.body).toContain("Coinbase Exchange");
    expect(browser.body).toContain("High 24h");
    expect(browser.body).toContain("$92,000");
    expect(browser.body).toContain("$90,000");
    expect(browser.body).toContain("12,345 BTC");
    expect(browser.body).toContain('<strong class="kpi-value">$92,000</strong>');
    expect(browser.body).toContain('<strong class="kpi-value">$90,000</strong>');
    expect(browser.body).toContain('<strong class="kpi-value">12,345 BTC</strong>');
    expect(browser.headers["cache-control"]).toBe("no-store");
  });
  it("labels an old snapshot as stale and preserves its observation time", async () => {
    const app = await frontend({ priceUsd: "90000", change24h: -1, receivedAt: "2020-01-01T00:00:00Z", marketTimestamp: "2020-01-01T00:00:00Z", sequence: 1, high24h: null, low24h: null, volume24h: null });
    const response = await app.inject("/");
    expect(response.body).toContain("Stale");
    expect(response.body).toContain('title="2020-01-01T00:00:00Z"');
  });
  it("does not invent a quote while waiting for data", async () => {
    const response = await (await frontend(null)).inject("/");
    expect(response.body).toContain("Price unavailable");
    expect(response.body).not.toContain("initial-price");
  });
  it("refreshes crawler control files instead of marking them immutable", async () => {
    const app = await frontend(null);
    for (const path of ["/robots.txt", "/sitemap.xml", "/llms.txt"]) {
      const response = await app.inject(path);
      expect(response.statusCode).toBe(200);
      expect(response.headers["cache-control"]).toBe("no-cache, max-age=0, must-revalidate");
    }
    expect((await app.inject("/leaderboard")).headers["x-robots-tag"]).toContain("noindex");
    expect((await app.inject("/day/2026-09-07")).headers["x-robots-tag"]).toContain("noindex");
  });
  it("keeps JSON and Markdown compatible while the API landing serves the React application", async () => {
    const timestamp = new Date().toISOString();
    const snapshot = { priceUsd: "91234.56789", change24h: -2.5, marketTimestamp: timestamp, receivedAt: timestamp, sequence: 1, high24h: null, low24h: null, volume24h: null };
    const app = await frontend(snapshot);
    const json = (await app.inject("/api/price?currency=USD")).json();
    expect(json).toMatchObject({ asset: "Bitcoin", symbol: "BTC", currency: "USD", price: "91234.56789", change24h: -2.5, source: "coinbase", sourceDetails: { name: "Coinbase Exchange", market: "BTC-USD" }, provider: { name: "PRICEB.TC", url: "https://priceb.tc/" } });
    const md = await app.inject("/bitcoin-price.md");
    expect(md.headers["content-type"]).toContain("text/markdown");
    expect(md.headers["cache-control"]).toBe("no-store");
    expect(md.body).toContain("91234.56789 USD");
    expect(md.body).toContain(timestamp);
    const doc = await app.inject("/api");
    expect(doc.statusCode).toBe(200);
    expect(doc.headers["cache-control"]).toBe("no-cache");
    expect(doc.body).toBe(applicationShell);
    snapshot.priceUsd = "92345.6789";
    expect((await app.inject("/bitcoin-price.md")).body).toContain("92345.6789 USD");
    expect((await app.inject("/")).body).toContain("$92,345.68");
  });
  it("returns unavailable Markdown with HTTP 503 and consistent stale states", async () => {
    const app = await frontend(null);
    const md = await app.inject("/bitcoin-price.md");
    expect(md.statusCode).toBe(503);
    expect(md.body).toContain("Status: unavailable");
    expect((await app.inject("/api/price")).json().code).toBe("PRICE_UNAVAILABLE");
    const timestamp = new Date().toISOString();
    const degraded = await frontend({ priceUsd: "1", change24h: 0, marketTimestamp: timestamp, receivedAt: timestamp, sequence: 1, high24h: null, low24h: null, volume24h: null }, "degraded");
    expect((await degraded.inject("/api/price")).json().status).toBe("stale");
    expect((await degraded.inject("/bitcoin-price.md")).body).toContain("Status: stale");
    expect((await degraded.inject("/")).body).toContain("Stale");
  });
  it("consolidates HTML and trailing-slash aliases without losing query parameters", async () => {
    const app = await frontend(null);
    for (const [path, target] of [["/faq/", "/faq"], ["/faq/index.html", "/faq"], ["/index.html", "/"], ["/about/", "/about"], ["/about/index.html", "/about"], ["/api/", "/api"], ["/studio/index.html?mode=overlay", "/studio?mode=overlay"], ["/bitcoin-price-widget/", "/bitcoin-price-widget"]]) {
      const response = await app.inject(path!);
      expect(response.statusCode).toBe(308);
      expect(response.headers.location).toBe(target);
    }
  });
  it("escapes untrusted strings in HTML and bootstrap data", () => {
    const output = renderPriceSnapshot({ currency: "USD", price: "1", priceUsd: "1", change24h: 0, high24h: null, low24h: null, volume24h: null, marketTimestamp: '"><script>alert(1)</script>', receivedAt: "", fxUpdatedAt: null, source: "coinbase", status: "stale" });
    expect(output).not.toContain("<script>");
    expect(output).toContain("&lt;script&gt;");
  });
});
