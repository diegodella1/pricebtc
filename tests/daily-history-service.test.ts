import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { readFileSync, existsSync, rmSync } from "node:fs";
import { join } from "node:path";

import { DailyHistoryService } from "../src/server/services/daily-history-service.js";

const TEST_DATA_DIR = join(process.cwd(), "test-data-daily-history");
const TEST_DATA_FILE = join(TEST_DATA_DIR, "daily-history.json");

const TIMESTAMP_2026_08_25 = Math.floor(
  new Date("2026-08-25T00:00:00.000Z").getTime() / 1000,
);
const TIMESTAMP_2026_08_26 = Math.floor(
  new Date("2026-08-26T00:00:00.000Z").getTime() / 1000,
);
const TIMESTAMP_2026_08_27 = Math.floor(
  new Date("2026-08-27T00:00:00.000Z").getTime() / 1000,
);

describe("DailyHistoryService", () => {
  beforeEach(() => {
    if (existsSync(TEST_DATA_DIR)) {
      rmSync(TEST_DATA_DIR, { recursive: true });
    }
  });

  afterEach(() => {
    if (existsSync(TEST_DATA_DIR)) {
      rmSync(TEST_DATA_DIR, { recursive: true });
    }
  });

  describe("Coinbase candle mapping", () => {
    it("correctly maps Coinbase candle format [time, low, high, open, close, volume]", async () => {
      const mockTime = new Date("2026-08-25T12:00:00.000Z").getTime();
      const fetcher = vi.fn(async () =>
        new Response(
          JSON.stringify([
            [TIMESTAMP_2026_08_25, 77832.0, 81265.3, 78981.59, 78526.8, 1234.56],
          ]),
        ),
      );
      const service = new DailyHistoryService({
        dataDir: TEST_DATA_DIR,
        fetcher,
        now: () => mockTime,
      });

      await service.backfillFromCoinbase();

      const history = await service.getDailyHistory();
      expect(history).toHaveLength(1);
      expect(history[0]).toMatchObject({
        date: "2026-08-25",
        open: "78981.59",
        high: "81265.3",
        low: "77832",
        close: "78526.8",
        source: "coinbase",
        method: "daily-backfill",
        degraded: false,
        currency: "USD",
      });
    });

    it("validates OHLC constraints: low ≤ open ≤ high", async () => {
      const mockTime = new Date("2026-08-25T12:00:00.000Z").getTime();
      const fetcher = vi.fn(async () =>
        new Response(
          JSON.stringify([
            [TIMESTAMP_2026_08_25, 80000.0, 85000.0, 82000.0, 83000.0, 1000.0],
          ]),
        ),
      );
      const service = new DailyHistoryService({
        dataDir: TEST_DATA_DIR,
        fetcher,
        now: () => mockTime,
      });

      await service.backfillFromCoinbase();

      const history = await service.getDailyHistory();
      expect(history).toHaveLength(1);

      const candle = history[0];
      const low = Number(candle.low);
      const high = Number(candle.high);
      const open = Number(candle.open);
      const close = Number(candle.close);

      expect(low).toBeLessThanOrEqual(open);
      expect(open).toBeLessThanOrEqual(high);
      expect(low).toBeLessThanOrEqual(close);
      expect(close).toBeLessThanOrEqual(high);
      expect(low).toBeLessThanOrEqual(high);
    });

    it("rejects candles with open < low", async () => {
      const mockTime = new Date("2026-08-25T12:00:00.000Z").getTime();
      const fetcher = vi.fn(async () =>
        new Response(
          JSON.stringify([
            [TIMESTAMP_2026_08_25, 80000.0, 85000.0, 79000.0, 83000.0, 1000.0],
          ]),
        ),
      );
      const service = new DailyHistoryService({
        dataDir: TEST_DATA_DIR,
        fetcher,
        now: () => mockTime,
      });

      await expect(service.backfillFromCoinbase()).rejects.toThrow(
        /Invalid OHLC: open 79000 outside/,
      );
    });

    it("rejects candles with open > high", async () => {
      const mockTime = new Date("2026-08-25T12:00:00.000Z").getTime();
      const fetcher = vi.fn(async () =>
        new Response(
          JSON.stringify([
            [TIMESTAMP_2026_08_25, 80000.0, 85000.0, 86000.0, 83000.0, 1000.0],
          ]),
        ),
      );
      const service = new DailyHistoryService({
        dataDir: TEST_DATA_DIR,
        fetcher,
        now: () => mockTime,
      });

      await expect(service.backfillFromCoinbase()).rejects.toThrow(
        /Invalid OHLC: open 86000 outside/,
      );
    });

    it("rejects candles with close < low", async () => {
      const mockTime = new Date("2026-08-25T12:00:00.000Z").getTime();
      const fetcher = vi.fn(async () =>
        new Response(
          JSON.stringify([
            [TIMESTAMP_2026_08_25, 80000.0, 85000.0, 82000.0, 79000.0, 1000.0],
          ]),
        ),
      );
      const service = new DailyHistoryService({
        dataDir: TEST_DATA_DIR,
        fetcher,
        now: () => mockTime,
      });

      await expect(service.backfillFromCoinbase()).rejects.toThrow(
        /Invalid OHLC: close 79000 outside/,
      );
    });

    it("rejects candles with close > high", async () => {
      const mockTime = new Date("2026-08-25T12:00:00.000Z").getTime();
      const fetcher = vi.fn(async () =>
        new Response(
          JSON.stringify([
            [TIMESTAMP_2026_08_25, 80000.0, 85000.0, 82000.0, 86000.0, 1000.0],
          ]),
        ),
      );
      const service = new DailyHistoryService({
        dataDir: TEST_DATA_DIR,
        fetcher,
        now: () => mockTime,
      });

      await expect(service.backfillFromCoinbase()).rejects.toThrow(
        /Invalid OHLC: close 86000 outside/,
      );
    });

    it("rejects candles with low > high", async () => {
      const mockTime = new Date("2026-08-25T12:00:00.000Z").getTime();
      const fetcher = vi.fn(async () =>
        new Response(
          JSON.stringify([
            [TIMESTAMP_2026_08_25, 85000.0, 80000.0, 82000.0, 83000.0, 1000.0],
          ]),
        ),
      );
      const service = new DailyHistoryService({
        dataDir: TEST_DATA_DIR,
        fetcher,
        now: () => mockTime,
      });

      await expect(service.backfillFromCoinbase()).rejects.toThrow(
        /Invalid OHLC: low 85000 > high 80000/,
      );
    });
  });

  describe("backfill and persistence", () => {
    it("backfills and persists daily candles to disk", async () => {
      const mockTime = new Date("2026-08-26T12:00:00.000Z").getTime();
      const fetcher = vi.fn(async () =>
        new Response(
          JSON.stringify([
            [TIMESTAMP_2026_08_25, 77832.0, 81265.3, 78981.59, 78526.8, 1234.56],
            [TIMESTAMP_2026_08_26, 78500.0, 82000.0, 79000.0, 81500.0, 1500.0],
          ]),
        ),
      );
      const service = new DailyHistoryService({
        dataDir: TEST_DATA_DIR,
        fetcher,
        now: () => mockTime,
      });

      await service.backfillFromCoinbase();

      expect(existsSync(TEST_DATA_FILE)).toBe(true);

      const fileContent = JSON.parse(readFileSync(TEST_DATA_FILE, "utf-8"));
      expect(fileContent).toHaveLength(2);
      expect(fileContent[0].date).toBe("2026-08-25");
      expect(fileContent[1].date).toBe("2026-08-26");
    });

    it("loads cached data from disk on subsequent calls", async () => {
      const mockTime = new Date("2026-08-26T12:00:00.000Z").getTime();
      const fetcher = vi.fn(async () =>
        new Response(
          JSON.stringify([
            [TIMESTAMP_2026_08_25, 77832.0, 81265.3, 78981.59, 78526.8, 1234.56],
          ]),
        ),
      );
      const service1 = new DailyHistoryService({
        dataDir: TEST_DATA_DIR,
        fetcher,
        now: () => mockTime,
      });

      await service1.backfillFromCoinbase();
      expect(fetcher).toHaveBeenCalledOnce();

      const service2 = new DailyHistoryService({
        dataDir: TEST_DATA_DIR,
        fetcher: vi.fn(),
        now: () => mockTime,
      });

      const history = await service2.getDailyHistory();
      expect(history).toHaveLength(1);
      expect(history[0].date).toBe("2026-08-25");
    });
  });

  describe("date filtering", () => {
    it("filters daily history by date range", async () => {
      const mockTime = new Date("2026-08-28T12:00:00.000Z").getTime();
      const fetcher = vi.fn(async () =>
        new Response(
          JSON.stringify([
            [TIMESTAMP_2026_08_25, 77832.0, 81265.3, 78981.59, 78526.8, 1234.56],
            [TIMESTAMP_2026_08_26, 78500.0, 82000.0, 79000.0, 81500.0, 1500.0],
            [TIMESTAMP_2026_08_27, 81000.0, 84000.0, 81500.0, 83000.0, 1600.0],
          ]),
        ),
      );
      const service = new DailyHistoryService({
        dataDir: TEST_DATA_DIR,
        fetcher,
        now: () => mockTime,
      });

      await service.backfillFromCoinbase();

      const filtered = await service.getDailyHistory("2026-08-26", "2026-08-26");
      expect(filtered).toHaveLength(1);
      expect(filtered[0].date).toBe("2026-08-26");
    });

    it("defaults to launch date and today when no range specified", async () => {
      const mockTime = new Date("2026-08-26T12:00:00.000Z").getTime();
      const fetcher = vi.fn(async () =>
        new Response(
          JSON.stringify([
            [TIMESTAMP_2026_08_25, 77832.0, 81265.3, 78981.59, 78526.8, 1234.56],
            [TIMESTAMP_2026_08_26, 78500.0, 82000.0, 79000.0, 81500.0, 1500.0],
          ]),
        ),
      );
      const service = new DailyHistoryService({
        dataDir: TEST_DATA_DIR,
        fetcher,
        now: () => mockTime,
      });

      await service.backfillFromCoinbase();

      const all = await service.getDailyHistory();
      expect(all).toHaveLength(2);
    });
  });

  describe("rollup", () => {
    it("updates today and yesterday with rollup method", async () => {
      const mockTime = new Date("2026-08-26T12:00:00.000Z").getTime();
      const fetcher = vi.fn()
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify([
              [TIMESTAMP_2026_08_25, 77832.0, 81265.3, 78981.59, 78526.8, 1234.56],
            ]),
          ),
        )
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify([
              [TIMESTAMP_2026_08_25, 77832.0, 81265.3, 78981.59, 79000.0, 1234.56],
              [TIMESTAMP_2026_08_26, 78500.0, 82000.0, 79000.0, 81500.0, 1500.0],
            ]),
          ),
        );

      const service = new DailyHistoryService({
        dataDir: TEST_DATA_DIR,
        fetcher,
        now: () => mockTime,
      });

      await service.backfillFromCoinbase();
      await service.rollupLatestDay();

      const history = await service.getDailyHistory();
      const yesterday = history.find((c) => c.date === "2026-08-25");
      const today = history.find((c) => c.date === "2026-08-26");

      expect(yesterday?.method).toBe("daily-rollup");
      expect(today?.method).toBe("daily-rollup");
    });
  });

  describe("error handling", () => {
    it("throws error on Coinbase API failure", async () => {
      const mockTime = new Date("2026-08-25T12:00:00.000Z").getTime();
      const fetcher = vi.fn(async () => new Response("Server Error", { status: 500 }));
      const service = new DailyHistoryService({
        dataDir: TEST_DATA_DIR,
        fetcher,
        now: () => mockTime,
      });

      await expect(service.backfillFromCoinbase()).rejects.toThrow(
        /Coinbase daily candles returned 500/,
      );
    });

    it("throws error on invalid candle schema", async () => {
      const mockTime = new Date("2026-08-25T12:00:00.000Z").getTime();
      const fetcher = vi.fn(async () =>
        new Response(JSON.stringify([["invalid", "data"]])),
      );
      const service = new DailyHistoryService({
        dataDir: TEST_DATA_DIR,
        fetcher,
        now: () => mockTime,
      });

      await expect(service.backfillFromCoinbase()).rejects.toThrow(
        /Invalid daily candle payload/,
      );
    });
  });

  describe("launch date", () => {
    it("returns correct launch date", () => {
      expect(DailyHistoryService.getLaunchDate()).toBe("2026-08-25");
    });
  });
});
