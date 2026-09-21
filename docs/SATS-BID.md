# Sats Bid — implementation and operations

Implemented from `pricebtc-sats-bid-PRD.md`. The mock product is available locally;
production bidding stays off. No BTCPay store, node credentials or real payment
were provided, so the adapter's real-world compatibility and launch checks remain pending.
The public sponsor presentation is visible before activation: available placement,
explanation, empty ranking and “PRÓXIMAMENTE / COMING SOON” payment status. This
does not enable invoices or expose mock data. The no-database status API includes
`coming_soon: true`; public pages use it to render the pre-launch presentation.
The code is now deployed on the existing service at port 3466 with Sats Bid off;
the shared Cloudflare tunnel is unchanged. See the
[production deployment record](DEPLOYMENT-2026-09-07.md).

## Architecture and decisions

The existing React/Vite frontend and Fastify market server remain. Sats Bid is a
lazy-loaded frontend and isolated Fastify module; PostgreSQL 17 stores money and
jobs. A separate Node worker verifies payments every two seconds, schedules
reconciliation (60 seconds by default), audits provider invoices and closes UTC
rounds. Database leases coordinate multiple workers. No Redis or external
analytics account is required. Database errors in bidding do not prevent the
market feed, chart or widgets from running.

Integer sats are decimal strings over JSON and PostgreSQL `bigint` / JavaScript
`bigint` internally. Crediting locks the round and payment in one transaction,
records unique receipt evidence, updates totals and emits deduplicated domain
events. Ranking ties use the sequence when the total was reached. Fees do not
increase scores. Historical results remain mutable only through audited corrections.

The homepage adds an orange Top Spot beside the price and a cream leaderboard
below the market tools. `/bid`, `/leaderboard`, `/history`, `/day/YYYY-MM-DD`,
`/rules` and `/admin` are separate pages. Existing widget URLs and market APIs
retain their contracts. Static/FreeHosting remains a market-only edition.

Tables in `migrations/`: rounds, participant_sessions, participants, assets,
payments, provider_payment_evidence, invoice_references, idempotency_requests, webhook_inbox,
participant_totals, domain_events (outbox), blocked_domains, moderation_actions,
admin_sessions, audit_log, operational_settings, job_leases, rate_limits,
mock_invoices, client_events and verification_requests. Migrations are additive,
versioned and advisory-locked. Audit rows cannot be updated/deleted by ordinary SQL.

## Run a local mock

Requires Node 22+, npm, Docker Compose and a free PostgreSQL port 55432. Do not
point development/seed at a production database. Setup creates a private file
exclusively and refuses to overwrite an existing one.

```bash
rtk npm ci
rtk node scripts/sats-setup.mjs
set -a
source .env.sats.local
set +a
rtk npm run db:up
rtk npm run db:migrate
rtk npm run db:seed
rtk npm run dev:sats
```

Visit `http://127.0.0.1:5173`. API uses port 3478; this avoids the existing service
on 3466. Keep origin/host consistent: `localhost` and `127.0.0.1` are different
origins for CSRF. On this machine another local preview may occupy 3478; stop that
preview or set another free `PORT` before starting. Vite's API proxy follows PORT.

The seed adds eight clearly labeled fictitious projects to today and the previous
two UTC days. Simulated invoices move through the normal durable webhook and
verification flow. The seed itself invokes verification synchronously to finish
deterministically. No wallet or real sats are used. Open `/admin`; local email is
`operator@example.com`. Read `SATS_LOCAL_ADMIN_PASSWORD` privately from
`.env.sats.local`. That generated value is only a development login.

In `/bid`, create a profile, accept the rules, create an invoice and click
**Simulate payment**. Use a second browser profile to outbid the first; refresh
the first to recover identity and add more sats. A mock invoice deliberately has
no payable BOLT11. Real BOLT11 invoices render a local QR, copy and wallet link.

For a built preview, without replacing active `dist`:

```bash
rtk npm run build:preview
# In the same exported environment; separate terminals for API and worker:
PUBLIC_SITE_URL=http://127.0.0.1:3478 PRICEBTC_FRONTEND_DIR="$PWD/.data/sats-preview/client" rtk node .data/sats-preview/server/index.js
rtk node .data/sats-preview/server/sats-bid/worker-entry.js
```

## API and configuration

The PRD's logical API routes live under `/api/sats-bid` to preserve the existing
`/api/history` chart contract. Same-origin cookies and CSRF protect mutations. Public reads are limited to 240/minute/IP per API process with a bounded, rotating in-memory map; invoice, upload and admin quotas remain durable in PostgreSQL.

| Paths after `/api/sats-bid` | Purpose |
| --- | --- |
| `GET /round/current`, `/leaderboard`, `/history`, `/history/:date` | Public UTC round, rankings and paginated history |
| `GET /participants/me`, `POST /participants`, `PATCH /participants/me` | Private browser identity and current-round profile |
| `POST /assets/logo`, `GET /assets/:id` | Validated raster upload and normalized public logo |
| `POST /bids`, `GET /payments/:id` | Idempotent invoice creation and owner/admin status |
| `POST /events` | Allowlisted first-party interaction metrics |
| `POST /admin/login`, `POST /admin/logout`, `/admin/participants`, `/admin/payments`, `/admin/incidents` | Operator authentication, inspection and moderation |
| `/admin/blocked-domains`, `/admin/settings`, `/admin/analytics`, `/admin/health`, `/admin/reconcile` | Blocking, pause, metrics, health and period audit |
| `POST /admin/payments/:id/reconcile`, `.../resolve` | Verified recheck or reviewed exclusion with reason |
| `POST /dev/payments/:id/simulate` | Mock-only scenarios; inaccessible with a real provider/production |

BTCPay sends raw signed events to `POST /api/webhooks/btcpay`. The server stores
the inbox before acknowledging. Webhooks are notifications; the worker fetches
authenticated provider evidence before awarding any credit.

All variables and defaults are in `.env.example`. Main groups:

- `DATABASE_URL`, `SATS_DB_PASSWORD`, `SATS_DB_PORT`, `PRICEBTC_DATA_DIR`: dedicated
  PostgreSQL and normalized logos. Compose binds only loopback and uses a named volume.
- `SATS_BID_ENABLED`: public product UI; `BIDS_ENABLED` plus admin pause: new invoices.
  These do not stop receipt processing. `SATS_WORKER_ENABLED` controls installation
  of worker/backup units by the release script, not worker credit eligibility.
- `PAYMENT_PROVIDER`, `MOCK_PAYMENTS_ENABLED`, `MOCK_WEBHOOK_SECRET`: explicit mock
  development only. Production config rejects mock; there is no real-to-mock fallback.
- `BTCPAY_URL`, `BTCPAY_API_KEY`, `BTCPAY_STORE_ID`, `BTCPAY_WEBHOOK_SECRET`,
  `BTCPAY_NETWORK`: exact store and network. Do not change store/network with invoices pending.
- `MINIMUM_BID_SATS=1000`, `MAXIMUM_BID_SATS=1000000`, `INVOICE_TTL_SECONDS=600`,
  `BID_CUTOFF_SECONDS=120`, `INVOICE_END_BUFFER_SECONDS=60`,
  `ROUND_CLOSE_GRACE_SECONDS=300`: UTC payment window. Browser clocks cannot award credit.
- `ADMIN_EMAIL`, `ADMIN_PASSWORD_HASH` (Argon2id), independent
  `ADMIN_SESSION_SECRET`, `PUBLIC_SITE_URL`, `SUPPORT_CONTACT_URL`, `RULES_VERSION`,
  `MODERATION_MODE`: auth, operator identity, public policies and approval behavior.
- `RECONCILIATION_INTERVAL_SECONDS=60`, `PROVIDER_HTTP_TIMEOUT_SECONDS=10`: bounded
  HTTP requests, exponential retry with jitter and provider Retry-After.
- Optional `ANALYTICS_EXPORT_URL` and `ANALYTICS_EXPORT_TOKEN`: HTTPS JSON event
  receiver. Delivery retries from the DB outbox with `event_id` and an
  `Idempotency-Key` header. Receiver MUST deduplicate; delivery is at least once.
  Only domain events are exported. Client metrics remain first-party. Export is
  off with an empty URL and never runs in the credit transaction.

Admin metrics are computed from local accounting/events for 1, 7 or 30 UTC days,
including the proportion of participants who paid again after being outbid by
another payment. Moderation, reset and correction do not count as commercial outbids.

## BTCPay setup and real-payment gate

1. Choose and record the operator, BTCPay version, Lightning backend, custody
   model and network. Configure a dedicated store over HTTPS and sufficient
   incoming capacity for the maximum invoice. API credentials are not a wallet.
2. Enable Lightning only. Create a runtime API key scoped to this store's invoice
   creation/read/payment-method queries. Confirm exact permission names against
   the installed version. No spending, withdrawals, node admin, invoice editing
   or manual-settlement permission belongs in the web runtime.
3. Configure a separate webhook with redelivery to
   `https://priceb.tc/api/webhooks/btcpay`; set an independent random secret.
   Use the private `/etc/pricebtc/pricebtc.env`, mode 0600. Never supply wallet
   seeds, node spending macaroons or private keys to the app or repository.
4. Set `APP_ENV=production`, `PAYMENT_PROVIDER=btcpay`,
   `MOCK_PAYMENTS_ENABLED=false`, production HTTPS origin, store, credentials,
   Argon2id admin hash and contact URL. Initially keep both feature flags false.
5. Migrate, install compatible API/worker and verify health while creation is paused.
   Capture sanitized responses from the actual version and extend the contract
   fixtures. Current fixtures are synthetic examples, not a real store recording.
6. In an isolated test environment, confirm invoice creation returns a BOLT11
   with the exact sats, network and expiry; confirm its payment-method receipt
   IDs, value, state and timestamps. The lightweight decoder validates fields
   and structure, not the cryptographic signature; the payer's wallet verifies
   the BOLT11 signature. Server credit relies on authenticated provider receipt evidence.
7. With the operator's authorization, receive one low-value real Lightning payment.
   Record invoice/bid/receipt IDs, store/version, expected/received sats, timestamps,
   one credit and one event. Redeliver the webhook and show no additional credit.
   Repeat with webhook omitted to prove scheduler recovery within two minutes.
8. Verify actual wallet receipt, liquidity monitoring, backup/restore, cutoff and
   pause. Only then enable public bidding. No real payment was executed here.

Adapter references: [Greenfield API](https://docs.btcpayserver.org/API/Greenfield/v1/),
[official Node example](https://docs.btcpayserver.org/Development/GreenFieldExample-NodeJS/),
[invoice states](https://docs.btcpayserver.org/Invoices/) and
[Lightning setup](https://docs.btcpayserver.org/LightningNetwork/).

## Incidents, accounting and recovery

| Incident | Operator action |
| --- | --- |
| Provider/node down or no incoming capacity | Pause new invoices in admin; restore reception; leave worker/webhook/payment lookup running. Price/widgets remain independent. |
| Webhook missing | Check secret and raw delivery; use payment Recheck or audit the period. Never manually add sats. |
| DB/app outage | Restore DB/app, run migrations, restart worker, audit outage interval in admin. Unverified historical rounds stay provisional. |
| Creation uncertain | Recheck searches provider metadata by bid UUID. Exactly one match can associate automatically. Multiple matches remain visible references; do not create another invoice blindly. |
| Orphan/duplicate references | Inspect provider invoices and original bid/evidence. Keep ambiguous cases open and use support; the UI deliberately cannot force an arbitrary association or mint credit. |
| Partial, excess, late, manual-settled or wrong-method payment | Review recorded evidence; requery provider; resolve without credit with a reason when ineligible. Any reimbursement is a separate operator process, never a ranking mutation. |
| Dangerous content | Hide/reject and optionally block the normalized domain/subdomains. Historical public content disappears too; accounting and audit remain. Unblocking does not automatically restore hidden entries. |
| Compromised credential | Pause, revoke/rotate the affected credential, inspect invoices/events, verify again before resuming. Keep independent secrets. |
| Incorrect projection | Daily reconstruction compares credited ledger and totals; correction is audited and revises closed results. No automatic deletion of payments. |

Automatic API failures retry up to ten attempts; an operator recheck resets the
retry budget. Audit scans seven days daily in persisted pages; an admin audit can
request a period up to 31 days. Larger outages require successive intervals.
Closed results can receive valid late-discovered evidence with a revision.
An explicit operator exclusion stays excluded on recheck; challenge that decision
through support and an audited operational investigation, not an automatic override.

Admin Health and structured stderr codes cover stale reconciliation (>5 minutes),
payments requiring attention, reference anomalies and closure delayed >15 minutes.
Monitor `pricebtc-worker.service` and `GET /api/sats-bid/admin/health` using operator
authentication. There is no external paging destination configured; the operator
must wire journal/health alerts into their monitoring before launch.

The templates use journal namespace `pricebtc` (30-day/64-MB retention), API memory
limit 512 MB, worker 256 MB, PostgreSQL pool 5 connections/process and Compose
shared buffers 64 MB. Docker warns that this host's kernel lacks memory cgroup
support; its 512-MB container limit is therefore not enforced. Budget memory and
monitor the Raspberry Pi before opening traffic. Host contention affects latency.

```bash
rtk journalctl --namespace=pricebtc -u pricebtc-worker.service -n 100 --no-pager
rtk journalctl --namespace=pricebtc -u pricebtc.service -n 100 --no-pager
```

Define an operator-owned hot-wallet balance ceiling and manual excess-funds
procedure that preserves incoming liquidity. No automated withdrawal/swap is implemented.

## Backup, restore, retention and rollout

`pricebtc-backup.timer` schedules daily `scripts/backup-sats.sh`: PostgreSQL custom
dump plus normalized logos. It uses the dedicated container's PG17 client and
creates a completion manifest only after success. Retention keeps seven daily
and four weekly points; incomplete/unrecognized directories are never pruned.
Keep encrypted off-host copies with access limited to the operator; a backup on
the same disk is not disaster recovery. Database name/user in the script match
the dedicated Compose defaults (`pricebtc`); adapt explicitly for another setup.

Restore into a NEW isolated database first:

```bash
rtk docker exec pricebtc-sats-sats-db-1 createdb -U pricebtc pricebtc_restore_check
rtk docker exec -i pricebtc-sats-sats-db-1 pg_restore -U pricebtc -d pricebtc_restore_check --no-owner < /path/to/backup/database.dump
```

Compare migrations, payment counts/sums, receipt IDs, rounds and audit; unpack
logos into a separate directory. Point a paused isolated app at it and reconcile
provider evidence before any cutover. Never restore an old dump over active real
payments without a documented incident procedure. Back up BTCPay/node separately.

Processed webhook inbox and technical logs retain 30 days; client events 90 days.
Expired browser identity tokens are pseudonymized while historical relations are
kept; expired admin sessions/rate buckets are removed. Payments, minimum evidence,
domain events and audit have no automatic deletion in this MVP. Public logos are
normalized out of process (2-MiB upload, 4-MP decoded limit, 512 px output, metadata
removed); source uploads are not stored. No raw client IP is kept in analytics.

`scripts/deploy_release.sh` validates and builds to `.data/sats-preview`, preserves
the private environment, applies additive migrations, saves the previous `dist`
and swaps a staged release with rollback on failed health checks. It does not
alter Cloudflare. The code and unit templates were deployed on 2026-09-07 with
Sats Bid disabled; worker/backup activation and real-payment setup remain pending.
Review the concrete private environment and real-payment gate before activation.

For rollback after receiving payments: pause new invoices and set public UI off,
but retain the compatible webhook/API/worker and schema. Do not roll back to a
pre-bidding executable or drop accounting tables. Before any real payments,
restoring the previous `dist` with a brief service stop/start is sufficient.

## Verification

```bash
rtk npm run typecheck
rtk npm run lint
# Use a separate local database. Tests create/drop only their random schema.
SATS_TEST_DATABASE_URL="$DATABASE_URL" rtk npm test
rtk npm run build:preview
# Against the built mock preview API/worker, with PUBLIC_SITE_URL on port 3478:
SATS_E2E=true E2E_PORT=3478 SATS_E2E_ADMIN_PASSWORD="$SATS_LOCAL_ADMIN_PASSWORD" rtk npm run e2e -- tests/e2e/sats-bid.spec.ts
SATS_MEASURE_URL=http://127.0.0.1:3478 rtk node scripts/measure-sats.mjs
```

Tests without `SATS_TEST_DATABASE_URL` skip PostgreSQL cases; they do not establish
accounting acceptance. Browser tests without `SATS_E2E=true` skip the mock flow.
The actual executed results and remaining real-payment gates are recorded in
[SATS-BID-VERIFICATION.md](SATS-BID-VERIFICATION.md).
