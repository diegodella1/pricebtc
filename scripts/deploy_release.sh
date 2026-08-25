#!/usr/bin/env bash
set -euo pipefail

project_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$project_dir"

rtk npm ci
rtk npm run check

rtk sudo install -d -o diego -g diego -m 0750 /var/lib/pricebtc
rtk sudo install -d -o root -g root -m 0755 /etc/pricebtc
rtk sudo install -o root -g root -m 0644 deploy/pricebtc.env /etc/pricebtc/pricebtc.env
rtk sudo install -o root -g root -m 0644 deploy/pricebtc.service /etc/systemd/system/pricebtc.service
rtk sudo systemctl daemon-reload
rtk sudo systemctl enable --now pricebtc.service
rtk sudo systemctl restart pricebtc.service

rtk curl --fail --silent --show-error --max-time 10 http://127.0.0.1:3466/healthz
