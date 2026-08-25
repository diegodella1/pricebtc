import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { FxService } from "../src/server/services/fx-service.js";

const services: FxService[] = [];

afterEach(() => {
  for (const service of services) service.stop();
  services.length = 0;
});

function getFxPayload(overrides: Record<string, unknown> = {}) {
  return {
    result: "success",
    base_code: "USD",
    time_last_update_unix: 1_700_000_000,
    time_next_update_unix: 1_700_086_400,
    rates: { USD: 1, EUR: 0.92, ARS: 1_250 },
    ...overrides,
  };
}

describe("FxService", () => {
  it("converts USD using validated rates", async () => {
    const dataDir = await mkdtemp(join(tmpdir(), "pricebtc-fx-"));
    const fetcher = vi.fn(async () => new Response(JSON.stringify(getFxPayload())));
    const service = new FxService({ dataDir, fetcher, now: () => 1_700_000_100_000 });
    services.push(service);

    await service.start();

    expect(service.convertUsd("100", "EUR")).toBe("92");
    expect(service.convertUsd("100", "ARS")).toBe("125000");
    expect(service.getStatus().state).toBe("live");
  });

  it("persists and restores the last valid response", async () => {
    const dataDir = await mkdtemp(join(tmpdir(), "pricebtc-fx-"));
    const online = new FxService({
      dataDir,
      fetcher: vi.fn(async () => new Response(JSON.stringify(getFxPayload()))),
      now: () => 1_700_000_100_000,
    });
    services.push(online);
    await online.start();
    online.stop();

    expect(JSON.parse(await readFile(join(dataDir, "fx-rates.json"), "utf8"))).toMatchObject({
      rates: { EUR: 0.92 },
    });

    const offline = new FxService({
      dataDir,
      fetcher: vi.fn(async () => {
        throw new Error("offline");
      }),
      now: () => 1_700_000_200_000,
    });
    services.push(offline);
    await offline.start();

    expect(offline.convertUsd("10", "EUR")).toBe("9.2");
  });

  it("never exposes unsupported currencies", async () => {
    const dataDir = await mkdtemp(join(tmpdir(), "pricebtc-fx-"));
    const service = new FxService({
      dataDir,
      fetcher: vi.fn(async () => new Response(JSON.stringify(getFxPayload()))),
      now: () => 1_700_000_100_000,
    });
    services.push(service);
    await service.start();

    expect(() => service.convertUsd("100", "NOPE")).toThrow("Unsupported currency");
    expect(service.getCurrencies().find(({ code }) => code === "ARS")?.indicative).toBe(true);
  });
});
