# PRICEB.TC technical SEO and agent readability

## Initial audit (2026-09-07, before edits)

Installed versions: React 19.2.8, Vite 7.3.6, Fastify 5.12.1; TypeScript and Node 22. The application uses explicit Fastify document/API routes and a small pathname-based React router. There is no Next.js SSR/ISR layer or framework sitemap generator.

The production homepage returned HTTP 200/no-store with a real Coinbase observation embedded in HTML. Fastify injects the in-memory observation into build-generated HTML, then React createRoot replaces the fallback and continues fetching/SSE updates. This is server-rendered essential data plus client rendering, not React hydration or ISR. The three guides are complete build-generated HTML without application JavaScript. Studio has a semantic static fallback and client configuration UI. The downloadable static edition does not freeze a market quote at build time.

All requested existing public documents returned 200 with correct absolute apex canonicals and individual titles. The current /api/price schema used decimal strings and source: "coinbase". /api documentation and a Markdown observation did not exist. Home and API had different treatment of degraded feed status. Equivalent /index.html and trailing-slash variants could serve duplicate documents. The shared source content still positioned the product primarily around widgets.

Production is a systemd service behind a Cloudflare tunnel, port 3466. dist points at .data/releases/20260907T212743Z. Building into dist would mutate the running release, so this change uses the production Vite/tsup pipeline via npm run build:preview into .data/sats-preview. This iteration is prepared for deployment; it does not swap production's release.

Cloudflare's public robots response adds managed training-crawler restrictions and a four-hour TTL despite an open, revalidating origin robots file. The previously available zone token cannot manage those settings. This iteration preserves the current GPTBot policy; only OAI-SearchBot receives an explicit origin Allow rule. No CDN settings were changed.

## Implementation and compatibility

- Homepage title: Bitcoin Price Now — Live BTC Price | PRICEB.TC. Its description and visible short explanation identify the market observation and public API. Existing price/sponsor/chart layout remains.
- JSON, initial home HTML, documentation example and Markdown read through one service helper. No per-page upstream requests, build-time quote, invented source, price or timestamp.
- API additions: asset, symbol, sourceDetails and provider. Existing fields and JSON types remain intact. In particular source stays "coinbase", price/priceUsd stay decimal strings, and change24h stays numeric. BTC-USD describes the source market even for an indicative converted price.
- A degraded service feed now marks the HTTP observation stale consistently with the homepage. No pricing arithmetic or payment logic changed. Status reflects feed/reception freshness; consumers must still check marketTimestamp for observation age.
- /api is complete server-delivered HTML. Its response example is injected from current service memory and is labeled as a request-time observation. /bitcoin-price.md is generated per request, no-store, text/markdown; absent data returns 503 with an explicit unavailable state. Its Link canonical points to the HTML home and it is noindex to avoid indexing a second quote document.
- Canonical document aliases redirect with 308 while retaining query parameters. Renderer/configuration URLs remain functional.
- /llms.txt is short, factual and linked using rel=describedby. Home advertises its Markdown alternate. The generated sitemap includes /api and excludes JSON endpoints, Markdown, private pages and query variants.
- Organization + WebSite + WebPage identify the homepage; guides use WebPage and visible BreadcrumbList. Studio retains accurate free SoftwareApplication markup. No Bitcoin Product/Offer, fake ratings, authors or metrics.
- Existing visible PRICEB.TC widget attribution is retained. The link now uses the canonical trailing slash and an explanatory accessible label/title; no extra text is squeezed into compact layouts.
- No dependencies added.

Schema assessment: 75/100, valid but limited (alignment 25, verified Google rich-result eligibility 0, data completeness 20, JSON technical design 15, maintenance 10, spam-risk controls 5). This conservative internal assessment is not a ranking score. Automated checks validate generated JSON and visible content; live Rich Results Test/Search Console inspection remains external.

## Files for this iteration

- src/server/app.ts, src/server/seo.ts, src/server/services/pricing.ts
- src/shared/contracts.ts, src/shared/site-content.json, src/shared/seo-pages.json
- scripts/prepare-static.mjs, index.html
- src/client/pages/home-page.tsx, src/client/components/widget-renderer.tsx, src/client/public.css
- public/robots.txt, public/llms.txt, public/sitemap.xml
- tests/seo.test.ts, tests/seo-documents.test.ts, tests/widget-renderer.test.tsx, tests/e2e/product.spec.ts
- docs/AEO-GEO-IMPLEMENTATION.md

## External release checklist

1. Deploy the verified isolated build using the existing release/rollback workflow. Recheck home raw HTML, /api, JSON, Markdown, robots, sitemap and canonical redirects through the public CDN.
2. Register/verify the priceb.tc property in Google Search Console. Submit https://priceb.tc/sitemap.xml and request initial indexing of the home, API documentation and guides.
3. Register/verify Bing Webmaster Tools and submit the same sitemap.
4. Review CDN and server logs for verified Googlebot, Bingbot and OAI-SearchBot requests, including successful HTML/API responses and any challenges or rate limits. User-agent smoke checks do not establish crawler identity or prove access from actual crawler IPs.
5. Review Cloudflare managed robots and security settings with an authorized zone owner. Keep GPTBot's explicit policy unless the owner deliberately changes it. The application cannot override Cloudflare's managed robots policy/TTL with its origin headers.
6. Run the public schema validators and monitor indexing/field performance. None of these changes guarantees indexing, rankings or citations in AI answers.

## Validation results

- npm run typecheck: passed.
- npm run lint: passed (the final lint was rerun after an interrupted process on the overloaded host).
- npm run test: 88 passed, 21 database integration cases skipped; no payment DB configured for this validation.
- npm run build:preview: production client/server build passed, isolated at .data/sats-preview.
- Browser verification in .data/verify-aeogeo.mjs: passed for initial/no-application-JS home, full timestamp, API documentation real example, JSON compatibility and EUR conversion provenance, uncached Markdown, all guides, mobile layout, Studio and transparent overlay. Includes canonical, sitemap, robots, noindex and 404 checks. Screenshots at .data/seo-verification.
- The only initial unit failure was an assertion expecting the old widget accessible name; it now checks the descriptive attribution label. No dependency was added for DOM metadata tests; the existing jsdom test environment is used.
- Production dist still points at .data/releases/20260907T212743Z; preview service stopped after verification. No release swap or CDN mutation performed in this iteration.

## Production deployment

Published at the user's request: `.data/releases/20260907T221211Z`. Rollback link: `.data/deployment-backups/pricebtc-20260907T221211Z/dist`. Service active. Public checks passed for the home with server-rendered observation, API documentation, compatible JSON, Markdown, seven-URL sitemap and llms.txt. The full targeted browser smoke passed against https://priceb.tc, with Cloudflare managed robots restrictions/TTL recorded as the existing external limitation. Payments remain coming soon.

The user reports adding the property to Google Search Console. Submit https://priceb.tc/sitemap.xml next; sitemap acceptance/indexing has not been independently verified.

## Agentic navigation audit correction

The user supplied a PageSpeed/Lighthouse report flagging prohibited ARIA attributes on the widget price and llms.txt recommendations. Price containers now use a named group role that permits aria-label; visual styling and exact/compact values remain intact. llms.txt now uses a blockquote summary and named Markdown links instead of bare URLs. Lighthouse's source checks an H1, at least one Markdown link and at least 50 characters: https://github.com/GoogleChrome/lighthouse/blob/main/core/audits/agentic/llms-txt.js .

Typecheck, lint, production build and nine widget unit tests passed. Temporary axe-core 4.13.0 checks passed on home, embed and Studio for aria-allowed-attr, aria-prohibited-attr, aria-valid-attr, aria-valid-attr-value and aria-roles. Test browser bypasses CSP only to inject the validator; site security policy remains unchanged. No dependencies added. Deployment: .data/releases/20260907T222620Z; rollback: .data/deployment-backups/pricebtc-20260907T222620Z/dist. A fresh PageSpeed run is still needed to confirm the full external category result; no 3/3 score is claimed.
