# Operations runbook

## Production release — 2026-09-21

Latest release: `20260921T164332Z`, including indexable About and FAQ documents,
Organization and FAQPage structured data, and current site changes. See the
[deployment checks and rollback location](DEPLOYMENT-2026-09-21.md).

## Production release — 2026-09-07

Latest release: `20260907T153658Z`. The sponsor presentation is visible, with
payments labeled “Próximamente”; payment processing remains disabled. The
no-database API advertises `coming_soon: true` so public pages do not request
unavailable payment endpoints. See the deployment record below for rollback.

The initial release `20260907T145507Z` included the inactive Sats Bid module;
the follow-up above makes its presentation public. BTCPay and its production
database are not configured yet. See
[deployment record and rollback location](DEPLOYMENT-2026-09-07.md).

Sats Bid development and its separate worker/database are documented in
[SATS-BID.md](SATS-BID.md). The deployment record below describes the original
market release, not deployment of the Sats Bid changes.

## Public deployment verified — 2026-09-06

The current working tree was built and deployed to `pricebtc.service`. Typecheck,
lint, 45 unit/integration tests, and 11 browser tests passed (browser tests ran
before the final HTTPS redirect change, which has dedicated API and public checks). The service is active
and enabled at boot. Local routes, price/history APIs, SSE price events, and the
`www` redirect were verified; market and FX reported `live`.

Both existing tunnel ingress rules were validated. The shared tunnel configuration
was unchanged and cloudflared did not need a restart.

Pre-deployment artifacts and configuration are preserved in
`.data/deployment-backups/pricebtc-predeploy-mXUJFjZP/` (ignored by Git). To undo this
application deployment, stop `pricebtc.service`, move the new `dist` aside, restore
the backup's `dist` directory, and start the service only if the previous build is
wanted. Before this deployment the service was stopped but enabled. Do not restore
an old shared tunnel configuration wholesale: it may discard changes for other sites.

Public cutover is complete. Zone `29f8eac71f597d06ff0debdb2d36c33c` is active;
both `@` and `www` are proxied CNAMEs to the tunnel. The previous apex A record
pointed to FreeHosting (`195.201.179.80`). Previous web records are saved as
`dns-before-cutover.json` in the backup directory above. MX and TXT records were
preserved. Restore only those two web records if DNS rollback is needed.

Public HTTPS was verified with certificate validation enabled: Home, Studio,
embed, overlay, health JSON, price/history APIs, and SSE price events work.
HTTP and `www` requests redirect to the canonical HTTPS apex with status 308,
preserving path and query. The application enforces this using the original
protocol forwarded by cloudflared; local loopback HTTP health checks remain available.
The API token can edit DNS but cannot change Cloudflare's `Always Use HTTPS`
zone setting, so that setting was not modified. The token is loaded from the
Git-ignored `.env` for administrative operations only.

## Runtime

- App: `pricebtc.service`, user `diego`, `127.0.0.1:3466`.
- Runtime data: `/var/lib/pricebtc/fx-rates.json`.
- Public edge: existing Cloudflare Tunnel `55ecc138-2b04-4678-b3cf-5460da1aa1ff`.
- Hostnames: `priceb.tc` and `www.priceb.tc`.
- DNS target: `55ecc138-2b04-4678-b3cf-5460da1aa1ff.cfargotunnel.com` for proxied CNAME records `@` and `www`.
- Caddy is not in this request path and must remain unchanged.

## Cloudflare DNS

`priceb.tc` must first exist as a full zone in the Cloudflare account. Its assigned nameservers must match the registrar delegation: `aragorn.ns.cloudflare.com` and `reza.ns.cloudflare.com`. Both nameservers must answer authoritatively before public smoke tests can pass.

Do not run `cloudflared tunnel route dns` with the current origin certificate. That certificate is scoped to `diegodella.ar` and can interpret `priceb.tc` as a relative hostname. Create the apex and `www` proxied CNAME records from the `priceb.tc` zone in the Cloudflare dashboard or with a token scoped to that zone.

## Verify

```bash
rtk systemctl is-active pricebtc.service
rtk journalctl -u pricebtc.service -n 100 --no-pager
rtk curl http://127.0.0.1:3466/healthz
rtk cloudflared --config /etc/cloudflared/config.yml tunnel ingress validate
rtk dig @1.1.1.1 +short NS priceb.tc
rtk dig @reza.ns.cloudflare.com priceb.tc SOA +norecurse
rtk dig @1.1.1.1 +short A priceb.tc
rtk bash scripts/smoke-production.sh
```

Healthy means `market.state=live`, FX is `live` or `stale`, price age is under 15 seconds, and public HTTPS returns 200. A disconnected WebSocket enters `degraded`, retries with exponential backoff, and polls Coinbase REST every 15 seconds.

## Logs and capacity

```bash
rtk journalctl -u pricebtc.service -f
rtk curl http://127.0.0.1:3466/healthz
```

Initial limits: 500 SSE clients globally, five per client IP, 512 MB service memory, and 8,192 file descriptors. API rate limit is 120 requests/minute/IP; stream openings are limited to 20/minute/IP.

## Rollback

Restore the previous application release from `.data/deployment-backups/` with a
brief stop/start of `pricebtc.service`. Keep the existing shared tunnel and DNS.
Do not restore an old tunnel configuration wholesale: it serves other projects.

Once real Sats Bid invoices exist, first pause creation and disable its public UI
if needed. Keep a compatible API (webhooks/payment lookup), worker, private
configuration, database and accounting history running. See the Sats Bid runbook;
rolling back to a pre-bidding server would abandon outstanding payments.
