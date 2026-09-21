# Verification — 2026-09-07

This records verification before deployment. The code was subsequently deployed
with Sats Bid disabled: [production deployment record](DEPLOYMENT-2026-09-07.md).

Implementation is local and reviewable. The original market service remains on
3466; the mock preview uses 3478 and a dedicated PostgreSQL 17 container on 55433.
No production database, BTCPay store, wallet, tunnel or DNS was changed for Sats Bid.
No real Lightning payment was made. See [setup and operations](SATS-BID.md).

## Automated checks

| Check | Executed result |
| --- | --- |
| TypeScript | `npm run typecheck` passed |
| ESLint | `npm run lint` passed |
| Unit + PostgreSQL integration | **97 passed**, 17 files, no skipped database cases; `SATS_TEST_DATABASE_URL` configured |
| Built preview | `npm run build:preview` passed, client + API + separate worker |
| Static build/smoke | Passed: prerender/SEO, live price/chart, Studio, exported URL and transparent overlay |
| Existing product browser regressions | **11 passed**: widgets/layouts/fonts/scales, currencies, Studio drafts, iframe/CSP, overlay, SEO and responsive geometry |
| Sats Bid browser flow | **2 passed** on final build: A/B/A + identity + responsive ranking; admin hide/unhide across public pages + logout revocation |
| Dependency audit | `npm audit --omit=dev`: **0 vulnerabilities** |
| Shell syntax | `bash -n scripts/deploy_release.sh scripts/backup-sats.sh` passed |
| Local bootstrap | `scripts/sats-setup.mjs` generated an isolated private environment, mode **0600** |
| Backup/restore | PostgreSQL custom dump restored successfully into a new `pricebtc_restore_final` database |
| Active original release | `/healthz`, original JS and original CSS on 3466 returned **200** after preview builds |
| Final worker health | **ok**; no pending attention, delayed rounds or invoice-reference anomalies |

Accounting tests cover exact integer money, overflow, URL validation, HMAC over
raw bytes, duplicate/concurrent credits, A/B/A and after-outbid metrics, totals and
tie sequences, invoice uncertainty, expiry, UTC boundaries, late discovery and
corrected historical rounds, provisional closure during provider failures,
ownership/CSRF, moderation and logout. Additional tests verify raster isolation,
backup rotation, retryable analytics delivery with stable event IDs, public read
limits without DB writes and idle database disconnect handling.

BTCPay contract fixtures are synthetic examples based on the official API/model
shapes. They exercise method destination, receipt value/status/time, store/network,
manual-settlement rejection and unknown states. They are **not sanitized captures
from an installed operator store** and do not prove a real payment succeeded.

The browser suite exposed a real empty-JSON request bug in logout: the shared
client sent a JSON content type without a body. The helper now sends it only when
a body exists; the UI reports logout failures. The test waits for the signed-out
screen and then verifies that the operator API returns 401.

Initial browser execution under heavy host load hit navigation timeouts. The
rerun used `--timeout=90000`. The existing 3,600px homepage height budget is tested
with Sats Bid disabled; the enabled product has separate 360/768/1440px geometry
coverage because the new ranking intentionally adds content and height.

## Performance and recovery

Environment: this shared Raspberry Pi host, Node 22.22, PostgreSQL 17 Docker,
loopback HTTP, one API and one verification worker. No isolated production load
environment or end-user network latency is represented here.

| Measurement | Dataset / result |
| --- | --- |
| Initial ranking, multi-query read + durable public quota | 50 concurrent readers, 10 visible participants, p95 **1,392 ms**, 0 errors |
| Single-snapshot SQL query | 50 readers, 11 participants, p95 **820 ms**, 0 errors |
| In-memory public quota under contention | 50 readers, 11 participants, p95 **597 ms**; another saturated run **1,719 ms**, 0 errors |
| Final build, lower host contention | **50 readers, 13 visible participants, p95 261.5 ms**, max 262.1 ms, **0 errors**, 2026-09-07 13:54:19 UTC |
| Lost webhook | No webhook delivered; running worker credited simulated invoice in **61,707 ms** |
| Main frontend entry gzip | Baseline ~72.0 KB; Sats Bid ~72.9 KB using the same local gzip method; bidding/QR/admin chunks load separately |

The healthy-run targets (<500ms leaderboard p95, <2-minute missed-webhook
recovery) were observed locally. Host saturation still causes regressions; it is
not evidence of a production capacity guarantee. Recheck on the intended staging
infrastructure and monitor RAM, swap and PostgreSQL before launch. Kernel memory
cgroup support is absent on this host, so Docker's configured memory ceiling is
not enforced. The visible-after-credit browser assertions allow 20 seconds for
test-host variability; a separate precise end-user <10-second latency measurement
has not been collected. The homepage polls every five seconds.

The restored snapshot contained 28 payment rows, 248,000 requested sats and 27
credited payments; one simulated pending payment was captured before recovery.
Restore preserves pending work as well as credited accounting. Integration tests
use random temporary schemas and drop only their own schemas afterward.

## Artifacts and cleanup

Local evidence logs and screenshots are kept in `.data/sats-verification/`
(Git-ignored). The generated FreeHosting export was removed after its successful
smoke test; `npm run build:static` recreates it. Preview server builds clean old
generated chunks. Existing source changes, runtime data, private environments,
backups and the PRD were preserved.

An initial ordinary build briefly replaced files in the active `dist` directory.
The original client/server artifacts were reconstructed and restored, and their
original asset URLs checked successfully. Subsequent builds use the isolated
preview path. No service restart or intentional production rollout followed.

## Still required for real Lightning

- Operator-owned HTTPS BTCPay instance, installed-version contract captures,
  dedicated store and chosen Lightning backend/network/custody model.
- Verified limited API permissions, independent webhook/auth secrets, production
  admin identity, support contact and sufficient incoming capacity.
- Authorized low-value real payment: receipt in the wallet, exact one-time credit,
  duplicate webhook and missing-webhook recovery evidence.
- Operational owners, paging destination, off-host encrypted backup/restore,
  node backup, hot-wallet ceiling and manual funds procedure.
- Staging capacity verification, precise visible-update timing and reviewed
  production environment before setting the feature flags on.

Current status: **mock implementation completed; Lightning activation pending**.
Deployment templates and staged build tooling are implemented but not installed
or executed against the production service for this feature.
