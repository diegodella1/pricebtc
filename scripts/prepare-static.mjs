import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const outputDirectory = resolve(projectRoot, process.argv[2] ?? "pricebtc-freehosting");
const template = await readFile(join(outputDirectory, "index.html"), "utf8");
const siteContent = JSON.parse(
  await readFile(join(projectRoot, "src/shared/site-content.json"), "utf8"),
);
const origin = siteContent.origin;
const seoPages = JSON.parse(await readFile(join(projectRoot, "src/shared/seo-pages.json"), "utf8"));
const faq = JSON.parse(await readFile(join(projectRoot, "src/shared/faq.json"), "utf8"));
const guideLinks = seoPages.guides.map(g => `<a href="${g.path}">${escapeHtml(g.heading)}</a>`).join(" · ");
function guideMarkup(guide) {
  const api = guide.path === "/bitcoin-price-updates" ? `<section><h2>Public price API</h2><p>GET <a href="/api/price?currency=USD">/api/price?currency=USD</a> returns a timestamped observation. <a href="/api">Read the Bitcoin Price API documentation</a> for field definitions and a response example. Status is live or stale; no available snapshot returns HTTP 503 with PRICE_UNAVAILABLE.</p><p>GET /api/history?currency=USD&amp;range=24h returns timestamped points, range, currency, cachedAt and source. Each point may include volume (total candle BTC volume), buyVolume and sellVolume (recorded taker-side BTC amounts). A null split means unavailable, not zero. Recorded amounts may be partial and may update ahead of cached candle totals; they are never inferred from price direction. Supported ranges: 1h, 24h, 7d. GET <a href="/api/currencies">/api/currencies</a> lists supported currency codes. Currency defaults to USD; history range defaults to 24h. Invalid currencies or ranges return HTTP 400. Rate limits can return HTTP 429; back off and reuse your recent response.</p><p>Use ordinary GET requests. Avoid crawling live streams, payment, session or admin endpoints. Check timestamps on every observation.</p></section>` : "";
  const example = guide.path === "/bitcoin-price-widget" ? `<pre><code>&lt;iframe src="https://priceb.tc/embed?currency=USD" title="Bitcoin price in USD" width="480" height="240" loading="lazy"&gt;&lt;/iframe&gt;</code></pre>` : "";
  return `<div class="public-site"><header class="public-header site-header">${brandMarkup()}<nav><a href="/">Live price</a><a href="/studio">Widget Studio</a></nav></header><main id="main-content" class="public-main guide-content"><nav aria-label="Breadcrumb"><a href="/">Home</a> / Guide</nav><article><h1>${escapeHtml(guide.heading)}</h1><p>${escapeHtml(guide.description)}</p>${guide.sections.map(([h,p]) => `<section><h2>${escapeHtml(h)}</h2><p>${escapeHtml(p)}</p></section>${h === "A working starting point" ? example : ""}`).join("")}${api}<p><a class="action-link" href="/studio?mode=${guide.path.includes("obs") ? "overlay" : "embed"}">Open Widget Studio →</a></p></article><nav aria-label="Related guides">${guideLinks}</nav></main><footer class="public-footer"><a href="/about">About</a><a href="/faq">FAQ</a><a href="/">PRICEB.TC · Bitcoin, in view.</a><a href="/rules">Sponsor rules</a><a href="mailto:${siteContent.contactEmail}">Contact</a></footer></div>`;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function replaceMeta(html, attribute, key, value) {
  const pattern = new RegExp(`<meta\\b[^>]*\\b${attribute}=["']${key}["'][^>]*>`, "i");
  if (!pattern.test(html)) throw new Error(`Missing ${attribute} metadata: ${key}`);
  return html.replace(pattern, `<meta ${attribute}="${key}" content="${escapeHtml(value)}" />`);
}

function replaceHead(html, metadata) {
  let next = html.replace(/<title>[\s\S]*?<\/title>/i, `<title>${escapeHtml(metadata.title)}</title>`);
  next = next.replace(
    /<link\b[^>]*\brel=["']canonical["'][^>]*>/i,
    `<link rel="canonical" href="${escapeHtml(metadata.canonical)}" />`,
  );
  next = replaceMeta(next, "name", "description", metadata.description);
  next = replaceMeta(next, "name", "robots", metadata.robots);
  next = replaceMeta(next, "property", "og:url", metadata.canonical);
  next = replaceMeta(next, "property", "og:title", metadata.title);
  next = replaceMeta(next, "property", "og:description", metadata.description);
  next = replaceMeta(next, "name", "twitter:title", metadata.title);
  next = replaceMeta(next, "name", "twitter:description", metadata.description);

  for (const [name, value] of [["google-site-verification", process.env.SEO_GOOGLE_SITE_VERIFICATION], ["msvalidate.01", process.env.SEO_BING_SITE_VERIFICATION]]) {
    if (value) next = next.replace("</head>", `<meta name="${name}" content="${escapeHtml(value)}" /></head>`);
  }
  if (metadata.canonical === `${origin}/`) next = next.replace("</head>", `<link rel="alternate" type="text/markdown" href="${origin}/bitcoin-price.md" /></head>`);
  const structuredData = metadata.structuredData
    ? `<script id="structured-data" type="application/ld+json">${JSON.stringify(metadata.structuredData).replaceAll("<", "\\u003c")}</script>`
    : "";
  return next.replace(
    /<script\b[^>]*\bid=["']structured-data["'][^>]*>[\s\S]*?<\/script>/i,
    structuredData,
  );
}

function replaceRoot(html, content) {
  const marker = '<div id="root"></div>';
  if (!html.includes(marker)) throw new Error("Root marker missing from built HTML");
  return html.replace(marker, `<div id="root">${content}</div>`);
}

function brandMarkup() {
  return `<a class="brand brand--compact" href="/" translate="no"><span class="brand__mark" aria-hidden="true">₿</span><span class="brand__word">PRICEB.TC</span><span class="brand__tag">LIVE SIGNAL</span></a>`;
}

function homeFallback() {
  return `<div class="public-site static-fallback">
    <a class="skip-link" href="#main-content">Skip to content</a>
    <header class="public-header site-header">${brandMarkup()}<nav aria-label="Primary navigation"><a href="/#market">Price</a><a href="/sponsors#claim">Sponsors</a><a href="/api">API</a></nav><a class="action-link" href="/sponsors#claim">Claim a spot →</a></header>
    <main id="main-content" class="public-main">
      <section class="price-section" id="market"><div class="market-toolbar"><h1>Bitcoin price now</h1><span class="feed-state">Latest observation</span></div><div class="price-sponsor-grid"><div class="price-primary"><!--PRICE_SNAPSHOT--></div><aside aria-label="Sponsor space"><div class="sponsor-loading">Sponsor space<br /><span>Availability loads with JavaScript</span></div></aside></div><p class="observation-description">${escapeHtml(siteContent.home.observationDescription)} <a href="/api">Bitcoin Price API</a> · <a href="/methodology">Price source and methodology</a></p><div class="market-history"><div class="history-toolbar"><h2>Price history</h2><div class="pill-controls"><button type="button" aria-pressed="false" disabled>1H</button><button type="button" aria-pressed="true" disabled>24H</button><button type="button" aria-pressed="false" disabled>7D</button></div></div><div class="hero__chart"><p class="public-notice">Enable JavaScript for the live chart and automatic price updates.</p></div><div class="history-summary"><span>24H WINDOW</span><span>High —</span><span>Low —</span><span>Change —</span></div><details class="feed-details"><summary>About this price</summary><p>${escapeHtml(siteContent.home.priceExplanation)}</p></details></div></section>
      <section class="public-section" id="data"><h2>Simple tools. Clear sources.</h2><p>BTC/USD follows Coinbase Exchange trades. Other currencies use indicative daily rates from ExchangeRate-API.</p><p>Widgets are free, with no account required. Sponsorship is separate.</p></section>
    <nav aria-label="Bitcoin guides">${guideLinks}</nav></main><footer class="public-footer"><a href="/about">About</a><a href="/faq">FAQ</a><p>PRICEB.TC · Bitcoin, in view.</p><p>Indicative market data · Not financial advice</p><a href="mailto:${escapeHtml(siteContent.contactEmail)}">${escapeHtml(siteContent.contactEmail)}</a></footer>
  </div>`;
}

function faqPage() {
  return `<div class="public-site">
    <a class="skip-link" href="#main-content">Skip to content</a>
    <header class="public-header site-header">${brandMarkup()}<nav aria-label="Primary navigation"><a href="/">Live price</a><a href="/api">Bitcoin Price API</a></nav></header>
    <main id="main-content" class="public-main guide-content"><h1>PRICEB.TC FAQ</h1>
      <p>Bitcoin price source, timestamps, data status, currencies and access.</p>
      <div class="faq-section">${faq.map(({ question, answer, links }) => `<details><summary>${escapeHtml(question)}</summary><p class="faq-answer">${escapeHtml(answer)}</p>${links.length ? `<p>${links.map(([href, label]) => `<a href="${escapeHtml(href)}">${escapeHtml(label)}</a>`).join(" · ")}</p>` : ""}</details>`).join("")}</div>
      <nav aria-label="FAQ sources"><a href="/methodology">Price methodology</a> · <a href="/api">API documentation</a> · <a href="/llms.txt">Agent reference</a> · <a href="/">Home</a></nav>
    </main><footer class="public-footer"><a href="/">PRICEB.TC · Bitcoin, in view.</a><a href="/about">About</a><a href="/faq" aria-current="page">FAQ</a><a href="/rules">Rules</a></footer>
  </div>`;
}

function aboutPage() {
  return `<div class="public-site">
    <a class="skip-link" href="#main-content">Skip to content</a>
    <header class="public-header site-header">${brandMarkup()}<nav aria-label="Primary navigation"><a href="/">Live price</a><a href="/studio">Widget Studio</a></nav></header>
    <main id="main-content" class="public-main guide-content"><article>
      <h1>About PRICEB.TC</h1>
      <p>${escapeHtml(siteContent.home.summary)}</p>
      <section><h2>Source and timestamps</h2><p>PRICEB.TC provides a timestamped Bitcoin price sourced from Coinbase Exchange (market BTC-USD). The homepage, website widgets and public JSON API use the same observation.</p><p>Check the market timestamp and live or stale status before quoting a price. The market timestamp identifies the observation time; the service reception time is separate. Read <a href="/methodology">price source and updates</a> for methodology and freshness.</p></section>
      <section><h2>What this price means</h2><p>This is one exchange observation, not a global average Bitcoin price. Other currencies are indicative daily FX conversions. PRICEB.TC provides market information, not financial advice.</p></section>
      <section><h2>Use PRICEB.TC</h2><ul><li><a href="/">Bitcoin price now</a> — the current observation for readers.</li><li><a href="/api">Bitcoin Price API</a> — JSON fields, timestamps and errors.</li><li><a href="/llms.txt">Agent reference (llms.txt)</a> — source and freshness guidance for software agents.</li><li><a href="/studio">Widget Studio</a> — website widgets and OBS overlays.</li><li><a href="/rules">Sponsor rules</a> — participation and payment information.</li></ul></section>
      <section><h2>Contact</h2><p>For inquiries, operational problems or content reports, email <a href="mailto:${escapeHtml(siteContent.contactEmail)}">${escapeHtml(siteContent.contactEmail)}</a>.</p></section>
    </article></main>
    <footer class="public-footer"><a href="/">PRICEB.TC · Bitcoin, in view.</a><a href="/about" aria-current="page">About</a><a href="/faq">FAQ</a><a href="/api">Bitcoin Price API</a><a href="/rules">Rules</a></footer>
  </div>`;
}

function apiDocumentation() {
  const fields = [
    ["asset / symbol", "Bitcoin / BTC. The asset being observed."],
    ["currency", "Three-letter display currency. USD by default; supported codes are listed at /api/currencies."],
    ["price / priceUsd", "Decimal strings, preserving the existing precision convention. price is in the requested currency; priceUsd is the original USD quote."],
    ["change24h", "Number: percentage change over the source's 24-hour period."],
    ["marketTimestamp", "ISO 8601 market observation time. Use this to judge the age of the quote."],
    ["receivedAt / fxUpdatedAt", "ISO 8601 service reception time and FX update time (FX may be null). Reception time is not market observation time."],
    ["status", "live or stale. Snapshots received more than 15 seconds ago, or a degraded server feed, are stale. Always inspect marketTimestamp as well."],
    ["source", 'The existing string "coinbase", retained for compatibility.'],
    ["sourceDetails", 'Object with name "Coinbase Exchange" and market "BTC-USD". This market remains BTC-USD even when price is converted into another currency.'],
    ["provider", 'Object with name "PRICEB.TC" and url "https://priceb.tc/".'],
  ];
  return `<div class="public-site"><header class="public-header site-header">${brandMarkup()}<nav><a href="/">Bitcoin price now</a><a href="/methodology">Price methodology</a></nav></header><main class="public-main guide-content" id="main-content"><h1>PRICEB.TC Bitcoin Price API</h1><p>The free public JSON API returns the Bitcoin observation used by PRICEB.TC. BTC/USD comes from Coinbase Exchange; other currencies are indicative daily FX conversions. No API key is required.</p><h2>Get an observation</h2><p><code>GET /api/price?currency=USD</code></p><p><a href="/api/price?currency=USD">Open the current BTC/USD JSON response</a></p><h2>Response example</h2><p>The interactive example loads the current observation. Check its market timestamp before using it.</p><noscript><p>The JSON endpoint works without JavaScript.</p></noscript><h2>Fields</h2><dl>${fields.map(([name, description]) => `<dt><code>${escapeHtml(name)}</code></dt><dd>${escapeHtml(description)}</dd>`).join("")}</dl><h2>Freshness and errors</h2><p>Responses use Cache-Control: no-store. Each request reads the latest in-memory observation; it does not guarantee a new market trade. There is no single global Bitcoin price.</p><p>HTTP 400: INVALID_CURRENCY. HTTP 503: PRICE_UNAVAILABLE. Errors use code and message fields. Rate limiting can return HTTP 429; back off before retrying. The service currently limits requests to 120 per minute per IP across routes.</p><h2>Rate limits</h2><p>API endpoints are rate-limited to ensure fair access and system stability. All API responses include X-RateLimit-Limit, X-RateLimit-Remaining, and X-RateLimit-Reset headers indicating your current usage.</p><ul><li>General API endpoints: 120 requests per minute per IP</li><li>Stream endpoint (/api/stream): 20 connections per minute per IP</li></ul><p>When rate limits are exceeded, the API returns HTTP 429 (Too Many Requests) with a Retry-After header indicating when you can retry.</p><p>Check the <a href="/status">Status page</a> for current system health and detailed rate limit information.</p><h2>Related resources</h2><p><a href="/bitcoin-price.md">Bitcoin price as Markdown</a> · <a href="/api/currencies">Supported currencies</a> · <a href="/methodology">Source, updates and history API</a> · <a href="/studio">Widget Studio</a></p></main><footer class="public-footer"><a href="/about">About</a><a href="/faq">FAQ</a><a href="/">PRICEB.TC</a><a href="mailto:${siteContent.contactEmail}">Contact</a></footer></div>`;
}

function studioFallback() {
  return `
    <main class="not-found studio-static-fallback" id="main-content">
      <span>PRICEB.TC // WIDGET STUDIO</span>
      <h1>BUILD A BITCOIN<br>PRICE DISPLAY.</h1>
      <p>Configure a free website widget or transparent OBS overlay in 160+ fiat currencies. No account required.</p>
      <div><a class="button button--signal" href="/studio?mode=embed">CREATE A WEBSITE WIDGET →</a><a class="button button--light" href="/studio?mode=overlay">CREATE AN OBS OVERLAY →</a></div>
      <p>Inquiries: <a href="mailto:${escapeHtml(siteContent.contactEmail)}">${escapeHtml(siteContent.contactEmail)}</a></p>
    </main>`;
}

function notFoundFallback() {
  return `<main class="not-found" id="main-content"><span>404 / SIGNAL LOST</span><h1>NOTHING<br>ON THIS FREQUENCY.</h1><a class="button button--light" href="/">RETURN HOME →</a></main>`;
}

const applicationSchema = {
  "@type": "SoftwareApplication",
  "@id": `${origin}/#studio`,
  name: "PRICEB.TC Widget Studio",
  url: `${origin}/studio`,
  description: "Configure a live Bitcoin price widget or transparent OBS overlay and copy the ready-to-use URL.",
  applicationCategory: "FinanceApplication",
  operatingSystem: "Any",
  offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
  featureList: [
    "Website iframe embeds",
    "Transparent OBS and Streamlabs overlays",
    "160+ fiat currency conversions",
    "Six responsive layouts",
  ],
};

const organizationSchema = {
  "@type": "Organization",
  "@id": `${origin}/#organization`,
  name: siteContent.brand,
  url: `${origin}/`,
  description: siteContent.home.summary,
  email: siteContent.contactEmail,
  logo: {
    "@type": "ImageObject",
    url: `${origin}/og-bitcoin-price.png`,
    width: 1200,
    height: 630
  },
  sameAs: [
    "https://x.com/pricebtc"
  ]
};
const publisher = { "@id": organizationSchema["@id"] };

const websiteSchema = {
  "@context": "https://schema.org",
  "@graph": [
    organizationSchema,
    {
      "@type": "WebSite",
      "@id": `${origin}/#website`,
      url: `${origin}/`,
      name: siteContent.brand,
      description: siteContent.home.description,
      inLanguage: "en",
      publisher,
    },
    { "@type": "WebPage", "@id": `${origin}/#webpage`, url: `${origin}/`, name: siteContent.home.title, isPartOf: { "@id": `${origin}/#website` }, publisher },
  ],
};

const rules = JSON.parse(await readFile(join(projectRoot, "src/shared/sponsor-rules.json"), "utf8"));
const rulesSections = rules.map(section => `<section><h2>${escapeHtml(section.heading)}</h2>${section.paragraphs.map(p => `<p>${escapeHtml(p)}</p>`).join("")}</section>`).join("");
const pages = [
  {
    filename: "faq/index.html", staticOnly: true,
    metadata: {
      title: "Bitcoin Price FAQ — Source, Timestamps & API | PRICEB.TC",
      description: "Answers about PRICEB.TC: Coinbase BTC-USD, timestamps, live and stale data, indicative FX and ARS, the free API, agent citations, widgets and OBS.",
      canonical: `${origin}/faq`,
      robots: "index,follow,max-image-preview:large",
      structuredData: {
        "@context": "https://schema.org", "@type": "FAQPage",
        "@id": `${origin}/faq#webpage`, url: `${origin}/faq`,
        name: "PRICEB.TC FAQ", inLanguage: "en", publisher,
        isPartOf: { "@id": `${origin}/#website` },
        mainEntity: faq.map(({ question, answer }) => ({
          "@type": "Question", name: question,
          acceptedAnswer: { "@type": "Answer", text: answer },
        })),
      },
    },
    fallback: faqPage(),
  },
  {
    filename: "about/index.html", staticOnly: true,
    metadata: {
      title: "About PRICEB.TC — Timestamped Bitcoin Price Source",
      description: siteContent.home.summary,
      canonical: `${origin}/about`,
      robots: "index,follow,max-image-preview:large",
      structuredData: {
        "@context": "https://schema.org",
        "@graph": [organizationSchema, websiteSchema["@graph"][1], {
          "@type": "AboutPage", "@id": `${origin}/about#webpage`,
          url: `${origin}/about`, name: "About PRICEB.TC",
          description: siteContent.home.summary, inLanguage: "en",
          isPartOf: { "@id": `${origin}/#website` }, about: publisher, publisher,
        }],
      },
    },
    fallback: aboutPage(),
  },
  {
    filename: "api/index.html",
    metadata: { title: "Bitcoin Price JSON API — Documentation | PRICEB.TC", description: "Get the Bitcoin price used by PRICEB.TC as JSON. Read field definitions, timestamps, source details, currency conversions and error responses.", canonical: `${origin}/api`, robots: "index,follow,max-image-preview:large", structuredData: { "@context": "https://schema.org", "@type": "WebPage", name: "PRICEB.TC Bitcoin Price API", url: `${origin}/api` } },
    fallback: apiDocumentation(),
  },
  {
    filename: "sponsors/index.html",
    metadata: {
      title: "Claim a Top 21 Sponsor Slot — Bitcoin Price | PRICEB.TC",
      description: "Support PRICEB.TC and rank in the Top 21 by cumulative crypto contributions. Pay with BTC, USDT, or USDC. Anyone can outbid you anytime.",
      canonical: `${origin}/sponsors`,
      robots: "index,follow,max-image-preview:large",
      structuredData: {
        "@context": "https://schema.org",
        "@graph": [
          organizationSchema,
          {
            "@type": "WebPage",
            "@id": `${origin}/sponsors#webpage`,
            url: `${origin}/sponsors`,
            name: "Claim a Top 21 Sponsor Slot",
            description: "Support PRICEB.TC and rank in the Top 21 by cumulative crypto contributions. Claim your spot with BTC, USDT, or USDC.",
            inLanguage: "en",
            isPartOf: { "@id": `${origin}/#website` },
            publisher
          },
          {
            "@type": "Offer",
            "@id": `${origin}/sponsors#offer`,
            name: "PRICEB.TC Top 21 Sponsorship",
            description: "Rank in the Top 21 sponsors by cumulative USD contributions. Your project appears beside the live Bitcoin price.",
            seller: publisher,
            url: `${origin}/sponsors`,
            acceptedPaymentMethod: ["Bitcoin", "USDT", "USDC"],
            itemOffered: {
              "@type": "Service",
              name: "Top 21 Sponsor Placement",
              description: "Display your project name, logo, and link on PRICEB.TC homepage beside the live Bitcoin price, ranked by cumulative contributions."
            }
          }
        ]
      }
    },
    fallback: `<div class="public-site"><header class="public-header site-header">${brandMarkup()}<nav><a href="/">Bitcoin price</a><a href="/api">API</a><a href="/studio">Widget Studio</a></nav></header><main class="public-main guide-content"><h1>Claim a Top 21 sponsor slot beside the live Bitcoin price</h1><p>Support PRICEB.TC and rank in the Top 21 by cumulative crypto contributions. Pay with BTC, USDT, or USDC. Anyone can outbid you anytime.</p><section><h2>How it works</h2><ol><li><strong>Choose your asset:</strong> Select BTC (SegWit), USDT (TRC20), or USDC (Solana) and see the payment address.</li><li><strong>Pay:</strong> Send crypto from your wallet. Every payment adds to your cumulative USD total.</li><li><strong>Watch for confirmation:</strong> Click "I've sent the payment". We watch the deposit address for confirmations (paste tx hash is Advanced only).</li><li><strong>Add your profile:</strong> After your first confirmed payment, submit your project name, logo, website, and description to appear on the leaderboard.</li></ol></section><section><h2>Where your project appears</h2><p>Five home placements: hero spot #1, strip #2, and logo rail ranks #3–7 below the chart, plus the full Top 21 leaderboard at <a href="/sponsors#board">/sponsors</a>. Rankings update as payments confirm.</p></section><a class="action-link" href="/sponsors#claim">Claim your spot →</a></main><footer class="public-footer"><a href="/">PRICEB.TC · Bitcoin, in view.</a><a href="/about">About</a><a href="/sponsors">Sponsor</a><a href="/rules">Rules</a></footer></div>`,
  },
  {
    filename: "methodology/index.html",
    metadata: {
      title: "How we price Bitcoin | PRICEB.TC",
      description: "How PRICEB.TC builds its BTC/USD index from Coinbase and Binance, including fallback, outlier, and FX rules.",
      canonical: `${origin}/methodology`,
      robots: "index,follow,max-image-preview:large",
      structuredData: {
        "@context": "https://schema.org",
        "@graph": [
          organizationSchema,
          websiteSchema["@graph"][1],
          {
            "@type": "WebPage",
            "@id": `${origin}/methodology#webpage`,
            url: `${origin}/methodology`,
            name: "How we price",
            description: "How PRICEB.TC builds its BTC/USD index from Coinbase and Binance, including fallback, outlier, and FX rules.",
            inLanguage: "en",
            isPartOf: { "@id": `${origin}/#website` },
            publisher
          }
        ]
      }
    },
    fallback: `<div class="public-site"><a class="skip-link" href="#main-content">Skip to content</a><header class="public-header site-header">${brandMarkup()}<nav aria-label="Primary navigation"><a href="/#market">Price</a><a href="/sponsors#claim">Sponsors</a><a href="/api">API</a></nav><a class="action-link" href="/sponsors#claim">Claim a spot →</a></header><main id="main-content" class="public-main"><article class="prose"><h1>How we price</h1><p class="lead">PRICEB.TC publishes a <strong>BTC/USD index</strong> from <strong>Coinbase Exchange</strong> and <strong>Binance</strong> last prices, weighted by each venue's <strong>24-hour volume</strong>. It is a disclosed two-venue index — <strong>not</strong> a global average and <strong>not</strong> a claim of the "true" world price of Bitcoin.</p><section id="venues"><h2>Venues we use</h2><table><thead><tr><th>Venue</th><th>Pair</th><th>Weight in v1</th><th>Role</th></tr></thead><tbody><tr><td>Coinbase Exchange</td><td>BTC-USD</td><td>24h volume</td><td>Required USD spot leg</td></tr><tr><td>Binance</td><td>BTCUSDT</td><td>24h volume</td><td>Required; <strong>USDT-linked</strong> USD proxy (see note below)</td></tr></tbody></table><p>Kraken and other venues are <strong>not</strong> included in v1. Rolling 60-second trade-volume weights are <strong>not</strong> used in v1 (possible later).</p></section><section id="calculation"><h2>How the index is calculated</h2><p>When both venues are healthy, the headline price is a <strong>last-price VWAP</strong>: each venue's <strong>last price</strong> weighted by that venue's <strong>24-hour quoted volume</strong> (<code>weightSource: "24h"</code> on every v1 source).</p><p>Plain form:</p><pre><code>index = (last_coinbase × vol24h_coinbase + last_binance × vol24h_binance) / (vol24h_coinbase + vol24h_binance)</code></pre><p>(with Binance last price taken from BTCUSDT under the USDT≈USD assumption below).</p><p>We recompute as venue ticks arrive and publish to the site and API at most about <strong>once per second</strong>.</p><p>v1 does <strong>not</strong> use rolling 60-second trade volume for weights.</p></section><section id="usdt"><h2>Binance USDT note</h2><p>The Binance leg is <strong>BTCUSDT</strong>, not BTC-USD. For the index we treat <strong>1 USDT ≈ 1 USD</strong>. USDT can trade slightly away from the US dollar; that difference can move the index a little versus a pure USD book. We show this clearly so the number stays honest.</p></section><section id="fallback"><h2>When a venue is down</h2><table><thead><tr><th>Healthy venues</th><th>What you see</th></tr></thead><tbody><tr><td>Two</td><td>Full index — labeled <strong>BTC/USD index (Coinbase + Binance)</strong></td></tr><tr><td>One</td><td>That venue's last price only — labeled <strong>degraded</strong> (e.g. Coinbase only or Binance only). We do <strong>not</strong> pretend a one-venue print is still a multi-venue VWAP.</td></tr><tr><td>Zero</td><td>We hold the <strong>last good index for up to 30 seconds</strong>, then mark the feed <strong>stale / error</strong>. We never invent a number.</td></tr></tbody></table></section><section id="outlier"><h2>Outlier filter (2%)</h2><p>If one venue's last price differs by <strong>more than 2%</strong> from the median of healthy venues, we <strong>exclude</strong> it for that tick and keep using the remaining healthy venue(s). The API can mark that source as excluded; the methodology stays the same.</p></section><section id="stale"><h2>Stale data (30 seconds)</h2><p>If every venue feed fails, we keep showing the last good index for <strong>at most 30 seconds</strong>, then surface a stale/error state. We do not blend stale and fresh quotes into a silent average.</p></section><section id="ohlcv"><h2>24h stats on the home card (OHLCV)</h2><p>The home card's <strong>24h change, high, low, and volume</strong> stay tied to <strong>Coinbase Exchange BTC-USD</strong> ticker/stats, even when the headline number is the two-venue index. They are <strong>not</strong> an index OHLC. We label them as Coinbase so the card does not pretend the whole strip is multi-venue.</p></section><section id="fx"><h2>Other currencies (FX)</h2><p>Non-USD display currencies are <strong>indicative</strong> conversions (ExchangeRate-API), typically refreshed daily. They are not separate crypto spot markets.</p></section><section id="history"><h2>Price history</h2><p>The chart and history endpoints remain <strong>Coinbase BTC-USD labeled</strong> (<code>source: "coinbase"</code>) until a dedicated multi-venue history series exists. Past candles are <strong>not</strong> relabeled as the index.</p></section><section id="api"><h2>API</h2><p>The same observation is available at <a href="/api">/api</a> (<code>/api/price</code>, <code>/api/stream</code>, etc.). New fields such as <code>method</code>, <code>degraded</code>, and <code>sources[]</code> describe how the headline <code>price</code> was built. Clients that only read <code>price</code> keep working.</p></section><section><h2>What we do not claim</h2><p>We do <strong>not</strong> call this a global average, a world price, or the single true Bitcoin price. It is a <strong>two-venue BTC/USD index</strong> (last prices × <strong>24h volume</strong>) with explicit USDT, fallback, outlier, and stale rules — and Coinbase-labeled OHLCV/history until those series are multi-venue.</p></section><p class="methodology-updated">Methodology updated 2026-09-28</p></article></main></div>`,
  },
  ...[
    ["terms", "Terms of Service", "Terms for using PRICEB.TC."],
    ["privacy", "Privacy Policy", "How PRICEB.TC handles information."],
    ["status", "Service Status", "Current Bitcoin market feed and service health."],
    ["pricing", "Pricing", "Bitcoin price tools that scale with your business."],
  ].map(([route, title, description]) => ({
    filename: `${route}/index.html`,
    metadata: {
      title: `${title} | PRICEB.TC`, description,
      canonical: `${origin}/${route}`, robots: "index,follow", structuredData: null,
    },
    fallback: `<main id="main-content"><h1>${escapeHtml(title)}</h1><p>${escapeHtml(description)}</p></main>`,
  })),
  ...seoPages.guides.filter(guide => guide.path !== "/methodology").map(guide => ({
    filename: `${guide.path.slice(1)}/index.html`,
    metadata: { title: guide.title, description: guide.description, canonical: `${origin}${guide.path}`, robots: "index,follow,max-image-preview:large", structuredData: {
      "@context": "https://schema.org", "@graph": [
        { "@type": "WebPage", name: guide.heading, description: guide.description, url: `${origin}${guide.path}`, inLanguage: "en" },
        { "@type": "BreadcrumbList", itemListElement: [{ "@type": "ListItem", position: 1, name: "Home", item: `${origin}/` }, { "@type": "ListItem", position: 2, name: guide.heading, item: `${origin}${guide.path}` }] }
      ]
    } }, fallback: guideMarkup(guide), staticOnly: true,
  })),
  ...["bid", "leaderboard", "history", "day", "rules", "admin"].map(route => ({
    filename: `${route}/index.html`,
    metadata: {
      title: `${({ bid: "Take the spot", leaderboard: "Daily leaderboard", history: "Past rounds", day: "Round results", rules: "Participation rules", admin: "Round control" })[route]} | PRICEB.TC`,
      description: route === "rules" ? "Read the rules for the upcoming daily sponsor spot: participation, UTC rounds, payment limits, moderation and support." : "Upcoming daily sponsorship beside the Bitcoin price. Payments are coming soon.",
      canonical: `${origin}/${route}`,
      robots: ["bid", "admin", "day", "leaderboard", "history"].includes(route) ? "noindex,nofollow" : "index,follow",
      structuredData: null,
    },
    fallback: route === "rules" ? `<div class="public-site"><header class="public-header site-header">${brandMarkup()}</header><main class="public-main guide-content"><h1>THE RULES. NO GUESSWORK.</h1>${rulesSections}</main></div>` : `<main><h1>Sats Bid</h1><p>Pay sats. Take the spot. Someone else can take it from you.</p><a href="/">Live Bitcoin price</a></main>`,
  })),
  {
    filename: "index.html",
    metadata: {
      title: siteContent.home.title,
      description: siteContent.home.description,
      canonical: `${origin}/`,
      robots: "index,follow,max-image-preview:large",
      structuredData: websiteSchema,
    },
    fallback: homeFallback(),
  },
  {
    filename: "studio/index.html",
    metadata: {
      title: siteContent.studio.title,
      description: siteContent.studio.description,
      canonical: `${origin}/studio`,
      robots: "index,follow,max-image-preview:large",
      structuredData: { "@context": "https://schema.org", ...applicationSchema },
    },
    fallback: studioFallback(),
  },
  ...["embed", "overlay"].map((route) => ({
    filename: `${route}/index.html`,
    metadata: {
      title: `${route === "embed" ? "Bitcoin Website Widget" : "Bitcoin OBS Overlay"} Renderer | PRICEB.TC`,
      description: `PRICEB.TC ${route} renderer. Configure this utility output in the Widget Studio.`,
      canonical: `${origin}/${route}`,
      robots: "noindex,follow,noarchive",
      structuredData: null,
    },
    fallback: "",
  })),
  {
    filename: "404.html",
    metadata: {
      title: "Signal Not Found | PRICEB.TC",
      description: "This PRICEB.TC route does not exist.",
      canonical: `${origin}/404`,
      robots: "noindex,nofollow",
      structuredData: null,
    },
    fallback: notFoundFallback(),
  },
];

await Promise.all(
  pages.map(async ({ filename, metadata, fallback, staticOnly }) => {
    const destination = join(outputDirectory, filename);
    await mkdir(dirname(destination), { recursive: true });
    await writeFile(destination, replaceRoot(replaceHead(staticOnly ? template.replace(/<script\b[^>]*type="module"[^>]*><\/script>/g, "") : template, metadata), fallback));
  }),
);

process.stdout.write(`Prepared route-specific HTML in ${outputDirectory}\n`);

await writeFile(join(outputDirectory, "sitemap.xml"), `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${seoPages.indexable.map(path => `<url><loc>${origin}${path}</loc></url>`).join("")}</urlset>\n`);
