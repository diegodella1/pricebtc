# PRICEB.TC deployment — 2026-09-21

Release: `20260921T164332Z`.

Deployed the current workspace using `scripts/deploy_release.sh`, including the
indexable `/about` and `/faq` documents and existing site changes. FAQ has ten
visible answers generated from the same content as its FAQPage JSON-LD. Home,
About, API and methodology footers link to FAQ; the sitemap includes both new
pages. Home and About identify the same Organization with the existing public
contact email. No founder, social profile or company relationship was added.

## Validation

- TypeScript and ESLint passed; client and server production builds passed.
- 92 unit/integration tests passed. 21 database integration tests were skipped
  because no test database URL was configured.
- Two FAQ browser tests passed against the preview release: desktop/mobile,
  keyboard disclosure controls, home navigation and content without JavaScript.
- Public HTTPS returned 200 for `/`, `/faq`, `/about`, `/api`, `/llms.txt`,
  `/sitemap.xml`, `/healthz` and `/api/price?currency=USD`.
- Public FAQPage JSON-LD parsed and all ten answers matched the visible HTML.
  Canonical, indexability, home footer link and sitemap entry were verified.
- Public home/About Organization identity and contact were verified.
- Public `llms.txt` matched the source file exactly. The price API and health
  endpoint reported live market data; FX was live.
- `npm audit --omit=dev` reported zero vulnerabilities. Installation reported
  four vulnerabilities in the full dependency tree (three moderate, one high).

## Release and rollback

- Active `dist` target: `.data/releases/20260921T164332Z`.
- Previous `dist` preserved at
  `.data/deployment-backups/pricebtc-20260921T164332Z/dist`.
- Restore that previous `dist` using the stop/restore/start procedure in
  `OPERATIONS.md` if rollback is needed.
- Cloudflare tunnel and DNS configuration were not changed.

The Git ignore rule covers `dist` as either a directory or a release symlink,
so deployment artifacts are not committed.
