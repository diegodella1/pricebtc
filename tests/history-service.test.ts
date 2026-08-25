import { describe, expect, it, vi } from "vitest";

import { HistoryService } from "../src/server/services/history-service.js";

describe("HistoryService", () => {
  it("normalizes ascending candles and converts selected currency", async () => {
    const fetcher = vi.fn(async () =>
      new Response(
        JSON.stringify([
          [1_700_000_060, 90, 110, 95, 100, 1],
          [1_700_000_000, 80, 100, 85, 90, 2],
        ]),
      ),
    );
    const service = new HistoryService({ fetcher, apiUrl: "https://example.test" });

    const result = await service.getHistory("1h", (price) => String(Number(price) * 2));

    expect(result.points).toEqual([
      { timestamp: "2023-11-14T22:13:20.000Z", price: "180" },
      { timestamp: "2023-11-14T22:14:20.000Z", price: "200" },
    ]);
    expect(fetcher).toHaveBeenCalledOnce();
  });

  it("uses cached candles for repeated requests", async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify([[1_700_000_000, 1, 2, 1, 2, 3]])));
    const service = new HistoryService({ fetcher, apiUrl: "https://example.test" });

    await service.getHistory("24h", (price) => price);
    await service.getHistory("24h", (price) => price);

    expect(fetcher).toHaveBeenCalledOnce();
  });

  it("rejects malformed upstream candles", async () => {
    const service = new HistoryService({
      fetcher: vi.fn(async () => new Response(JSON.stringify([["bad"]]))),
      apiUrl: "https://example.test",
    });

    await expect(service.getHistory("7d", (price) => price)).rejects.toThrow("Invalid candle payload");
  });
});
