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

The runner requires a clean `main` checkout and a fast-forward update. It does not
discard local changes or fix failing code. Manual and automatic releases share an
exclusive lock. Do not edit the checkout during an automatic build.

Each release builds from a Git archive in `.data/builds/`, with isolated dependencies.
Typecheck, lint, application tests, deployment tests and the build must all pass.
The root checkout's dependencies and running release remain intact on build failure.
Vitest excludes build workspaces and the standalone Node deployment tests.

Activation preserves the previous `dist` symlink, records a recovery transaction,
switches releases and restarts the app (plus its worker if already running). Local
and public checks verify live market data, acceptable FX state, home and Studio
entry assets, exact asset content, and price/history/embed responses. Only then are
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

To pause new deployments, disable the webhook in GitHub first and allow the running
deployment to finish, then stop `pricebtc-deploy.service`. The app remains running.
If rollback itself fails, the transaction file remains for recovery; inspect logs
and fix the underlying service/network issue before retrying.
