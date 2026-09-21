import type { PricePayload } from "../shared/contracts.js";

export function escapeHtml(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
}

export function injectOgMeta(html: string, price: PricePayload | null, currency: string = "USD"): string {
  if (!price) return html;

  const priceFormatted = Number(price.price).toLocaleString("en-US", {
    style: "currency",
    currency: currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
  const change24h = price.change24h >= 0 ? `+${price.change24h.toFixed(2)}%` : `${price.change24h.toFixed(2)}%`;
  
  const title = `Bitcoin ${priceFormatted} ${change24h} (24h) | PRICEB.TC`;
  const description = `Bitcoin (BTC) is trading at ${priceFormatted} on Coinbase, ${change24h} in the last 24 hours. Live market data updated ${price.status === "live" ? "now" : "recently"}.`;
  const ogImageUrl = `https://priceb.tc/og-image.png?currency=${currency}`;

  return html
    .replace(/<meta property="og:title" content="[^"]*"/, `<meta property="og:title" content="${escapeHtml(title)}"`)
    .replace(/<meta property="og:description" content="[^"]*"/, `<meta property="og:description" content="${escapeHtml(description)}"`)
    .replace(/<meta property="og:image" content="[^"]*"/, `<meta property="og:image" content="${ogImageUrl}"`)
    .replace(/<meta name="twitter:title" content="[^"]*"/, `<meta name="twitter:title" content="${escapeHtml(title)}"`)
    .replace(/<meta name="twitter:description" content="[^"]*"/, `<meta name="twitter:description" content="${escapeHtml(description)}"`)
    .replace(/<meta name="twitter:image" content="[^"]*"/, `<meta name="twitter:image" content="${ogImageUrl}"`)
    .replace(/<title>[^<]*<\/title>/, `<title>${escapeHtml(title)}</title>`);
}

/** A timestamped observation shared by visitors and crawlers, never a build-time quote. */
export function renderPriceSnapshot(price: PricePayload | null): string {
  if (!price) return '<p role="status">Price unavailable. Waiting for market data.</p>';
  const formatted = Number(price.price).toLocaleString("en-US", { style: "currency", currency: "USD" });
  const serialized = escapeHtml(JSON.stringify(price));
  const sats = Math.round(100_000_000 / Number(price.priceUsd)).toLocaleString("en-US");
  const timestamp = escapeHtml(price.marketTimestamp);
  const status = price.status === "live" ? "Live" : "Stale";
  
  // Format relative time for SSR
  const now = Date.now();
  const priceTime = new Date(price.marketTimestamp).getTime();
  const seconds = Math.floor((now - priceTime) / 1000);
  let relativeTime = "just now";
  if (seconds >= 60) {
    const minutes = Math.floor(seconds / 60);
    if (minutes >= 60) {
      const hours = Math.floor(minutes / 60);
      relativeTime = hours >= 24 ? `${Math.floor(hours / 24)}d ago` : `${hours}h ago`;
    } else {
      relativeTime = `${minutes}m ago`;
    }
  } else if (seconds > 0) {
    relativeTime = `${seconds}s ago`;
  }
  
  // Format KPIs
  const high = price.high24h ? Number(price.high24h).toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 0 }) : "—";
  const low = price.low24h ? Number(price.low24h).toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 0 }) : "—";
  const volume = price.volume24h ? `${Number(price.volume24h).toLocaleString("en-US", { maximumFractionDigits: 0 })} BTC` : "—";
  
  return `<div class="quote-label"><span>BTC / USD</span><span>Coinbase Exchange</span></div><p class="hero__price">${formatted}</p><div class="quote-context"><span>${price.change24h.toFixed(2)}% <small>24h</small></span><span>1 USD = <strong>${sats}</strong> sats</span></div><label class="currency-field" for="home-currency"><span class="currency-field__label">Display currency</span><span class="currency-field__control"><select id="home-currency" disabled><option>USD — US Dollar</option></select><span aria-hidden="true">⌄</span></span></label><div class="kpi-strip"><div class="kpi-item"><span class="kpi-label">High 24h</span><strong class="kpi-value">${high}</strong></div><div class="kpi-item"><span class="kpi-label">Low 24h</span><strong class="kpi-value">${low}</strong></div><div class="kpi-item"><span class="kpi-label">Volume 24h</span><strong class="kpi-value">${volume}</strong></div></div><p class="market-source"><span class="feed-state${price.status === "live" ? " is-live" : ""}"><i aria-hidden="true"></i>${status}</span> · Updated <span title="${timestamp}">${relativeTime}</span> · Coinbase BTC-USD</p><template id="initial-price" data-price="${serialized}"></template>`;
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
