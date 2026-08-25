#!/usr/bin/env bash
set -euo pipefail

base_url="${PRICEBTC_BASE_URL:-https://priceb.tc}"

rtk curl --fail --silent --show-error --max-time 15 "${base_url}/healthz"
rtk curl --fail --silent --show-error --max-time 15 "${base_url}/api/price?currency=USD"
rtk curl --fail --silent --show-error --max-time 15 "${base_url}/api/history?currency=EUR&range=1h"
rtk curl --fail --silent --show-error --max-time 15 "${base_url}/embed?currency=USD&layout=card"
