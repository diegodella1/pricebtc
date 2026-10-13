// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";

import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { cryptoConfigEnabled } from "../../src/client/sats-bid/crypto-config.js";
import {
  BidInventoryProvider,
  BidRailSlot,
  BidStripSlot,
  BidTopSlot,
} from "../../src/client/sats-bid/home.js";

const btcAsset = {
  type: "BTC",
  address: "bc1qpcf3cludfwwu3jez7j7f406ck8psmne5cypkhf",
  label: "BTC",
  network: "Bitcoin Mainnet",
  minUsd: 10,
  confirmations: 3,
  warningMessage: "Send only Bitcoin on mainnet.",
  confirmationWaitMessage: "Typically ~30 minutes",
};

function mockSponsorApis(
  config: unknown,
  leaderboard: unknown | Promise<never> = { participants: [] },
) {
  vi.stubGlobal(
    "fetch",
    vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/crypto-sponsors/config")) {
        return Promise.resolve(
          new Response(JSON.stringify(config), { headers: { "Content-Type": "application/json" } }),
        );
      }
      if (url.includes("/crypto-sponsors/leaderboard")) {
        if (leaderboard instanceof Promise) return leaderboard;
        return Promise.resolve(
          new Response(JSON.stringify(leaderboard), { headers: { "Content-Type": "application/json" } }),
        );
      }
      return Promise.resolve(
        new Response("{}", { status: 404, headers: { "Content-Type": "application/json" } }),
      );
    }),
  );
}

function renderHomeSlots() {
  return render(
    <BidInventoryProvider>
      <div id="bid-top-slot">
        <BidTopSlot />
      </div>
      <div id="bid-strip-slot">
        <BidStripSlot />
      </div>
      <div id="bid-logo-rail">
        <BidRailSlot />
      </div>
    </BidInventoryProvider>,
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("cryptoConfigEnabled", () => {
  it("treats missing assets as disabled instead of throwing", () => {
    expect(cryptoConfigEnabled({ enabled: true })).toBe(false);
    expect(cryptoConfigEnabled({ enabled: true, assets: null as unknown as undefined })).toBe(false);
    expect(cryptoConfigEnabled({ enabled: true, assets: [btcAsset] })).toBe(true);
    expect(cryptoConfigEnabled({ enabled: false, assets: [btcAsset] })).toBe(false);
  });
});

describe("home top slot", () => {
  it("renders the empty CTA on first paint before sponsor APIs resolve", () => {
    mockSponsorApis(
      { enabled: true, btcPriceUsd: "100000.00", assets: [btcAsset] },
      new Promise<never>(() => undefined),
    );
    renderHomeSlots();
    expect(document.querySelector("#bid-top-slot .sponsor-empty-cta")).not.toBeNull();
    expect(document.querySelector("#bid-top-slot .bid-top")).not.toBeNull();
    expect(document.querySelector("#bid-strip-slot .sponsor-strip")).not.toBeNull();
    expect(document.querySelector("#bid-logo-rail .logo-rail")).not.toBeNull();
  });

  it("keeps the empty CTA when only BTC is claimable (prod BTC-only addresses)", async () => {
    mockSponsorApis({
      enabled: true,
      btcPriceUsd: "100000.00",
      assets: [btcAsset],
    });
    renderHomeSlots();
    await waitFor(() => {
      expect(screen.getByRole("link", { name: /Claim Be #01/ })).toHaveAttribute("href", "/sponsors#claim");
    });
    expect(document.querySelectorAll("#bid-top-slot .sponsor-empty-cta, #bid-top-slot .bid-top")).toHaveLength(1);
  });

  it("keeps the empty CTA when all addresses exist but SPONSOR_CLAIM_ASSETS=BTC", async () => {
    mockSponsorApis({
      enabled: true,
      btcPriceUsd: "100000.00",
      assets: [btcAsset],
    });
    renderHomeSlots();
    await waitFor(() => expect(document.querySelector("#bid-top-slot .sponsor-empty-cta")).not.toBeNull());
    expect(document.querySelector("#bid-strip-slot .sponsor-strip")).not.toBeNull();
    expect(document.querySelectorAll("#bid-logo-rail .logo-rail__cell")).toHaveLength(5);
  });

  it("does not crash the top slot when config.assets is omitted", async () => {
    mockSponsorApis({ enabled: true, btcPriceUsd: "0.00" });
    renderHomeSlots();
    await waitFor(() => expect(document.querySelector("#bid-top-slot .sponsor-empty-cta")).not.toBeNull());
  });
});
