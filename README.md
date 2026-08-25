# PRICEB.TC

Live Bitcoin price, fiat conversion, website embeds, and OBS/Streamlabs overlays. Self-hosted on a Raspberry Pi behind Cloudflare Tunnel.

## Product

- Coinbase BTC/USD ticker over one upstream WebSocket.
- Server-Sent Events fan-out at most once per second.
- Indicative fiat conversion from ExchangeRate-API with an atomic disk cache.
- Coinbase line history for 1h, 24h, and 7d.
- Six URL-configured embed/overlay layouts; no accounts or database.
- English UI with a permanent `PRICEB.TC` signature.

## Develop

Requirements: Node.js 22+, npm 10+, and Chromium for browser tests.

```bash
rtk npm install
rtk npm run dev
```

Frontend runs on `http://127.0.0.1:5173`; Vite proxies APIs to Fastify on port `3466`.

Quality gate:

```bash
rtk npm run check
rtk npm run e2e
```

## Public interfaces

- `GET /api/stream?currency=USD` — SSE events named `price` and `status`.
- `GET /api/price?currency=USD` — current converted snapshot.
- `GET /api/history?currency=USD&range=24h` — converted line points.
- `GET /api/currencies` — supported metadata, never raw exchange rates.
- `GET /healthz` — market, FX, stream, and process health.
- `/embed?...` and `/overlay?...` — stable versioned renderers.

Widget parameters: `v`, `currency`, `layout`, `theme`, `accent`, `text`, `surface`, `font`, `scale`, `background`, `change`, `chart`, `range`, and `motion`. Values are allowlisted; arbitrary CSS/HTML is never accepted.

## Deploy

Build, test, install the hardened systemd unit, and start the local service:

```bash
rtk bash scripts/deploy_release.sh
```

Configure and validate the existing named Cloudflare Tunnel ingress:

```bash
rtk bash scripts/configure_cloudflared.sh
```

In Cloudflare, onboard `priceb.tc` as a full zone and confirm its assigned nameservers are `aragorn.ns.cloudflare.com` and `reza.ns.cloudflare.com`. Then add these proxied records:

| Type | Name | Target |
| --- | --- | --- |
| CNAME | `@` | `55ecc138-2b04-4678-b3cf-5460da1aa1ff.cfargotunnel.com` |
| CNAME | `www` | `55ecc138-2b04-4678-b3cf-5460da1aa1ff.cfargotunnel.com` |

The script deliberately does not create DNS records: this Raspberry Pi's existing `cert.pem` is scoped to another zone, so using `cloudflared tunnel route dns` here could create a relative record in that zone.

Run public smoke checks after DNS resolves:

```bash
rtk bash scripts/smoke-production.sh
```

See [operations runbook](docs/OPERATIONS.md) for verification and rollback.

## Data notice

BTC/USD is the latest Coinbase Exchange trade. Other currencies use indicative daily FX conversion and may differ from locally available rates. Data is informational, not financial advice. FX attribution: [ExchangeRate-API](https://www.exchangerate-api.com).
