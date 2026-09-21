#!/usr/bin/env bash
set -euo pipefail

project_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$project_dir"
rtk npm ci
rtk npm run typecheck
rtk npm run lint
rtk npm test
rtk npm run build:preview

rtk sudo install -d -o diego -g diego -m 0750 /var/lib/pricebtc
rtk sudo install -d -o root -g root -m 0755 /etc/pricebtc
if ! rtk sudo test -f /etc/pricebtc/pricebtc.env; then
  rtk sudo install -o root -g root -m 0600 deploy/pricebtc.env /etc/pricebtc/pricebtc.env
fi
if rtk sudo /usr/bin/node --env-file=/etc/pricebtc/pricebtc.env -e 'process.exit(process.env.DATABASE_URL ? 0 : 1)'; then
  rtk sudo /usr/bin/node --env-file=/etc/pricebtc/pricebtc.env --import tsx scripts/sats-db.ts
fi

release_stamp="$(date -u +%Y%m%dT%H%M%SZ)"
release_dir="$project_dir/.data/releases/$release_stamp"
backup_dir="$project_dir/.data/deployment-backups/pricebtc-$release_stamp"
rtk mkdir -p "$release_dir" "$backup_dir"
rtk cp -a .data/sats-preview/client "$release_dir/client"
rtk cp -a .data/sats-preview/server "$release_dir/server"
rtk sudo install -o root -g root -m 0644 deploy/pricebtc.service /etc/systemd/system/pricebtc.service
rtk sudo install -o root -g root -m 0644 deploy/pricebtc-worker.service /etc/systemd/system/pricebtc-worker.service
rtk sudo install -d -m 0755 /etc/systemd/journald@pricebtc.conf.d
rtk sudo install -o root -g root -m 0644 deploy/pricebtc-journal.conf /etc/systemd/journald@pricebtc.conf.d/retention.conf
rtk sudo install -o root -g root -m 0644 deploy/pricebtc-backup.service /etc/systemd/system/pricebtc-backup.service
rtk sudo install -o root -g root -m 0644 deploy/pricebtc-backup.timer /etc/systemd/system/pricebtc-backup.timer
rtk sudo systemctl daemon-reload

rollback() {
  rtk sudo systemctl stop pricebtc.service || true
  if [ -L dist ] && [ "$(readlink dist)" = "$release_dir" ]; then
    rtk rm dist
  fi
  if [ -e "$backup_dir/dist" ] || [ -L "$backup_dir/dist" ]; then
    rtk mv "$backup_dir/dist" dist
    rtk sudo systemctl start pricebtc.service
  fi
}
rtk sudo systemctl stop pricebtc.service
if [ -e dist ] || [ -L dist ]; then rtk mv dist "$backup_dir/dist"; fi
trap rollback ERR
ln -s "$release_dir" dist
rtk sudo systemctl enable --now pricebtc.service
for attempt in 1 2 3 4 5; do
  if rtk curl --fail --silent --show-error --max-time 10 http://127.0.0.1:3466/healthz; then break; fi
  if [ "$attempt" = 5 ]; then false; fi
  sleep 2
done
trap - ERR
if rtk sudo /usr/bin/node --env-file=/etc/pricebtc/pricebtc.env -e 'process.exit(process.env.SATS_WORKER_ENABLED === "true" ? 0 : 1)'; then
  rtk sudo systemctl enable --now pricebtc-worker.service
  rtk sudo systemctl restart pricebtc-worker.service
  rtk sudo systemctl enable --now pricebtc-backup.timer
fi
