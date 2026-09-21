# Production deployment — 2026-09-07

## Follow-up: public interface redesign

Active release: `.data/releases/20260907T185859Z`. Rollback symlink:
`.data/deployment-backups/pricebtc-20260907T185859Z/dist`.
The tested preview client/server were copied into an isolated release, then the
API was restarted and its health checked. Private environment, database, payment
flags, tunnel and DNS were preserved.

The homepage now leads with the Bitcoin price and sponsor placement, followed by
history, sponsor inventory/explanation/ranking and a working widget preview.
OBS and website sponsorship are explicitly future concepts. Studio and public
sponsorship pages share the charcoal/orange identity and local fonts. Existing
exported widget appearance and URLs remain compatible. See [design notes](PUBLIC-DESIGN.md).

TypeScript, lint, isolated client/server builds and 78 unit tests passed; 21
PostgreSQL tests were skipped in the no-database environment. The coming-soon
Playwright case passed against the final design before the last minor button
decoration/spacing adjustment. The full Playwright run could not finish reliably
under host load (browser startup and context/connection failures); it is not
reported as passing. A separate single-page Chromium verification completed
successfully on the final build, covering responsive sponsor geometry, actual
market/chart data, preview/export, clipboard success/failure, Studio controls and
mode drafts, public sponsorship routes, six layouts, transparency, unavailable
sponsor service, stale market data, large prices, 200% zoom and keyboard access.
No JavaScript page errors were observed. Screenshots and verification scripts
are under `.data/design-verification/` and `.data/verify-public-design.mjs`.

Post-deployment verification passed against public HTTPS: the new
`index-DibscJrG.js` release and referenced assets return 200, health returns 200,
and sponsorship remains `enabled: false`, `bids_open: false`, `coming_soon: true`.
Chromium confirmed the public desktop/mobile homepage, sponsor inventory, empty
ranking, Studio, sponsorship pages and canonical exported preview URL, with no
page errors. The www/live/HTTP redirects still preserve the Studio path/query
with 308. Public screenshots are `production-*.png` in the same verification
directory; `.data/verify-design-production.mjs` records the checks.

## Follow-up: live subdomain redirect

Active release: `.data/releases/20260907T173925Z`. The previous release symlink is
preserved in `.data/deployment-backups/pricebtc-20260907T173925Z/dist`.
This release keeps the previous client assets and updates the API canonical-host
redirect to include `live.priceb.tc`.

Created the proxied CNAME `live.priceb.tc` pointing to
`55ecc138-2b04-4678-b3cf-5460da1aa1ff.cfargotunnel.com` (DNS record
`63ca030ef474a83599f0c7b9ea7757c4`). The shared tunnel now routes this hostname to
port 3466, with `httpHostHeader: www.priceb.tc`. The application redirects both
hostnames, including the original forwarded hostname, to `https://priceb.tc`.
The tunnel configuration backup is `.data/live-redirect-hh090zgn/config.before.yml`.
Other tunnel routes were preserved. Cloudflare Rulesets access was unavailable
with the existing token, so the permanent redirect is handled by the application.
The tunnel setup script also includes the live hostname for future installations.

TypeScript, focused ESLint, the backend build, all 10 API tests and shell syntax
validation passed. Public HTTP and HTTPS requests to live returned 308; a Studio
path and query were preserved exactly. Following the redirect returned 200 at
the apex. The www redirect and apex health check passed; API and tunnel services
are active. Payment configuration remains unchanged.

## Follow-up: public sponsor presentation

Release `.data/releases/20260907T153658Z` is now active. Its predecessor is preserved
in `.data/deployment-backups/pricebtc-20260907T153658Z/dist`.

The homepage now shows the available sponsor spot, a three-step explanation and
an empty leaderboard. Payments display “PRÓXIMAMENTE / COMING SOON”. `/bid`,
`/leaderboard` and `/history` have matching pre-launch states with no payment form.
The no-database status endpoint returns `coming_soon: true`, while `enabled` and
`bids_open` remain false. No credentials, production database or payment flags changed.

TypeScript, lint, build and 77 tests passed in this rollout (21 isolated database
tests skipped). A dedicated Chromium test passed against a no-database preview;
the public HTTPS site was then checked with Chromium at 360, 768 and 1440px.
Sponsor content, empty ranking, pre-launch pages, no payment form and no horizontal
overflow were confirmed. Public screenshots are in `.data/sats-verification/`.

## Initial release

Authorized by the user and deployed through `scripts/deploy_release.sh`.

- Release: `.data/releases/20260907T145507Z`.
- Active `dist` symlink points to that release.
- Previous build: `.data/deployment-backups/pricebtc-20260907T145507Z/dist`.
- `pricebtc.service`: active, port 3466. Public site: https://priceb.tc.
- Existing private environment preserved. Shared tunnel and DNS unchanged.
- Sats Bid UI and invoice creation remain disabled. No production Sats Bid
  database or BTCPay credentials are configured; no mock data was promoted.
- Worker, backup and journal namespace unit templates installed. Worker/backup
  activation remains off pending real-payment configuration. No DB migration was
  needed because production has no Sats Bid database configured.

The pipeline completed npm clean install (0 reported vulnerabilities), TypeScript,
ESLint, 76 tests and both client/server builds. The 21 PostgreSQL integration tests
were skipped in this production pipeline; all 97 tests had passed previously in
the isolated database environment. See [pre-deployment evidence](SATS-BID-VERIFICATION.md).

Public HTTPS verification passed for Home, Studio, embed, overlay, bid,
leaderboard, history, rules, admin and a day route. Public HTML references the
new deployed assets (`index-CtM7k2nA.js`, `index-BhKdFTIC.css`), both returning 200.
Health, USD price, EUR history and disabled Sats Bid status returned 200.
Health reported market/FX live, approximately 112 MB RSS. A public SSE price
event was received. HTTP and www redirect to the canonical HTTPS URL with 308,
preserving path/query.

The service needed a few seconds to start after the release swap; two initial
loopback probes failed before the third succeeded. No rollback was required.

Before enabling Sats Bid, follow [the BTCPay and operations gates](SATS-BID.md).
For a rollback while no real invoices exist, stop the API briefly, move the
current `dist` symlink aside, restore the backed-up `dist`, then start the API.
Keep the tunnel and private environment intact.
