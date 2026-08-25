#!/usr/bin/env bash
set -euo pipefail

config_path="/etc/cloudflared/config.yml"
tunnel_id="55ecc138-2b04-4678-b3cf-5460da1aa1ff"
tunnel_target="${tunnel_id}.cfargotunnel.com"
domain="priceb.tc"
nameservers=("aragorn.ns.cloudflare.com" "reza.ns.cloudflare.com")

if ! rtk grep -q "hostname: priceb.tc" "$config_path"; then
  backup_suffix="$(rtk date +%Y%m%d%H%M%S)"
  rtk sudo cp "$config_path" "${config_path}.backup-${backup_suffix}"
  rtk sudo sed -i "/  - service: http_status:404/i\\  - hostname: priceb.tc\\n    service: http://127.0.0.1:3466\\n  - hostname: www.priceb.tc\\n    service: http://127.0.0.1:3466" "$config_path"
fi

rtk proxy cloudflared --config "$config_path" tunnel ingress validate
rtk sudo systemctl restart cloudflared.service
rtk sudo systemctl is-active cloudflared.service

dns_ready=true
for nameserver in "${nameservers[@]}"; do
  soa_record="$(rtk dig +short "@${nameserver}" "$domain" SOA)"
  if [[ -z "$soa_record" ]]; then
    dns_ready=false
  fi
done

if [[ "$dns_ready" == "true" ]]; then
  rtk echo "Cloudflare DNS is authoritative for ${domain}."
  rtk echo "Verify proxied CNAME records for @ and www target ${tunnel_target}."
else
  rtk echo "Cloudflare DNS is not authoritative for ${domain} yet."
  rtk echo "Add ${domain} to the Cloudflare account, then create proxied CNAME records for @ and www target ${tunnel_target}."
fi
