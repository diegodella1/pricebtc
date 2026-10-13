import type { AssetType } from "./crypto-sponsors.js";

export const WATCHED_ASSET_TYPES: AssetType[] = ["BTC", "USDT_TRC20", "USDC_SOL"];

const COPY_ORDER: AssetType[] = ["BTC", "USDT_TRC20", "USDC_SOL"];

const PAY_LABEL: Record<AssetType, string> = {
  BTC: "BTC",
  USDT_TRC20: "USDT",
  USDC_SOL: "USDC",
};

const SCHEMA_NAME: Record<AssetType, string> = {
  BTC: "Bitcoin",
  USDT_TRC20: "USDT",
  USDC_SOL: "USDC",
};

const CHOICE_LABEL: Record<AssetType, string> = {
  BTC: "BTC (SegWit)",
  USDT_TRC20: "USDT (TRC20)",
  USDC_SOL: "USDC (Solana)",
};

export function parseClaimAssetList(value: string | undefined | null): AssetType[] | null {
  if (value == null || value.trim() === "") return null;
  const allowed = new Set<string>(WATCHED_ASSET_TYPES);
  const parsed: AssetType[] = [];
  for (const part of value.split(",")) {
    const token = part.trim().toUpperCase();
    if (!token || !allowed.has(token) || parsed.includes(token as AssetType)) continue;
    parsed.push(token as AssetType);
  }
  return parsed;
}

export function sortAssetsForCopy(assets: AssetType[]): AssetType[] {
  return COPY_ORDER.filter((asset) => assets.includes(asset));
}

export function formatConjunction(items: string[]): string {
  if (items.length === 0) return "";
  if (items.length === 1) return items[0]!;
  if (items.length === 2) return `${items[0]} or ${items[1]}`;
  return `${items.slice(0, -1).join(", ")}, or ${items[items.length - 1]}`;
}

export function formatPayWithCopy(assets: AssetType[]): string {
  const list = formatConjunction(sortAssetsForCopy(assets).map((asset) => PAY_LABEL[asset]));
  return list ? `Pay with ${list}` : "Pay with crypto";
}

export function formatClaimWithCopy(assets: AssetType[]): string {
  const list = formatConjunction(sortAssetsForCopy(assets).map((asset) => PAY_LABEL[asset]));
  return list ? `Claim with ${list}` : "Claim with crypto";
}

export function formatClaimYourSpotCopy(assets: AssetType[]): string {
  const list = formatConjunction(sortAssetsForCopy(assets).map((asset) => PAY_LABEL[asset]));
  return list ? `Claim your spot with ${list}` : "Claim your spot with crypto";
}

export function formatChooseAssetCopy(assets: AssetType[]): string {
  const list = formatConjunction(sortAssetsForCopy(assets).map((asset) => CHOICE_LABEL[asset]));
  return list ? `Select ${list}` : "Select an available asset";
}

export function acceptedPaymentMethods(assets: AssetType[]): string[] {
  return sortAssetsForCopy(assets).map((asset) => SCHEMA_NAME[asset]);
}

const MARKER = (name: string) => new RegExp(`<!--${name}-->[\\s\\S]*?<!--/${name}-->`, "g");

function replaceMarked(html: string, name: string, value: string): string {
  const pattern = MARKER(name);
  if (!pattern.test(html)) return html;
  return html.replace(MARKER(name), `<!--${name}-->${value}<!--/${name}-->`);
}

const PAY_WITH_FALLBACK =
  /Pay with (?:crypto|BTC(?:, USDT, or USDC|, USDT|, USDC)?|USDT(?:, or USDC)?|USDC)/g;
const CLAIM_WITH_FALLBACK =
  /Claim with (?:crypto|BTC(?:, USDT, or USDC|, USDT|, USDC)?|USDT(?:, or USDC)?|USDC)/g;
const CLAIM_SPOT_FALLBACK =
  /Claim your spot with (?:crypto|BTC(?:, USDT, or USDC|, USDT|, USDC)?|USDT(?:, or USDC)?|USDC)/g;
const CHOOSE_ASSET_FALLBACK =
  /Select (?:an available asset|BTC \(SegWit\)(?:, USDT \(TRC20\), or USDC \(Solana\)|, USDT \(TRC20\)|, USDC \(Solana\))|USDT \(TRC20\)(?:, or USDC \(Solana\))?|USDC \(Solana\))/g;

function rewriteCopyChunk(html: string, assets: AssetType[]): string {
  const payWith = formatPayWithCopy(assets);
  const claimWith = formatClaimWithCopy(assets);
  const claimSpot = formatClaimYourSpotCopy(assets);
  const choose = formatChooseAssetCopy(assets);
  const methods = JSON.stringify(acceptedPaymentMethods(assets));

  let next = replaceMarked(html, "claim-pay-with", payWith);
  next = replaceMarked(next, "claim-with", claimWith);
  next = replaceMarked(next, "claim-spot-with", claimSpot);
  next = replaceMarked(next, "claim-choose-asset", choose);
  next = next.replace(PAY_WITH_FALLBACK, payWith);
  next = next.replace(CLAIM_WITH_FALLBACK, claimWith);
  next = next.replace(CLAIM_SPOT_FALLBACK, claimSpot);
  next = next.replace(CHOOSE_ASSET_FALLBACK, choose);
  next = next.replace(/"acceptedPaymentMethod":\[[^\]]*\]/g, `"acceptedPaymentMethod":${methods}`);
  return next;
}

export function rewriteSponsorsClaimCopy(html: string, assets: AssetType[]): string {
  return html.split(/(<script\b[^>]*>[\s\S]*?<\/script>)/gi).map((chunk) => {
    const script = chunk.match(/^<script\b([^>]*)>([\s\S]*?)<\/script>$/i);
    if (!script) return rewriteCopyChunk(chunk, assets);
    const attrs = script[1] ?? "";
    const body = script[2] ?? "";
    if (/id=["']structured-data["']/i.test(attrs) || /type=["']application\/ld\+json["']/i.test(attrs)) {
      return `<script${attrs}>${rewriteCopyChunk(body, assets)}</script>`;
    }
    return chunk;
  }).join("");
}
