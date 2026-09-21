import sharp from "sharp";
import type { PricePayload } from "../shared/contracts.js";

interface OgImageOptions {
  price: PricePayload | null;
  currency?: string;
}

export async function generateOgImage({ price, currency = "USD" }: OgImageOptions): Promise<Buffer> {
  const width = 1200;
  const height = 630;
  const bgColor = "#0d1012";
  const textColor = "#e8e9eb";
  const accentColor = "#ffb66b";

  if (!price) {
    return generatePlaceholderImage(width, height, bgColor);
  }

  const priceValue = Number(price.price).toLocaleString("en-US", {
    style: "currency",
    currency: currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });

  const change24h = price.change24h >= 0 ? `+${price.change24h.toFixed(2)}%` : `${price.change24h.toFixed(2)}%`;
  const changeColor = price.change24h >= 0 ? "#2aa561" : "#dc4437";

  const svg = `
    <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
      <rect width="${width}" height="${height}" fill="${bgColor}"/>
      
      <!-- Brand -->
      <text x="80" y="100" font-family="system-ui, -apple-system, sans-serif" font-size="24" font-weight="600" fill="${accentColor}" letter-spacing="2">
        PRICEB.TC
      </text>
      
      <!-- Title -->
      <text x="80" y="200" font-family="system-ui, -apple-system, sans-serif" font-size="48" font-weight="700" fill="${textColor}">
        Bitcoin Price Now
      </text>
      
      <!-- Price -->
      <text x="80" y="320" font-family="system-ui, -apple-system, sans-serif" font-size="96" font-weight="700" fill="${textColor}">
        ${priceValue}
      </text>
      
      <!-- 24h Change -->
      <text x="80" y="400" font-family="system-ui, -apple-system, sans-serif" font-size="48" font-weight="600" fill="${changeColor}">
        ${change24h}
      </text>
      <text x="280" y="400" font-family="system-ui, -apple-system, sans-serif" font-size="32" font-weight="400" fill="${textColor}">
        24h
      </text>
      
      <!-- Source -->
      <text x="80" y="560" font-family="monospace" font-size="18" fill="#6b7280">
        BTC/${currency} · Coinbase Exchange · ${price.status === "live" ? "Live" : "Stale"}
      </text>
    </svg>
  `;

  return sharp(Buffer.from(svg)).png().toBuffer();
}

async function generatePlaceholderImage(width: number, height: number, bgColor: string): Promise<Buffer> {
  const svg = `
    <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
      <rect width="${width}" height="${height}" fill="${bgColor}"/>
      <text x="600" y="315" font-family="system-ui" font-size="48" font-weight="700" fill="#6b7280" text-anchor="middle">
        Bitcoin Price Loading...
      </text>
    </svg>
  `;

  return sharp(Buffer.from(svg)).png().toBuffer();
}
