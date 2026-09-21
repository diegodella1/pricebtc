import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { TradeVolumeService } from "../src/server/services/trade-volume.js";

const directories: string[] = [];
afterEach(async () => { await Promise.all(directories.splice(0).map(path => rm(path, { recursive: true, force: true }))); });
const now = Date.parse("2026-09-21T12:01:00Z");
const trade = (id: number, side: "buy" | "sell", size: string, time = "2026-09-21T12:00:10Z") => ({ trade_id: id, side, size, time });
async function service(fetcher: typeof fetch, dataDir?: string) {
  const directory = dataDir ?? await mkdtemp(join(tmpdir(), "pricebtc-volume-"));
  if (!dataDir) directories.push(directory);
  const instance = new TradeVolumeService({ dataDir: directory, fetcher, now: () => now });
  await instance.load();
  return { instance, directory };
}

describe("recorded trade volume", () => {
  it("inverts maker side, sums exact BTC sizes and ignores duplicate trades across refreshes and restarts", async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify([trade(3, "buy", "0.3"), trade(2, "sell", "0.2"), trade(1, "sell", "0.1"), trade(1, "sell", "0.1")])));
    const { instance, directory } = await service(fetcher);
    await instance.refresh();
    await instance.refresh();
    expect(instance.getVolumes(60).get("2026-09-21T12:00:00.000Z")).toEqual({ buyVolume: "0.3", sellVolume: "0.3" });
    const restored = await service(fetcher, directory);
    await restored.instance.refresh();
    expect(restored.instance.getVolumes(60)).toEqual(instance.getVolumes(60));
  });

  it("follows older pages until the saved trade ID and groups by candle boundaries", async () => {
    const fetcher = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(JSON.stringify([trade(1, "sell", "1", "2026-09-21T11:59:50Z")])))
      .mockResolvedValueOnce(new Response(JSON.stringify([trade(4, "sell", "4")]), { headers: { "cb-after": "4" } }))
      .mockResolvedValueOnce(new Response(JSON.stringify([trade(3, "buy", "3"), trade(2, "sell", "2"), trade(1, "sell", "1", "2026-09-21T11:59:50Z")])));
    const { instance } = await service(fetcher);
    await instance.refresh();
    await instance.refresh();
    expect(String(fetcher.mock.calls[2]![0])).toContain("after=4");
    expect(instance.getVolumes(300).get("2026-09-21T12:00:00.000Z")).toEqual({ buyVolume: "6", sellVolume: "3" });
    expect(instance.getVolumes(300).get("2026-09-21T11:55:00.000Z")).toEqual({ buyVolume: "1", sellVolume: "0" });
    expect(instance.getVolumes(60).has("2026-09-21T11:58:00.000Z")).toBe(false);
  });

  it("keeps recorded data on upstream failure and rejects invalid trades", async () => {
    const fetcher = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(JSON.stringify([trade(1, "sell", "1")])))
      .mockResolvedValueOnce(new Response("unavailable", { status: 503 }))
      .mockResolvedValueOnce(new Response(JSON.stringify([trade(2, "buy", "-1")])));
    const { instance } = await service(fetcher);
    await instance.refresh();
    await expect(instance.refresh()).rejects.toThrow();
    await expect(instance.refresh()).rejects.toThrow();
    expect(instance.getVolumes(60).get("2026-09-21T12:00:00.000Z")).toEqual({ buyVolume: "1", sellVolume: "0" });
  });

  it("does not commit a partial pagination failure and deduplicates concurrent refreshes", async () => {
    const fetcher = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(JSON.stringify([trade(2, "sell", "2")]), { headers: { "cb-after": "2" } }))
      .mockResolvedValueOnce(new Response("unavailable", { status: 503 }))
      .mockResolvedValueOnce(new Response(JSON.stringify([trade(2, "sell", "2"), trade(1, "buy", "1")])));
    const { instance } = await service(fetcher);
    const first = instance.refresh();
    expect(instance.refresh()).toBe(first);
    await expect(first).rejects.toThrow();
    expect(instance.getVolumes(60).size).toBe(0);
    await instance.refresh();
    expect(instance.getVolumes(60).get("2026-09-21T12:00:00.000Z")).toEqual({ buyVolume: "2", sellVolume: "1" });
  });

  it("retains only eight days of recorded volume", async () => {
    const { instance } = await service(async () => new Response(JSON.stringify([
      trade(2, "sell", "2"), trade(1, "buy", "1", "2026-09-01T12:00:00Z"),
    ])));
    await instance.refresh();
    expect(instance.getVolumes(60).size).toBe(1);
  });
});
