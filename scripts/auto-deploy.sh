#!/usr/bin/env bash
set -euo pipefail
export PATH="/home/diego/.local/bin:/usr/local/bin:/usr/bin:/bin"
cd /home/diego/Documents/pricebtc
requested_sha="${1:?Expected a revision}"
[[ "$requested_sha" =~ ^[a-f0-9]{40}$ ]] || exit 2
mkdir -p .data
exec 9>.data/deploy.lock
flock -w 1800 9
test -z "$(git status --porcelain)" || { echo "Refusing deployment: checkout has local changes"; exit 1; }
test "$(git branch --show-current)" = main
git fetch origin main
git merge-base --is-ancestor "$requested_sha" origin/main || { echo "Requested revision is no longer on main"; exit 1; }
target_sha="$(git rev-parse origin/main)"
git merge --ff-only origin/main
test "$(git rev-parse HEAD)" = "$target_sha"
echo "Requested=$requested_sha target=$target_sha previous=$(readlink -f dist)"
if [ ! -f .data/deployment-transaction ] && [ -f dist/VERIFIED ] && [ -f dist/REVISION ] && [ "$(cat dist/REVISION)" = "$target_sha" ]; then
  echo "Revision already deployed"
  exit 0
fi
# Schema changes require explicit review; automatic rollbacks cannot undo SQL.
if [ -f dist/REVISION ]; then previous_sha="$(cat dist/REVISION)";
elif [ -f .data/deploy-baseline ]; then previous_sha="$(cat .data/deploy-baseline)";
else echo "Missing deployed baseline; bootstrap with a manual deployment"; exit 1; fi
if ! git diff --quiet "$previous_sha" "$target_sha" -- migrations scripts/sats-db.ts src/server/sats-bid/db.ts; then
  echo "Migration changes require a manual deployment"
  exit 1
fi
PRICEBTC_AUTO_DEPLOY=true bash scripts/deploy_release.sh --lock-held
