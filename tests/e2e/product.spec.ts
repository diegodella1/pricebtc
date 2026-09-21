import { createServer } from "node:http";
import type { AddressInfo } from "node:net";

import { expect, test, type Page } from "@playwright/test";

import { WIDGET_LAYOUT_META, type WidgetLayout } from "../../src/shared/widget-config.js";

const applicationPort = Number(process.env.E2E_PORT ?? 3466);

async function mockExtremeIdrMarket(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const originalFetch = window.fetch.bind(window);
    window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const inputUrl = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      const url = new URL(inputUrl, window.location.origin);
      if (url.pathname === "/api/price") {
        const currency = url.searchParams.get("currency") ?? "IDR";
        return new Response(JSON.stringify({
          currency,
          price: "1419980816.71",
          priceUsd: "90420.42",
          change24h: -12.34,
          marketTimestamp: "2026-08-27T17:00:00.000Z",
          receivedAt: "2026-08-27T17:00:00.100Z",
          fxUpdatedAt: "2026-08-27T00:00:00.000Z",
          status: "live",
          source: "coinbase",
        }), { headers: { "Content-Type": "application/json" } });
      }
      if (url.pathname === "/api/history") {
        return new Response(JSON.stringify({
          currency: url.searchParams.get("currency") ?? "IDR",
          range: url.searchParams.get("range") ?? "24h",
          points: [
            { timestamp: "2026-08-27T16:00:00.000Z", price: "1400000000" },
            { timestamp: "2026-08-27T17:00:00.000Z", price: "1419980816.71" },
          ],
          cachedAt: "2026-08-27T17:00:00.100Z",
          source: "coinbase",
        }), { headers: { "Content-Type": "application/json" } });
      }
      if (url.pathname === "/api/currencies") {
        return new Response(JSON.stringify([
          { code: "USD", name: "US Dollar", indicative: false },
          { code: "IDR", name: "Indonesian Rupiah", indicative: true },
        ]), { headers: { "Content-Type": "application/json" } });
      }
      return originalFetch(input, init);
    };

    class QuietEventSource extends EventTarget {
      static readonly CONNECTING = 0;
      static readonly OPEN = 1;
      static readonly CLOSED = 2;
      readonly CONNECTING = 0;
      readonly OPEN = 1;
      readonly CLOSED = 2;
      readonly readyState = 1;
      readonly url: string;
      readonly withCredentials = false;
      onerror: ((this: EventSource, event: Event) => unknown) | null = null;
      onmessage: ((this: EventSource, event: MessageEvent) => unknown) | null = null;
      onopen: ((this: EventSource, event: Event) => unknown) | null = null;

      constructor(url: string | URL) {
        super();
        this.url = String(url);
      }

      close() {}
    }

    Object.defineProperty(window, "EventSource", { configurable: true, value: QuietEventSource });
  });
}

test("homepage shows live market data and history", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { name: /^Bitcoin price now$/i })).toBeVisible();
  await expect(page.locator(".hero__price")).not.toHaveText("—", { timeout: 15_000 });
  await expect(page.locator(".hero__chart").getByLabel("Bitcoin price chart")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole("heading", { name: "Price history" })).toBeVisible();
  await expect(page.locator(".site-header").getByRole("link", { name: /create a widget/i })).toBeVisible();

  await page.getByRole("button", { name: "7D" }).click();
  await expect(page.getByText("7D WINDOW")).toBeVisible();
  await expect(page.getByRole("link", { name: "contact@foreign.rodeo" })).toHaveAttribute(
    "href",
    "mailto:contact@foreign.rodeo",
  );
});

test("route documents expose crawl directives, semantic fallback, and real 404s", async ({ page }) => {
  const home = await page.request.get("/");
  const homeHtml = await home.text();
  expect(home.status()).toBe(200);
  expect(homeHtml).toContain("Bitcoin price");
  expect(homeHtml).toContain("mailto:contact@foreign.rodeo");
  expect(homeHtml).toContain('rel="canonical" href="https://priceb.tc/"');
  expect(homeHtml).toContain('type="application/ld+json"');

  const studio = await page.request.get("/studio");
  const studioHtml = await studio.text();
  expect(studio.status()).toBe(200);
  expect(studioHtml).toContain("Bitcoin Widget &amp; OBS Overlay Studio");
  expect(studioHtml).toContain("BUILD A BITCOIN");

  for (const route of ["/embed", "/overlay"]) {
    const renderer = await page.request.get(route);
    const rendererHtml = await renderer.text();
    expect(renderer.status()).toBe(200);
    expect(renderer.headers()["x-robots-tag"]).toBe("noindex, follow, noarchive");
    expect(rendererHtml).toContain('content="noindex,follow,noarchive"');
  }

  const missing = await page.request.get("/signal-that-does-not-exist", {
    headers: { Accept: "text/html" },
  });
  expect(missing.status()).toBe(404);
  expect(await missing.text()).toContain("NOTHING");
});

test("homepage contains extreme fiat values across mobile and desktop", async ({ page }) => {
  // Keep the existing market-only page-height budget. Sats Bid has its own
  // responsive test with the paid placement and leaderboard enabled.
  await page.route("**/api/sats-bid/round/current", (route) => route.fulfill({
    json: { enabled: false },
  }));
  await mockExtremeIdrMarket(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.getByLabel("Display currency").selectOption("IDR");

  const price = page.locator(".hero__price");
  await expect(price).toHaveAttribute("aria-label", /1,419,980,816\.71/, { timeout: 15_000 });
  await expect(price.locator(".hero__price-compact")).toBeVisible();

  const mobileGeometry = await page.evaluate(() => {
    const visiblePanels = [...document.querySelectorAll<HTMLElement>(
      ".price-primary, .market-history, .demo-stage, .demo-export",
    )];
    return {
      overflowX: document.documentElement.scrollWidth - window.innerWidth,
      outside: visiblePanels.filter((element) => {
        const rect = element.getBoundingClientRect();
        return rect.left < -1 || rect.right > window.innerWidth + 1;
      }).map((element) => element.className),
      tallestDeployment: Math.max(
        ...[...document.querySelectorAll<HTMLElement>(".demo-stage")]
          .map((element) => element.getBoundingClientRect().height),
      ),
    };
  });
  expect(mobileGeometry.overflowX).toBeLessThanOrEqual(1);
  expect(mobileGeometry.outside).toEqual([]);
  expect(mobileGeometry.tallestDeployment).toBeLessThan(560);

  await page.setViewportSize({ width: 1440, height: 1000 });
  await expect(price.locator(".hero__price-exact")).toBeVisible();
  await expect(price.locator(".hero__price-compact")).toBeHidden();
  const desktopGeometry = await page.evaluate(() => ({
    overflowX: document.documentElement.scrollWidth - window.innerWidth,
    pageHeight: document.documentElement.scrollHeight,
    tallestDeployment: Math.max(
      ...[...document.querySelectorAll<HTMLElement>(".demo-stage")]
        .map((element) => element.getBoundingClientRect().height),
    ),
  }));
  expect(desktopGeometry.overflowX).toBeLessThanOrEqual(1);
  expect(desktopGeometry.pageHeight).toBeLessThan(3_600);
  expect(desktopGeometry.tallestDeployment).toBeLessThan(720);
});

test("studio keeps preview and exported URL in sync", async ({ page }) => {
  await page.goto("/studio?mode=embed");

  const brandBox = await page.locator(".studio-header .brand").boundingBox();
  const titleBox = await page.locator(".studio-header__title").boundingBox();
  expect(brandBox).not.toBeNull();
  expect(titleBox).not.toBeNull();
  expect((brandBox?.x ?? 0) + (brandBox?.width ?? 0)).toBeLessThan(titleBox?.x ?? Number.POSITIVE_INFINITY);

  await page.getByRole("button", { name: "OBS OVERLAY" }).click();
  await page.getByLabel("Display currency").selectOption("EUR");
  await page.getByRole("button", { name: "Ticker bar" }).click();

  await expect(page.getByLabel("BROWSER SOURCE URL")).toHaveValue(/\/overlay\?.*currency=EUR.*layout=ticker/);
  await expect(page.locator(".preview-widget .widget--ticker")).toBeVisible();
});

test("studio keeps independent drafts, deep-links state, and exposes layout capabilities", async ({ page }) => {
  await page.goto("/studio?mode=embed&currency=JPY&layout=ticker&scale=150");

  await expect(page.getByLabel("Display currency")).toHaveValue("JPY");
  await expect(page.getByRole("button", { name: "Ticker bar" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByText("6:1 // MIN 480 × 96")).toBeVisible();
  await expect(page.locator(".preview-widget")).toHaveCSS("aspect-ratio", "6 / 1");
  await expect(page.getByLabel("IFRAME CODE")).toHaveValue(/min-height:96px;aspect-ratio:6 \/ 1/);

  await page.getByLabel("Display currency").selectOption("EUR");
  await page.getByRole("button", { name: "Corner bug" }).click();
  await page.getByRole("button", { name: "OBS OVERLAY" }).click();
  await expect(page.getByLabel("Display currency")).toHaveValue("USD");
  await expect(page.getByRole("button", { name: "Lower third" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("checkbox", { name: "CHART" })).toBeDisabled();
  await expect(page.getByText("NOT AVAILABLE IN THIS LAYOUT")).toBeVisible();

  await page.getByLabel("Display currency").selectOption("ARS");
  await page.getByRole("button", { name: "Price only" }).click();
  await page.getByRole("button", { name: "WEB EMBED" }).click();
  await expect(page.getByLabel("Display currency")).toHaveValue("EUR");
  await expect(page.getByRole("button", { name: "Corner bug" })).toHaveAttribute("aria-pressed", "true");

  await page.reload();
  await expect(page.getByLabel("Display currency")).toHaveValue("EUR");
  await expect(page.getByRole("button", { name: "Corner bug" })).toHaveAttribute("aria-pressed", "true");
});

test("custom theme unlocks semantic colors and reports contrast", async ({ page }) => {
  await page.goto("/studio?mode=embed");

  const textColor = page.locator('input[name="studio-text-color"]');
  const surfaceColor = page.locator('input[name="studio-surface-color"]');
  await expect(textColor).toBeDisabled();
  await expect(surfaceColor).toBeDisabled();
  await expect(page.getByText("SELECT CUSTOM TO EDIT TEXT & SURFACE")).toBeVisible();

  await page.getByRole("button", { name: "CUSTOM" }).click();
  await expect(textColor).toBeEnabled();
  await expect(surfaceColor).toBeEnabled();
  await expect(page.getByLabel("Custom theme contrast checks")).toContainText(/TEXT AA (PASS|WARN)/);

  await page.getByText("Advanced appearance", { exact: true }).click();
  await page.getByLabel("BACKGROUND").selectOption("transparent");
  await expect(page.getByLabel("Custom theme contrast checks")).toHaveText("CONTRAST // HOST DEPENDENT");
});

test("layouts without charts skip history network work", async ({ page }) => {
  let historyRequests = 0;
  page.on("request", (request) => {
    if (new URL(request.url()).pathname === "/api/history") historyRequests += 1;
  });

  await page.goto("/studio?mode=overlay&layout=lower-third&chart=1");
  await expect(page.getByRole("checkbox", { name: "CHART" })).toBeDisabled();
  await page.waitForTimeout(250);
  expect(historyRequests).toBe(0);

  await page.goto("/embed?layout=price&chart=1");
  await expect(page.locator(".widget--price")).toBeVisible();
  await page.waitForTimeout(250);
  expect(historyRequests).toBe(0);
});

test("all layouts contain extreme currency values at canonical minimum sizes", async ({ page }) => {
  test.setTimeout(180_000);
  await mockExtremeIdrMarket(page);

  for (const layout of Object.keys(WIDGET_LAYOUT_META) as WidgetLayout[]) {
    const meta = WIDGET_LAYOUT_META[layout];
    for (const font of ["display", "sans", "mono"] as const) {
      for (const scale of [75, 100, 200] as const) {
        await page.setViewportSize({ width: meta.minWidth, height: meta.minHeight });
        const response = await page.goto(`/embed?currency=IDR&layout=${layout}&font=${font}&scale=${scale}&change=1&chart=1&motion=none`);
        expect(response?.status(), `${layout}/${font}/${scale} document response`).toBe(200);

        const price = page.locator(".widget__price");
        await expect(price).toHaveAttribute("aria-label", /1,419,980,816\.71/, { timeout: 15_000 });
        await expect(price.locator(".widget__price-compact")).toBeVisible();

        const geometry = await page.evaluate((currentLayout) => {
      const frame = document.querySelector<HTMLElement>(".widget__frame");
      if (!frame) throw new Error("Widget frame missing");
      const frameRect = frame.getBoundingClientRect();
      const selectors = [".widget__header", ".widget__quote", ".widget__price", ".widget__change", ".price-chart", ".widget__footer"];
      const visible = selectors.flatMap((selector) => {
        const element = frame.querySelector<HTMLElement>(selector);
        if (!element || getComputedStyle(element).display === "none") return [];
        const rect = element.getBoundingClientRect();
        return [{ selector, top: rect.top, right: rect.right, bottom: rect.bottom, left: rect.left }];
      });
      const outside = visible.filter((rect) => rect.left < frameRect.left - 1 || rect.top < frameRect.top - 1 || rect.right > frameRect.right + 1 || rect.bottom > frameRect.bottom + 1);
      const bySelector = new Map(visible.map((rect) => [rect.selector, rect]));
      const overlaps: string[] = [];
      const verticalOrder = (first: string, second: string) => {
        const a = bySelector.get(first);
        const b = bySelector.get(second);
        if (a && b && a.bottom > b.top + 1) overlaps.push(`${first}:${second}`);
      };
      const horizontalOrder = (first: string, second: string) => {
        const a = bySelector.get(first);
        const b = bySelector.get(second);
        if (a && b && a.right > b.left + 1) overlaps.push(`${first}:${second}`);
      };
      if (currentLayout === "ticker") {
        horizontalOrder(".widget__header", ".widget__quote");
        horizontalOrder(".widget__quote", ".price-chart");
        verticalOrder(".widget__quote", ".widget__footer");
      } else if (currentLayout === "lower-third") {
        horizontalOrder(".widget__header", ".widget__quote");
        verticalOrder(".widget__quote", ".widget__footer");
      } else {
        verticalOrder(".widget__header", ".widget__quote");
        verticalOrder(".widget__quote", ".price-chart");
        verticalOrder(".price-chart", ".widget__footer");
      }
      return {
        outside: outside.map((item) => item.selector),
        overlaps,
        documentOverflowX: document.documentElement.scrollWidth - window.innerWidth,
        documentOverflowY: document.documentElement.scrollHeight - window.innerHeight,
        frameOverflowX: frame.scrollWidth - frame.clientWidth,
        frameOverflowY: frame.scrollHeight - frame.clientHeight,
      };
        }, layout);

        const context = `${layout}/${font}/${scale}`;
        expect(geometry.outside, `${context} containment`).toEqual([]);
        expect(geometry.overlaps, `${context} overlap`).toEqual([]);
        expect(geometry.documentOverflowX, `${context} document X overflow`).toBeLessThanOrEqual(1);
        expect(geometry.documentOverflowY, `${context} document Y overflow`).toBeLessThanOrEqual(1);
        expect(geometry.frameOverflowX, `${context} frame X overflow`).toBeLessThanOrEqual(1);
        expect(geometry.frameOverflowY, `${context} frame Y overflow`).toBeLessThanOrEqual(1);
      }
    }
  }

  await page.setViewportSize({ width: 1600, height: 900 });
  await page.goto("/embed?currency=IDR&layout=card&font=mono&scale=100&change=1&chart=1&motion=none");
  await expect(page.locator(".widget__price-exact")).toBeVisible();
  await expect(page.locator(".widget__price-compact")).toBeHidden();
});

test("embed is frameable from a different origin", async ({ page }) => {
  const parentServer = createServer((_request, response) => {
    response.setHeader("Content-Type", "text/html; charset=utf-8");
    response.end(
      `<iframe title="External Bitcoin widget" src="http://127.0.0.1:${applicationPort}/embed?currency=USD&layout=card" style="width:960px;height:540px"></iframe>`,
    );
  });
  await new Promise<void>((resolve) => parentServer.listen(0, "127.0.0.1", resolve));
  const port = (parentServer.address() as AddressInfo).port;

  try {
    await page.goto(`http://127.0.0.1:${port}/`);
    const widgetFrame = page.frameLocator('iframe[title="External Bitcoin widget"]');
    await expect(widgetFrame.getByRole("link", { name: "priceb.tc" })).toBeVisible({ timeout: 15_000 });
    await expect(widgetFrame.locator(".widget__price")).toHaveAttribute("aria-label", /^Bitcoin price (?!syncing|unavailable).+/, { timeout: 15_000 });
  } finally {
    await new Promise<void>((resolve, reject) =>
      parentServer.close((error) => (error ? reject(error) : resolve())),
    );
  }
});

test("transparent overlay leaves the browser canvas transparent", async ({ page }) => {
  await page.goto("/overlay?currency=USD&layout=lower-third&background=transparent&motion=none");

  await expect(page.locator(".widget__price")).toHaveAttribute("aria-label", /^Bitcoin price (?!syncing|unavailable).+/, { timeout: 15_000 });
  const colors = await page.evaluate(() => ({
    html: getComputedStyle(document.documentElement).backgroundColor,
    body: getComputedStyle(document.body).backgroundColor,
  }));
  expect(colors).toEqual({ html: "rgba(0, 0, 0, 0)", body: "rgba(0, 0, 0, 0)" });
});

test("homepage has no horizontal overflow at supported breakpoints", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(page.locator(".hero__price")).not.toHaveText("—", { timeout: 15_000 });

  for (const viewport of [
    { width: 320, height: 720 },
    { width: 390, height: 844 },
    { width: 768, height: 1024 },
    { width: 1440, height: 1000 },
    { width: 1920, height: 1080 },
  ]) {
    await page.setViewportSize(viewport);
    const dimensions = await page.evaluate(() => ({
      width: window.innerWidth,
      contentWidth: document.documentElement.scrollWidth,
    }));
    expect(dimensions.contentWidth, `${viewport.width}px viewport`).toBeLessThanOrEqual(dimensions.width + 1);
  }
});
