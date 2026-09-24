#!/usr/bin/env bash
set -euo pipefail
export PATH="/home/diego/.local/bin:/usr/local/bin:/usr/bin:/bin"
cd /home/diego/Documents/pricebtc
requested_sha="${1:?Expected a revision}"
[[ "$requested_sha" =~ ^[a-f0-9]{40}$ ]] || exit 2
target_sha="$requested_sha"
status_script=/usr/local/lib/pricebtc-deploy/deployment-github.mjs
failure_reason="Deployment failed before build; inspect receiver log"
report() {
  node "$status_script" status "$target_sha" "$1" "$2" || echo "WARNING: Unable to publish production status to GitHub"
}
finish() {
  local code="$?"
  if [ "$code" -ne 0 ]; then report failure "$failure_reason"; fi
  exit "$code"
}
trap finish EXIT
trap 'exit 143' TERM
trap 'exit 130' INT
mkdir -p .data
exec 9>.data/deploy.lock
flock -w 1800 9
test -z "$(git status --porcelain)" || { echo "Refusing deployment: checkout has local changes"; exit 1; }
test "$(git branch --show-current)" = main
git fetch origin main
git merge-base --is-ancestor "$requested_sha" origin/main || { echo "Requested revision is no longer on main"; exit 1; }
target_sha="$(git rev-parse origin/main)"
report pending "Waiting for CI before production deployment"
failure_reason="CI failed, unavailable, or timed out; production unchanged"
node "$status_script" wait "$target_sha"
failure_reason="Checkout update failed; inspect receiver log"
git merge --ff-only origin/main
test "$(git rev-parse HEAD)" = "$target_sha"
echo "Requested=$requested_sha target=$target_sha previous=$(readlink -f dist)"
if [ ! -f .data/deployment-transaction ] && [ -f dist/VERIFIED ] && [ -f dist/REVISION ] && [ "$(cat dist/REVISION)" = "$target_sha" ]; then
  echo "Revision already deployed"
  report success "Revision already deployed and verified"
  exit 0
fi
# Schema changes require explicit review; automatic rollbacks cannot undo SQL.
if [ -f dist/REVISION ]; then previous_sha="$(cat dist/REVISION)";
elif [ -f .data/deploy-baseline ]; then previous_sha="$(cat .data/deploy-baseline)";
else echo "Missing deployed baseline; bootstrap with a manual deployment"; exit 1; fi
if ! git diff --quiet "$previous_sha" "$target_sha" -- migrations scripts/sats-db.ts src/server/sats-bid/db.ts; then
  failure_reason="Blocked: database migration requires a reviewed manual release"
  echo "Migration changes require a manual deployment"
  exit 1
fi
failure_reason="Build or release verification failed; inspect receiver log"
report pending "Building and verifying release"
PRICEBTC_AUTO_DEPLOY=true bash scripts/deploy_release.sh --lock-held
report success "Published; local and public release checks passed"
