import type { PricePayload } from "../shared/contracts.js";

export function escapeHtml(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
}

/** A timestamped observation shared by visitors and crawlers, never a build-time quote. */
export function renderPriceSnapshot(price: PricePayload | null): string {
  if (!price) return '<p role="status">Price unavailable. Waiting for market data.</p>';
  const formatted = Number(price.price).toLocaleString("en-US", { style: "currency", currency: "USD" });
  const serialized = escapeHtml(JSON.stringify(price));
  const sats = Math.round(100_000_000 / Number(price.priceUsd)).toLocaleString("en-US");
  const timestamp = escapeHtml(price.marketTimestamp);
  const timeLabel = timestamp;
  return `<div class="quote-label"><span>BTC / USD</span><span>Coinbase Exchange</span></div><p class="hero__price">${formatted}</p><div class="quote-context"><span>${price.change24h.toFixed(2)}% <small>24h</small></span><span>1 USD = <strong>${sats}</strong> sats</span></div><label class="currency-field" for="home-currency"><span class="currency-field__label">Display currency</span><span class="currency-field__control"><select id="home-currency" disabled><option>USD — US Dollar</option></select><span aria-hidden="true">⌄</span></span></label><p class="market-source">Market timestamp: <time datetime="${timestamp}">${timeLabel}</time> · Status: ${price.status === "live" ? "Live price" : "Data delayed"}</p><template id="initial-price" data-price="${serialized}"></template>`;
}

export function renderPriceMarkdown(price: PricePayload | null): string {
  if (!price) return "# Bitcoin Price Now\n\nBitcoin (BTC), USD observation unavailable.\nStatus: unavailable\n\nAPI: https://priceb.tc/api/price?currency=USD\nProvider: PRICEB.TC — https://priceb.tc/\n";
  return `# Bitcoin Price Now

Bitcoin (BTC): ${price.price} USD

Market: BTC-USD
Source: Coinbase Exchange
Market timestamp: ${price.marketTimestamp}
Received at: ${price.receivedAt}
Status: ${price.status}
24h change: ${price.change24h}%

This is one exchange observation, not a single global Bitcoin price. Check the market timestamp before quoting it.

API: https://priceb.tc/api/price?currency=USD
Documentation: https://priceb.tc/api
Provider: PRICEB.TC
https://priceb.tc/
`;
}
