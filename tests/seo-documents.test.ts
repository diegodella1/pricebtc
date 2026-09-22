// @vitest-environment jsdom
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { tmpdir } from "node:os";
import { join } from "node:path";
import manifest from "../src/shared/seo-pages.json";
let root: string;
beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), "pricebtc-documents-"));
  await writeFile(join(root, "index.html"), await readFile("index.html", "utf8"));
  await promisify(execFile)(process.execPath, ["scripts/prepare-static.mjs", root]);
});
afterAll(async () => { if (root) await rm(root, { recursive: true }); });
describe("generated SEO documents", () => {
  it("builds HTML entry documents for every newly added public React route", async () => {
    for (const route of ["terms", "privacy", "status", "pricing", "sponsors", "api"]) {
      const html = await readFile(join(root, route, "index.html"), "utf8");
      const document = new DOMParser().parseFromString(html, "text/html");
      expect(document.querySelector('script[type="module"]'), route).not.toBeNull();
      expect(document.querySelector('link[rel="canonical"]')?.getAttribute("href"), route).toBe(`https://priceb.tc/${route}`);
      expect(document.querySelector("h1")?.textContent, route).toBeTruthy();
    }
  });
  it("matches all visible FAQ answers to its structured data and makes the page discoverable", async () => {
    const html = await readFile(join(root, "faq/index.html"), "utf8");
    const document = new DOMParser().parseFromString(html, "text/html");
    const schema = JSON.parse(document.querySelector('#structured-data')!.textContent!);
    expect(schema["@type"]).toBe("FAQPage");
    expect(schema.url).toBe("https://priceb.tc/faq");
    const details = [...document.querySelectorAll("main details")];
    expect(details).toHaveLength(10);
    expect(schema.mainEntity).toEqual(details.map(detail => ({
      "@type": "Question", name: detail.querySelector("summary")!.textContent,
      acceptedAnswer: { "@type": "Answer", text: detail.querySelector(".faq-answer")!.textContent },
    })));
    expect(document.documentElement.lang).toBe("en");
    expect(document.querySelector('meta[name="robots"]')?.getAttribute("content")).toBe("index,follow,max-image-preview:large");
    expect(document.querySelector('meta[property="og:url"]')?.getAttribute("content")).toBe(schema.url);
    for (const href of ["/", "/bitcoin-price-updates", "/api", "/api/price?currency=USD", "/llms.txt", "/bitcoin-price-widget", "/bitcoin-obs-overlay", "/studio"]) expect(document.querySelector(`main a[href="${href}"]`)).not.toBeNull();
    for (const phrase of ["Coinbase Exchange (market BTC-USD)", "marketTimestamp", "receivedAt", "15 seconds", "HTTP 503 with PRICE_UNAVAILABLE", "ARS", "not a local exchange quote", "not financial advice"]) expect(document.body.textContent).toContain(phrase);
    expect(manifest.indexable).toContain("/faq");
    for (const path of ["index.html", "about/index.html", "api/index.html", "bitcoin-price-updates/index.html"]) {
      const page = new DOMParser().parseFromString(await readFile(join(root, path), "utf8"), "text/html");
      expect(page.querySelector('footer a[href="/faq"]')).not.toBeNull();
    }
    expect(await readFile("src/client/pages/home-page.tsx", "utf8")).toContain('href="/faq"');
  });
  it("gives every indexable document a unique title, canonical and valid conservative schema", async () => {
    const titles = new Set();
    for (const path of manifest.indexable) {
      const html = await readFile(join(root, path === "/" ? "index.html" : path.slice(1) + "/index.html"), "utf8");
      const document = new DOMParser().parseFromString(html, "text/html");
      expect(document.querySelectorAll("h1")).toHaveLength(1);
      expect(titles.has(document.title)).toBe(false); titles.add(document.title);
      expect(document.querySelector('link[rel="canonical"]')?.getAttribute("href")).toBe("https://priceb.tc" + path);
      for (const selector of ['meta[name="description"]', 'meta[property="og:title"]', 'meta[property="og:description"]', 'meta[name="twitter:card"]', 'link[rel="describedby"]']) expect(document.querySelector(selector)).not.toBeNull();
      const json = document.querySelector('script[type="application/ld+json"]');
      if (json) { const schema = JSON.parse(json.textContent!); expect(JSON.stringify(schema)).not.toContain('"@type":"Product"'); }
      if (path === "/") {
        expect(document.title).toBe("Bitcoin Price Now — Live BTC Price | PRICEB.TC");
        expect(json?.textContent).toContain('"Organization"');
        expect(document.querySelector('link[type="text/markdown"]')?.getAttribute("href")).toBe("https://priceb.tc/bitcoin-price.md");
        expect(html).toContain("<!--PRICE_SNAPSHOT-->");
        expect(html).toContain('href="/api"');
      }
      if (path === "/about" || path === "/faq" || manifest.guides.some(g => g.path === path)) expect(document.querySelector('script[type="module"]')).toBeNull();
    }
  });
  it("publishes a consistent entity on home and About without unsupported identity claims", async () => {
    const documents = await Promise.all(["index.html", "about/index.html"].map(async path =>
      new DOMParser().parseFromString(await readFile(join(root, path), "utf8"), "text/html")));
    const organizations = documents.map(document => {
      const graph = JSON.parse(document.querySelector('#structured-data')!.textContent!)["@graph"];
      const organization = graph.find((node: { "@type": string }) => node["@type"] === "Organization");
      expect(organization).toMatchObject({ "@id": "https://priceb.tc/#organization", name: "PRICEB.TC", url: "https://priceb.tc/", email: "contact@foreign.rodeo" });
      expect(organization.description).toContain("timestamped");
      for (const field of ["founder", "sameAs", "logo", "legalName"]) expect(organization).not.toHaveProperty(field);
      for (const node of graph.filter((node: { "@type": string }) => ["WebSite", "WebPage", "AboutPage"].includes(node["@type"]))) {
        expect(node.publisher).toEqual({ "@id": organization["@id"] });
      }
      expect(document.querySelector('footer a[href="/about"]')).not.toBeNull();
      return organization;
    });
    expect(organizations[0]).toEqual(organizations[1]);
    const about = documents[1]!;
    expect(about.documentElement.lang).toBe("en");
    expect(about.querySelector('meta[name="robots"]')?.getAttribute("content")).toBe("index,follow,max-image-preview:large");
    expect(about.querySelector('meta[property="og:url"]')?.getAttribute("content")).toBe("https://priceb.tc/about");
    for (const href of ["/", "/api", "/llms.txt", "/bitcoin-price-updates", "/studio", "/rules", "mailto:contact@foreign.rodeo"]) expect(about.querySelector(`main a[href="${href}"]`)).not.toBeNull();
    for (const text of ["Coinbase Exchange (market BTC-USD)", "not a global average", "indicative daily FX", "not financial advice"]) expect(about.body.textContent).toContain(text);
    const source = new DOMParser().parseFromString(await readFile("index.html", "utf8"), "text/html");
    expect(JSON.parse(source.querySelector('#structured-data')!.textContent!)["@graph"][0]).toEqual(organizations[0]);
  });
  it("includes only canonical document URLs in its sitemap", async () => {
    const xml = new DOMParser().parseFromString(await readFile(join(root, "sitemap.xml"), "utf8"), "text/xml");
    expect([...xml.querySelectorAll("loc")].map(n => n.textContent)).toEqual(manifest.indexable.map(p => "https://priceb.tc" + p));
    expect(manifest.indexable).toContain("/api");
  });
});
