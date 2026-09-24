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
