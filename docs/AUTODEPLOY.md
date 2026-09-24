# Automatic production deployment

Pushes to `diegodella1/pricebtc`, branch `main`, trigger a signed GitHub webhook at
`https://priceb.tc/hooks/github-deploy`. No Codex session is required. Other branches,
deleted refs, unrelated repositories and invalid signatures cannot trigger a build.

## Components

- `pricebtc-deploy.service` runs a standalone Node receiver on loopback port 3472.
  Its root-owned installed code lives in `/usr/local/lib/pricebtc-deploy`.
- `/etc/pricebtc/deploy.env` stores the webhook secret with mode 0600. Never commit
  or print it. GitHub signs the raw payload with HMAC-SHA256.
- `/var/lib/pricebtc-deploy/state.json` stores pending/running deliveries and the last
  100 outcomes. Individual delivery logs record requested/target SHAs and release paths.
  Keep this directory across reinstalls. Logs are private to the service user.
- The existing Cloudflare tunnel sends only the exact webhook path to the receiver.
  Other routes continue to use the application on port 3466.

Delivery acknowledgement means **queued**, not deployed. Durable state is written
before HTTP 202. Repeated delivery IDs are ignored (last 1,000 retained). While one
deployment runs, new pushes replace the pending job. The runner fetches and deploys
the latest `origin/main`, so delayed events never intentionally downgrade production.

## Deployment guarantees

GitHub Actions `CI / Validate` runs on pull requests and pushes to `main`: clean
dependency installation, typecheck, lint, all tests (including PostgreSQL integration
and schema-upgrade tests), deployment tests and build. The same public-page browser smoke used by deployment
also runs in CI after the build, using local market fixtures and blocking external
browser requests. It verifies the home hero, sponsor strip below the chart at
1440/768/360px without horizontal overflow, the 21 sponsor positions, and waitlist
validation at `/sponsors#waitlist`. Live market checks still run on the Pi.
Require `Validate` in the
branch protection for `main`. The installed runner independently waits up to 20
minutes for a successful `ci.yml` push/manual run on the exact target SHA before
updating the checkout or building. Failed, cancelled, missing or inaccessible CI
results cannot publish. The runner's GitHub CLI login needs Actions read and commit
statuses write access; credentials are never passed to GitHub Actions from this host.

The `pricebtc/production` commit status distinguishes waiting/building, failed or
migration-blocked, and published/verified releases. Status reporting failures are
logged but never prevent rollback. A GitHub Actions monitor checks the latest main
status and public market health approximately every 30 minutes; missing/failed
statuses or pending statuses older than 30 minutes fail the monitor run. Configure
GitHub Actions notification preferences to receive these failures. Scheduled Actions
can be delayed; this is a backup check, not a real-time paging service. The monitor
does not independently verify the live SHA; publication status is written only after
the release's local/public asset checks pass.

The runner requires a clean `main` checkout and a fast-forward update. It does not
discard local changes or fix failing code. Manual and automatic releases share an
exclusive lock. Do not edit the checkout during an automatic build.

Each release builds from a Git archive in `.data/builds/`, with isolated dependencies.
Typecheck, lint, application tests, deployment tests and the build must all pass.
The root checkout's dependencies and running release remain intact on build failure.
Vitest excludes build workspaces and the standalone Node deployment tests.
Before cutover, the compiled candidate starts on a temporary loopback port with
isolated runtime data and no database. The same release checks must pass there;
startup failures leave production untouched. Chromium also verifies the rendered
Terms, Privacy, Status, Pricing, Sponsor placeholder, API landing and Studio pages,
including API currency tabs and the Studio branding teaser.

Activation preserves the previous `dist` symlink, records a recovery transaction,
switches releases and restarts the app (plus its worker if already running). Local
and public checks verify live market data, acceptable FX state, home and Studio
entry assets, every JavaScript/CSS chunk, public page routes, rate-limit response
headers, and price/history/embed responses. Rollback uses the legacy health/asset
contract so an older working release can still be restored. Only then are
`REVISION` and `VERIFIED` considered published. A failed check restores and verifies
the previous release. An interrupted transaction is recovered before the next build.
Failures remain logged; there is no automatic code repair or endless retry loop.

Automatic deployment refuses changes to migrations or the database migration runner
relative to the published revision. Review and deploy those manually. The automatic
path never executes migrations. Application unit changes likewise require explicit
installation; deployment does not silently replace systemd configuration.

## Setup and updates

Prerequisites: existing functioning production release as a `dist` symlink, the app
systemd units and environment already installed, Node 22+, Git, npm, RTK, and the
existing operator's noninteractive sudo access. GitHub CLI must have repository
webhook management permission for registration.

The installed runner also needs GitHub CLI authentication with Actions read and
commit statuses write access. After adding CI, wait for a passing main run before
bootstrapping a manual release. Schema changes remain an explicit manual operation;
CI validates them against an isolated PostgreSQL database, never production.

1. Commit the tested implementation, including local fixes needed for a clean
   validation run. For initial activation, install and register first, then push
   the implementation to exercise a real delivery.
2. Run `rtk bash scripts/install-autodeploy.sh`. For a legacy release without
   `dist/REVISION`, pass its known deployed commit as the first argument to record
   the migration baseline. Without a known baseline, bootstrap with a manual deploy.
   Installation adds the receiver and units,
   generates a secret if absent, backs up and validates the tunnel configuration,
   and restarts the receiver and shared tunnel. Existing ingress rules are preserved.
3. Validate the receiver and HTTPS routing, then run
   `rtk node scripts/register-deploy-webhook.mjs`. Registration is idempotent.
4. Push to `main`; inspect the delivery, deployment log, active release SHA and health.

After receiver or runner changes, rerun the installation script when the queue is
idle. The receiver is intentionally independent of the application release; a normal
application deploy does not replace or restart it. Its queue survives service restarts.

## Operations

```bash
rtk systemctl status pricebtc-deploy.service
rtk journalctl -u pricebtc-deploy.service -n 50 --no-pager
rtk cat /var/lib/pricebtc-deploy/state.json
rtk cat dist/REVISION
rtk curl https://priceb.tc/healthz
rtk npm run test:deployment
```

Failed delivery logs are identified by `log` in the state history. After correcting
code, push a new commit. After an infrastructure failure, run the manual deployment
script or redeliver with a new GitHub delivery ID; an already-seen ID is ignored.
Do not automatically retry a commit that failed tests. Build and release directories
are retained for diagnosis/rollback; monitor disk usage and prune only inactive
directories after confirming the current and previous releases.

For a reviewed manual release, take and verify a backup of any configured production
database first. Run `bash scripts/deploy_release.sh` from a clean, CI-validated
checkout. This applies migrations only when production has `DATABASE_URL`; without
one it publishes the application with database/payment features disabled. After a
successful manual release, record its exact `dist/REVISION` using
`node scripts/deployment-github.mjs status SHA success 'Manual release verified'`.
On failure, record a failure status instead. Never update `REVISION` or the migration
baseline just to bypass the migration guard. Application rollback does not undo SQL.

To retry after CI infrastructure recovery, rerun CI for the same main SHA, wait for
success, then use the reviewed manual release path or a new push. A CI rerun alone
does not enqueue a deployment. Do not mark `pricebtc/production` as a required merge
check: production deployment necessarily follows the merge. Require `Validate`.

To pause new deployments, disable the webhook in GitHub first and allow the running
deployment to finish, then stop `pricebtc-deploy.service`. The app remains running.
If rollback itself fails, the transaction file remains for recovery; inspect logs
and fix the underlying service/network issue before retrying.
