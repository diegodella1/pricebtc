# SEO and crawler access

PRICEB.TC targets English live Bitcoin price searches with the homepage, plus distinct widget and OBS setup intents. The homepage serves an uncached BTC/USD snapshot from service memory, with the original market timestamp and source, to every visitor. React initializes from that observation and continues live updates. No request to Coinbase is added per HTML request. Stale observations are labeled; missing observations do not invent a quote. The downloadable static edition contains explanatory HTML without a build-time quote.

## Content and indexation

- `src/shared/seo-pages.json` defines the three guides and the six indexable sitemap routes. Guide HTML is complete and needs no JavaScript.
- `src/shared/site-content.json` holds homepage metadata and shared source explanation.
- `src/shared/sponsor-rules.json` supplies the same approved rules to static HTML and React.
- The build generates `sitemap.xml`. No `lastmod` is emitted until an editorial modification date is maintained; build time and quote time are not editorial modification dates.
- `/studio` has SoftwareApplication markup with a free offer for the widget software. The price itself is not a product offer. Guides use Article and BreadcrumbList; no invented author, review or freshness claims.
- `/leaderboard`, `/history`, `/day`, payments, admin and renderers are excluded from indexing during this prelaunch phase. Revisit archive indexation when real public rounds exist.
- Parameter variants point to the base canonical route. HTTP, www and live aliases redirect permanently to HTTPS apex.
- The origin robots policy is open for public search, assistant and training crawlers. Cloudflare currently adds managed restrictions in the public response; see the outstanding operator action below. `llms.txt` documents the public JSON API and source limitations; it is not a ranking mechanism.
- Robots, sitemap and llms responses require revalidation (`no-cache, max-age=0, must-revalidate`). This is stricter than the planned five minutes because Cloudflare extended a 300-second origin max-age to 14,400 seconds. Hashed assets retain the long cache policy.

## Search Console and Bing setup

Owner-account access is still required. Prefer a Search Console Domain property for `priceb.tc` and its provided DNS TXT verification. Alternatively set `SEO_GOOGLE_SITE_VERIFICATION` to the supplied HTML verification token during the client build. Set `SEO_BING_SITE_VERIFICATION` for the Bing HTML token. The build escapes and inserts supplied values; no placeholder credentials are published.

After verifying ownership, submit `https://priceb.tc/sitemap.xml` in both consoles and inspect the homepage and three guide URLs. Preserve the DNS TXT record or build environment tokens in future releases. Record indexation status, query impressions, clicks, CTR and average position. Review after 14 and 28 days, distinguishing indexing from ranking. Suggested query groups: live Bitcoin price, Bitcoin price today, Bitcoin price updated, Bitcoin website widget, Bitcoin OBS overlay. No positions or AI citations are guaranteed.

Cloudflare bot management, security level and browser-check reads returned HTTP 403 with the available token. The zone's verified-crawler access therefore remains unverified. Ordinary public requests with crawler user agents are useful smoke checks but do not prove access from verified crawler IPs. An owner or token with zone settings/bot read permissions can review these controls without broadly weakening protection.

## Validation

`tests/seo.test.ts` covers raw HTML observations, original timestamps, no-data and stale states, HTML escaping, crawler parity and control-file cache headers. Normal unit/type/lint checks apply. Build only into an isolated directory while `dist` points at production: `npm run build:preview`.

Browser and public deployment evidence for this change is recorded under `.data/seo-verification`. Lab timing on this overloaded host is diagnostic, not field Core Web Vitals. Search Console/CrUX data will be needed for field LCP, INP and CLS.

## Release evidence — 2026-09-07

Published release: `.data/releases/20260907T212743Z`. Immediate rollback: `.data/deployment-backups/pricebtc-20260907T212743Z/dist`. The original pre-SEO release is also preserved through `.data/deployment-backups/pricebtc-20260907T212017Z/dist`.

83 unit tests passed; 21 database integration cases skipped because this validation environment has no payment database. TypeScript and ESLint passed. The final snapshot renderer's five dedicated tests passed after its layout adjustment. Isolated builds succeeded.

The browser check covered the live homepage, HTML without application JavaScript, original observation time, all three guides, mobile overflow, Studio, transparent overlay, canonical/schema metadata, crawl-file cache headers, sitemap count, noindex archives and genuine 404 status. Initial lab CLS was about 0.36 on the prior site. Reserving the sponsor-loading space reduced a subsequent local run to 0.0004 (LCP 708 ms). These single-run measurements on different cache/network conditions are not field performance guarantees. Public curl TTFB samples were 289 ms before and 130 ms after publication.

Public HTTP, www and live aliases all returned 308 with the path and query preserved. The sponsor endpoint still reports `enabled:false`, `bids_open:false`, `coming_soon:true`.

## Outstanding Cloudflare operator action

The public robots.txt contains a Cloudflare Managed Content block with `ai-train=no` and disallow rules for GPTBot, ClaudeBot, Google-Extended and other training crawlers. The repository robots file does not add these restrictions. To fulfill the chosen open-training policy, an owner must disable managed robots restrictions in the zone's AI Crawl Control settings and review the corresponding AI bot blocking settings. The available API token cannot read or change these settings (403). Do not claim that all training agents currently have access. Public smoke requests carrying their user-agent strings are not evidence that the robots policy allows them.

Cloudflare also adds its analytics beacon to public guide pages. The guides contain no application JavaScript and their content does not depend on the injected beacon.

Reference for the observed browser TTL override: https://developers.cloudflare.com/cache/how-to/edge-browser-cache-ttl/set-browser-ttl/

Final public cache verification: sitemap.xml and llms.txt return `no-cache, max-age=0, must-revalidate` with Cloudflare DYNAMIC. Managed robots.txt still returns a four-hour max-age and Cloudflare's injected training restrictions, including on an uncached query variant. The origin returns the correct revalidation headers and open policy. Disabling Cloudflare managed robots is therefore required to complete both the robots TTL and open-training portions of the plan.

Final public browser verification passed for all application checks, with the managed robots limitation explicitly recorded. Last public lab sample: CLS 0.0134 and LCP 1,672 ms. Cloudflare's managed robots documentation: https://developers.cloudflare.com/bots/additional-configurations/managed-robots-txt/ . Search Console/Bing account verification and Cloudflare operator changes remain outstanding; no indexing, ranking or verified crawler access is claimed.
