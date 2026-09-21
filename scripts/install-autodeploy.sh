#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
if [ -n "${1:-}" ]; then
  [[ "$1" =~ ^[a-f0-9]{7,40}$ ]] || { echo "Expected deployed baseline revision"; exit 1; }
  mkdir -p .data
  git rev-parse "$1^{commit}" > .data/deploy-baseline
fi
sudo -n install -d -o root -g root -m 0755 /usr/local/lib/pricebtc-deploy
sudo -n install -d -o diego -g diego -m 0700 /var/lib/pricebtc-deploy
sudo -n install -d -o root -g root -m 0755 /etc/pricebtc
sudo -n install -o root -g root -m 0644 scripts/deploy-webhook.mjs scripts/auto-deploy.sh /usr/local/lib/pricebtc-deploy/
sudo -n install -o root -g root -m 0644 deploy/pricebtc-deploy.service /etc/systemd/system/
tunnel_change="$(sudo -n python3 - <<'PY'
from pathlib import Path
import secrets
import datetime
import subprocess
import sys

secret = Path('/etc/pricebtc/deploy.env')
if not secret.exists():
    with secret.open('x') as output:
        secret.chmod(0o600)
        output.write('PRICEBTC_WEBHOOK_SECRET=' + secrets.token_hex(32) + '\n')

config = Path('/etc/cloudflared/config.yml')
original = config.read_text()
rule = '  - hostname: priceb.tc\n    path: ^/hooks/github-deploy$\n    service: http://127.0.0.1:3472\n'
if rule not in original:
    target = '  - hostname: priceb.tc\n    service: http://127.0.0.1:3466\n'
    if target not in original:
        raise SystemExit('Expected priceb.tc ingress not found; no changes made')
    backup = config.with_name('config.yml.before-pricebtc-deploy-' + datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%SZ'))
    backup.write_text(original)
    config.write_text(original.replace(target, rule + target, 1))
    try:
        subprocess.run(['cloudflared', '--config', str(config), 'tunnel', 'ingress', 'validate'], check=True, stdout=sys.stderr)
    except BaseException:
        config.write_text(original)
        raise
    print('changed')
else:
    print('unchanged')
PY
)"
sudo -n systemctl daemon-reload
sudo -n systemctl enable --now pricebtc-deploy.service
sudo -n systemctl restart pricebtc-deploy.service
if [ "$tunnel_change" = changed ]; then sudo -n systemctl restart cloudflared.service; fi
sudo -n systemctl is-active pricebtc-deploy.service cloudflared.service pricebtc.service
echo 'Receiver installed. Register the GitHub webhook only after validation.'
