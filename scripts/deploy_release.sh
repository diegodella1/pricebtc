#!/usr/bin/env bash
set -Eeuo pipefail
export PATH="/home/diego/.local/bin:/usr/local/bin:/usr/bin:/bin"
project_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$project_dir"
mkdir -p .data/releases .data/deployment-backups
if [ "${1:-}" != "--lock-held" ]; then
  exec 9>.data/deploy.lock
  flock -w 1800 9
fi
transaction="$project_dir/.data/deployment-transaction"

verify() {
  local base="$1" directory="$2"
  for attempt in {1..12}; do
    if node "$project_dir/scripts/verify-release.mjs" "$base" "$directory"; then return 0; fi
    sleep 5
  done
  return 1
}

restore_transaction() {
  local backup
  backup="$(cat "$transaction")" || return 1
  echo "Restoring previous release from $backup"
  sudo -n systemctl stop pricebtc.service || return 1
  if [ -e "$backup/dist" ] || [ -L "$backup/dist" ]; then
    # Only remove the symlink created by deployment, never release contents.
    if [ -L dist ]; then unlink dist || return 1; fi
    mv "$backup/dist" dist || return 1
  fi
  sudo -n systemctl start pricebtc.service || return 1
  if [ -f "$backup/worker-active" ]; then sudo -n systemctl restart pricebtc-worker.service || return 1; fi
  verify http://127.0.0.1:3466 "$project_dir/dist" || return 1
  verify https://priceb.tc "$project_dir/dist" || return 1
  rm "$transaction" || return 1
  echo "Previous release restored and verified"
}

# Recover a cutover interrupted by a process or host crash before accepting new work.
if [ -f "$transaction" ]; then restore_transaction; fi
if [ -n "$(git status --porcelain)" ]; then
  echo "Refusing deployment: checkout has local changes"
  exit 1
fi
revision="$(git rev-parse HEAD)"
release_stamp="$(date -u +%Y%m%dT%H%M%S)-${revision:0:12}-$$"
release_dir="$project_dir/.data/releases/$release_stamp"
backup_dir="$project_dir/.data/deployment-backups/pricebtc-$release_stamp"
build_dir="$project_dir/.data/builds/$release_stamp"
mkdir -p "$build_dir" "$backup_dir"
git archive "$revision" | tar -x -C "$build_dir"
(
  cd "$build_dir"
  rtk npm ci
  rtk npm run typecheck
  rtk npm run lint
  rtk npm test
  rtk npm run test:deployment
  PRICEBTC_PREVIEW_DIR="$build_dir/output" rtk npm run build:preview
  if [ "${PRICEBTC_AUTO_DEPLOY:-false}" != true ] && sudo -n /usr/bin/node --env-file=/etc/pricebtc/pricebtc.env -e 'process.exit(process.env.DATABASE_URL ? 0 : 1)'; then
    sudo -n /usr/bin/node --env-file=/etc/pricebtc/pricebtc.env --import tsx scripts/sats-db.ts
  fi
)
# Build dependencies belong to this release; failed builds never touch live dependencies.
mv "$build_dir/output" "$release_dir"
mv "$build_dir/node_modules" "$release_dir/node_modules"
cp "$build_dir/package.json" "$release_dir/package.json"
printf '%s\n' "$revision" > "$release_dir/REVISION"
if [ "$(git rev-parse HEAD)" != "$revision" ] || [ -n "$(git status --porcelain)" ]; then
  echo "Checkout changed during build; refusing activation"
  exit 1
fi
if systemctl is-active --quiet pricebtc-worker.service; then touch "$backup_dir/worker-active"; fi
if [ -L dist ]; then cp -a dist "$backup_dir/dist";
elif [ -e dist ]; then echo "Expected dist to be a release symlink; migrate manually first"; exit 1;
else echo "No previous release available for rollback"; exit 1; fi

rollback() {
  local code="$?"
  trap - ERR TERM INT
  if [ -f "$transaction" ]; then
    if ! restore_transaction; then echo "ROLLBACK FAILED: intervention required; $transaction retained"; fi
  fi
  exit "$code"
}
trap rollback ERR
trap 'false' TERM INT
printf '%s\n' "$backup_dir" > "$transaction.tmp"
mv "$transaction.tmp" "$transaction"
sync -f "$transaction"
sudo -n systemctl stop pricebtc.service
if [ -L "$project_dir/.data/dist-next" ]; then unlink "$project_dir/.data/dist-next"; fi
ln -s "$release_dir" "$project_dir/.data/dist-next"
mv -Tf "$project_dir/.data/dist-next" dist
sudo -n systemctl start pricebtc.service
if [ -f "$backup_dir/worker-active" ]; then sudo -n systemctl restart pricebtc-worker.service; fi
verify http://127.0.0.1:3466 "$release_dir"
verify https://priceb.tc "$release_dir"
printf '%s\n' "$(date -u +%FT%TZ)" > "$release_dir/VERIFIED"
rm "$transaction"
trap - ERR TERM INT
printf 'Published=%s release=%s previous=%s\n' "$revision" "$release_dir" "$backup_dir/dist"
