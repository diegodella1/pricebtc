# Automatic deployment recovery — 2026-09-24

## Incident

Production remained at `334cda12797ffb914986a5b084229adf87f1b40c`, verified
2026-09-22 03:09:37 UTC. Pushes reached the receiver. Two subsequent deliveries
failed ESLint on unused `comingSoon` props; the next three were correctly blocked
because migration `005_stripe_subscriptions.sql` differed from the published revision.
The current checkout also had an unused `PlaceholderPage` import. Webhook receipt
was successful even though publication failed; there was no GitHub CI workflow.

## Recovery and prevention

- Remove unused imports/props and update the browser check for the new pricing heading.
- Add CI on PRs and main, including PostgreSQL tests and repeatable schema upgrades.
- Require successful CI for the exact target SHA before automatic deployment.
- Publish the production outcome as `pricebtc/production` on GitHub.
- Add a scheduled monitor for failed/missing/stuck publication status and public health.
- Preserve isolated builds, candidate startup checks, local/public verification,
  automatic application rollback, and manual review for database changes.

At inspection, production had neither `DATABASE_URL` nor Stripe credentials.
No production database migration is necessary for this release; payment processing
remains disabled. Migration 005 is additive (four new tables and indexes) and is
tested in an isolated schema both from scratch and over migrations 001–004 with
existing data, then rerun to confirm migration-ledger idempotency. Enabling payments
later requires its own setup and review.

See [the operations instructions](AUTODEPLOY.md) for status reporting, retries,
manual migrations and monitoring limitations.

The first hosted CI run caught an existing IDR-formatting fixture that depended on
the ICU currency metadata version. The compact/exact regression now uses a stable
USD amount; the all-currency test retains IDR coverage. Production formatting is
unchanged. The failed run was blocked by the installed runner and surfaced as a
failed production status, confirming the new CI gate on the real delivery path.

## Verification and recovery artifacts

- Recovery revision `52eb916e590b0400e7f938b322e9572fd2800f95` was published and
  verified locally and publicly. Release:
  `.data/releases/20260924T134236-52eb916e590b-1125071`.
  Automatic rollback snapshot:
  `.data/deployment-backups/pricebtc-20260924T134236-52eb916e590b-1125071/dist`.
- Local validation: typecheck, lint, 129 application tests (including PostgreSQL),
  14 deployment tests, preview build, candidate startup and browser checks passed.
- Hosted CI passed on the corrective PR and main revision
  `52eb916e590b0400e7f938b322e9572fd2800f95`:
  https://github.com/diegodella1/pricebtc/actions/runs/36007414537.
- `main` requires the GitHub Actions `Validate` check with strict up-to-date checks,
  including administrators; force pushes and deletion are disabled.
- The previous release link, receiver scripts, receiver state and runtime-data archive
  are preserved under `.data/deployment-backups/recovery-20260924/`.
  The archive was listed successfully; SHA-256:
  `c6ab3826099091a46a6a40842ec7260b904b5e579225ac45cdf4525cecebd7fa`.
- Production database and Stripe credentials were absent, so no production SQL
  migration or payment activation was performed.

Use the per-delivery logs and `dist/REVISION` / `dist/VERIFIED` for the authoritative
record of subsequent publications. The documentation follow-up exercises the normal
PR → required CI → main CI → signed webhook → verified automatic release path.
