import { describe, expect, it } from "vitest";

import {
  acceptedPaymentMethods,
  formatChooseAssetCopy,
  formatPayWithCopy,
  parseClaimAssetList,
  rewriteSponsorsClaimCopy,
} from "../../src/server/sats-bid/sponsor-copy.js";

describe("sponsor claim copy", () => {
  it("formats pay-with copy from claimable assets without a hardcoded three-asset list", () => {
    expect(formatPayWithCopy(["BTC", "USDT_TRC20", "USDC_SOL"])).toBe("Pay with BTC, USDT, or USDC");
    expect(formatPayWithCopy(["BTC"])).toBe("Pay with BTC");
    expect(formatPayWithCopy(["USDT_TRC20", "USDC_SOL"])).toBe("Pay with USDT or USDC");
    expect(formatPayWithCopy([])).toBe("Pay with crypto");
    expect(formatChooseAssetCopy(["BTC"])).toBe("Select BTC (SegWit)");
    expect(acceptedPaymentMethods(["BTC"])).toEqual(["Bitcoin"]);
    expect(acceptedPaymentMethods(["BTC", "USDT_TRC20", "USDC_SOL"])).toEqual(["Bitcoin", "USDT", "USDC"]);
  });

  it("parses SPONSOR_CLAIM_ASSETS as a comma list and treats blank as default", () => {
    expect(parseClaimAssetList(undefined)).toBeNull();
    expect(parseClaimAssetList("")).toBeNull();
    expect(parseClaimAssetList("BTC, USDT_TRC20")).toEqual(["BTC", "USDT_TRC20"]);
    expect(parseClaimAssetList("btc,bogus,USDC_SOL")).toEqual(["BTC", "USDC_SOL"]);
  });

  it("rewrites /sponsors static copy and JSON-LD acceptedPaymentMethod", () => {
    const html = `<p>Support PRICEB.TC. <!--claim-pay-with-->Pay with crypto<!--/claim-pay-with-->. Anyone can outbid you anytime.</p>
<script type="application/ld+json">{"acceptedPaymentMethod":[]}</script>
<p><!--claim-choose-asset-->Select an available asset<!--/claim-choose-asset--> and see the payment address.</p>
<meta name="description" content="Claim with crypto." />`;
    const rewritten = rewriteSponsorsClaimCopy(html, ["BTC"]);
    expect(rewritten).toContain("Pay with BTC");
    expect(rewritten).not.toContain("Pay with BTC, USDT, or USDC");
    expect(rewritten).toContain('"acceptedPaymentMethod":["Bitcoin"]');
    expect(rewritten).toContain("Select BTC (SegWit)");
    expect(rewritten).toContain("Claim with BTC");
  });

  it("does not rewrite module scripts when applied to a full HTML document", () => {
    const html = `<!doctype html><html><head>
<script type="module" crossorigin src="/assets/index-home.js"></script>
<script id="structured-data" type="application/ld+json">{"acceptedPaymentMethod":["USDT","USDC"]}</script>
<script>window.dataLayer = window.dataLayer || [];</script>
</head><body>
<p><!--claim-pay-with-->Pay with crypto<!--/claim-pay-with--></p>
</body></html>`;
    const rewritten = rewriteSponsorsClaimCopy(html, ["BTC"]);
    expect(rewritten).toContain('<script type="module" crossorigin src="/assets/index-home.js"></script>');
    expect(rewritten).toContain("window.dataLayer = window.dataLayer || [];");
    expect(rewritten).toContain('"acceptedPaymentMethod":["Bitcoin"]');
    expect(rewritten).toContain("Pay with BTC");
    expect(rewritten).not.toContain("Pay with crypto");
  });
});
