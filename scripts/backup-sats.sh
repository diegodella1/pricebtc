#!/usr/bin/env bash
set -euo pipefail
backup_root="${SATS_BACKUP_DIR:-/var/lib/pricebtc/backups}"
backup_stamp="$(date -u +%Y%m%dT%H%M%SZ)"
backup_target="$backup_root/$backup_stamp"
umask 077
mkdir -p "$backup_target"
docker exec "${SATS_DB_CONTAINER:-pricebtc-sats-sats-db-1}" pg_dump -U pricebtc -d pricebtc --format=custom > "$backup_target/database.dump"
if [ -d "${PRICEBTC_DATA_DIR:-/var/lib/pricebtc}/logos" ]; then
  tar -czf "$backup_target/logos.tar.gz" -C "${PRICEBTC_DATA_DIR:-/var/lib/pricebtc}" logos
fi
printf '%s\n' '{"application":"pricebtc-sats-bid","complete":true}' > "$backup_target/manifest.json"
node scripts/rotate-sats-backups.mjs "$backup_root"
printf '%s\n' "$backup_target"
