import { afterEach, describe, expect, it, vi } from "vitest";
import type pg from "pg";

import { bidConfig } from "../../src/server/sats-bid/config.js";
import { database } from "../../src/server/sats-bid/db.js";
import {
  getWatcherCursor,
  getWatcherHealth,
  isTransientDbError,
  runDepositWatchers,
  withDbRetry,
} from "../../src/server/sats-bid/deposit-watchers.js";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function mockPool(
  query: (sql: string, params?: unknown[]) => Promise<{ rowCount: number; rows: unknown[] }>,
) {
  return { query: vi.fn(query) } as unknown as pg.Pool;
}

describe("deposit watcher DB resilience", () => {
  it("treats connection timeout, termination, and recovery mode as transient", () => {
    expect(isTransientDbError(new Error("Connection terminated due to connection timeout"))).toBe(true);
    expect(isTransientDbError(new Error("Connection terminated unexpectedly"))).toBe(true);
    expect(isTransientDbError(new Error("the database system is in recovery mode"))).toBe(true);
    expect(isTransientDbError(new Error("explorer timeout"))).toBe(false);
  });

  it("retries transient DB errors then succeeds", async () => {
    const sleep = vi.fn(async () => undefined);
    let attempts = 0;
    const result = await withDbRetry(
      async () => {
        attempts += 1;
        if (attempts < 3) throw new Error("the database system is in recovery mode");
        return "ok";
      },
      { sleep, delayMs: 5 },
    );
    expect(result).toBe("ok");
    expect(attempts).toBe(3);
    expect(sleep).toHaveBeenCalledTimes(2);
  });

  it("does not increment consecutive_errors when cursor reads fail with a transient DB error", async () => {
    const pool = mockPool(async (sql) => {
      if (sql.includes("SELECT last_tx_hash")) {
        throw new Error("Connection terminated due to connection timeout");
      }
      if (sql.includes("consecutive_errors=consecutive_errors+1")) {
        throw new Error("should not increment consecutive_errors");
      }
      return { rowCount: 0, rows: [] };
    });
    const config = bidConfig({
      APP_ENV: "test",
      SPONSOR_ADDR_BTC: "bc1qpcf3cludfwwu3jez7j7f406ck8psmne5cypkhf",
    });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    await expect(runDepositWatchers(pool, config)).resolves.toBeUndefined();
    expect(vi.mocked(pool.query).mock.calls.some(([sql]) => String(sql).includes("consecutive_errors+1"))).toBe(false);
    expect(warn).toHaveBeenCalled();
  });

  it("reconnects around getWatcherCursor after a transient failure", async () => {
    let attempts = 0;
    const pool = mockPool(async (sql) => {
      if (sql.includes("SELECT last_tx_hash")) {
        attempts += 1;
        if (attempts === 1) throw new Error("Connection terminated unexpectedly");
        return {
          rowCount: 1,
          rows: [{ last_tx_hash: null, last_poll_at: new Date(), consecutive_errors: 0 }],
        };
      }
      return { rowCount: 0, rows: [] };
    });
    const cursor = await getWatcherCursor(pool, "BTC");
    expect(cursor.consecutive_errors).toBe(0);
    expect(attempts).toBe(2);
  });

  it("attaches a pool error handler that logs without throwing", async () => {
    const pool = database("postgresql://pricebtc:ci-only@127.0.0.1:5432/pricebtc_test");
    try {
      expect(pool.listenerCount("error")).toBeGreaterThan(0);
      expect(() => pool.emit("error", new Error("Connection terminated unexpectedly"))).not.toThrow();
    } finally {
      await pool.end();
    }
  });

  it("watches every asset with an address even when claim assets are BTC-only", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: { method?: string }) => {
        if (init?.method === "POST") {
          return { ok: true, json: async () => ({ result: [] }) };
        }
        if (String(url).includes("token_trc20")) {
          return { ok: true, json: async () => ({ token_transfers: [] }) };
        }
        return { ok: true, json: async () => [] };
      }),
    );
    const seen: string[] = [];
    const pool = mockPool(async (sql, params) => {
      if (sql.includes("SELECT last_tx_hash") && params?.[0]) {
        seen.push(String(params[0]));
        return {
          rowCount: 1,
          rows: [{ last_tx_hash: null, last_poll_at: new Date(), consecutive_errors: 0 }],
        };
      }
      return { rowCount: 1, rows: [] };
    });
    const config = bidConfig({
      APP_ENV: "test",
      SPONSOR_ADDR_BTC: "bc1qpcf3cludfwwu3jez7j7f406ck8psmne5cypkhf",
      SPONSOR_ADDR_USDT_TRC20: "TLK41RcGbtQiFP8XnTyF3YKaqzNyVbbxm3",
      SPONSOR_ADDR_USDC_SOL: "6qRGFDj5ySnqYu5KDpDpUenqxzS2dtnyRLhmKtAGvoMs",
      SPONSOR_CLAIM_ASSETS: "BTC",
    });
    await runDepositWatchers(pool, config);
    expect(seen).toEqual(["USDT_TRC20", "USDC_SOL", "BTC"]);
  });

  it("reports lastPollAgeSec and consecutiveErrors for each asset", async () => {
    const now = new Date("2026-10-13T14:21:45Z");
    const pool = mockPool(async () => ({
      rowCount: 3,
      rows: [
        { asset_type: "BTC", last_poll_at: new Date("2026-10-13T14:21:44Z"), consecutive_errors: 0 },
        { asset_type: "USDT_TRC20", last_poll_at: new Date("2026-10-11T23:30:43Z"), consecutive_errors: 7 },
        { asset_type: "USDC_SOL", last_poll_at: new Date("2026-10-07T11:54:10Z"), consecutive_errors: 5 },
      ],
    }));
    const watchers = await getWatcherHealth(pool, now);
    expect(watchers.BTC).toEqual({ lastPollAgeSec: 1, consecutiveErrors: 0 });
    expect(watchers.USDT_TRC20.consecutiveErrors).toBe(7);
    expect(watchers.USDT_TRC20.lastPollAgeSec).toBeGreaterThan(30 * 60 * 60);
    expect(watchers.USDC_SOL.consecutiveErrors).toBe(5);
    expect(watchers.USDC_SOL.lastPollAgeSec).toBeGreaterThan(5 * 24 * 60 * 60);
  });
});
