import { afterAll, describe, expect, it } from "vitest";
import Fastify from "fastify";
import type pg from "pg";

import { bidConfig } from "../../src/server/sats-bid/config.js";
import { registerCryptoRoutes } from "../../src/server/sats-bid/crypto-routes.js";
import {
  createCryptoPayment,
  getAvailableAssets,
  getClaimableAssets,
} from "../../src/server/sats-bid/crypto-sponsors.js";

const addresses = {
  SPONSOR_ADDR_BTC: "bc1qpcf3cludfwwu3jez7j7f406ck8psmne5cypkhf",
  SPONSOR_ADDR_USDT_TRC20: "TLK41RcGbtQiFP8XnTyF3YKaqzNyVbbxm3",
  SPONSOR_ADDR_USDC_SOL: "6qRGFDj5ySnqYu5KDpDpUenqxzS2dtnyRLhmKtAGvoMs",
};

describe("claim vs watcher asset split", () => {
  it("defaults claimable assets to every asset that has an address", () => {
    const config = bidConfig({ APP_ENV: "test", ...addresses });
    expect(getAvailableAssets(config).map((asset) => asset.type)).toEqual([
      "USDT_TRC20",
      "USDC_SOL",
      "BTC",
    ]);
    expect(getClaimableAssets(config).map((asset) => asset.type)).toEqual([
      "USDT_TRC20",
      "USDC_SOL",
      "BTC",
    ]);
  });

  it("limits claimable assets to SPONSOR_CLAIM_ASSETS while still watching every address", () => {
    const config = bidConfig({
      APP_ENV: "test",
      ...addresses,
      SPONSOR_CLAIM_ASSETS: "BTC, USDT_TRC20",
    });
    expect(getAvailableAssets(config).map((asset) => asset.type)).toEqual([
      "USDT_TRC20",
      "USDC_SOL",
      "BTC",
    ]);
    expect(getClaimableAssets(config).map((asset) => asset.type)).toEqual(["USDT_TRC20", "BTC"]);
  });

  it("ignores claim assets that have no deposit address", () => {
    const config = bidConfig({
      APP_ENV: "test",
      SPONSOR_ADDR_BTC: addresses.SPONSOR_ADDR_BTC,
      SPONSOR_CLAIM_ASSETS: "BTC,USDC_SOL",
    });
    expect(getClaimableAssets(config).map((asset) => asset.type)).toEqual(["BTC"]);
    expect(getAvailableAssets(config).map((asset) => asset.type)).toEqual(["BTC"]);
  });

  it("rejects creating a payment for a watched-only asset", async () => {
    const config = bidConfig({
      APP_ENV: "test",
      ...addresses,
      SPONSOR_CLAIM_ASSETS: "BTC",
    });
    await expect(
      createCryptoPayment({} as pg.Pool, config, "00000000-0000-0000-0000-000000000000", {
        name: "X",
        description: "Y",
        url: "https://example.com",
        normalized_domain: "example.com",
        asset_type: "USDT_TRC20",
      }),
    ).rejects.toThrow(/not currently available/);
  });
});

describe("crypto-sponsors config endpoint", () => {
  const app = Fastify();
  const config = bidConfig({
    APP_ENV: "test",
    ...addresses,
    SPONSOR_CLAIM_ASSETS: "BTC",
  });

  afterAll(async () => {
    await app.close();
  });

  it("offers every addressed asset when SPONSOR_CLAIM_ASSETS is unset", async () => {
    const app = Fastify();
    const btcOnly = bidConfig({
      APP_ENV: "test",
      SPONSOR_ADDR_BTC: addresses.SPONSOR_ADDR_BTC,
    });
    await registerCryptoRoutes(
      app,
      { query: async () => ({ rowCount: 0, rows: [] }) } as unknown as pg.Pool,
      btcOnly,
      async () => "session",
      async () => undefined,
      () => undefined,
      () => new Date(),
      async () => 100_000,
    );
    await app.ready();
    const response = await app.inject("/api/sats-bid/crypto-sponsors/config");
    expect(response.statusCode).toBe(200);
    const body = response.json() as {
      enabled: boolean;
      btcPriceUsd: string;
      assets: { type: string; minUsd: number; label: string }[];
    };
    expect(body.enabled).toBe(true);
    expect(body.btcPriceUsd).toBe("100000.00");
    expect(body.assets).toEqual([
      expect.objectContaining({ type: "BTC", label: "BTC", minUsd: 10 }),
    ]);
    await app.close();
  });

  it("offers only claimable assets", async () => {
    await registerCryptoRoutes(
      app,
      { query: async () => ({ rowCount: 0, rows: [] }) } as unknown as pg.Pool,
      config,
      async () => "session",
      async () => undefined,
      () => undefined,
    );
    await app.ready();
    const response = await app.inject("/api/sats-bid/crypto-sponsors/config");
    expect(response.statusCode).toBe(200);
    const body = response.json() as { enabled: boolean; assets: { type: string }[] };
    expect(body.enabled).toBe(true);
    expect(body.assets.map((asset) => asset.type)).toEqual(["BTC"]);
  });
});
