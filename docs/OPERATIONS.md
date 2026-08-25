# Operations runbook

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

1. Stop app: `rtk sudo systemctl disable --now pricebtc.service`.
2. Restore newest `/etc/cloudflared/config.yml.backup-*` over `/etc/cloudflared/config.yml`.
3. Validate ingress: `rtk cloudflared --config /etc/cloudflared/config.yml tunnel ingress validate`.
4. Restart tunnel: `rtk sudo systemctl restart cloudflared.service`.

DNS records can remain during a short rollback; Cloudflare will return origin failure until service or ingress is restored. Removing tunnel DNS records is only needed for a permanent shutdown.
