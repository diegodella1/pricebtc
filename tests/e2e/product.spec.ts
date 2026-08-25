import { createServer } from "node:http";
import type { AddressInfo } from "node:net";

import { expect, test } from "@playwright/test";

test("homepage shows live market data and history", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { name: /bitcoin,/i })).toBeVisible();
  await expect(page.locator(".hero__price")).not.toHaveText("—", { timeout: 15_000 });
  await expect(page.getByLabel("Bitcoin price chart")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole("link", { name: /build a widget/i })).toBeVisible();
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

test("embed is frameable from a different origin", async ({ page }) => {
  const parentServer = createServer((_request, response) => {
    response.setHeader("Content-Type", "text/html; charset=utf-8");
    response.end(
      '<iframe title="External Bitcoin widget" src="http://127.0.0.1:3466/embed?currency=USD&layout=card" style="width:960px;height:540px"></iframe>',
    );
  });
  await new Promise<void>((resolve) => parentServer.listen(0, "127.0.0.1", resolve));
  const port = (parentServer.address() as AddressInfo).port;

  try {
    await page.goto(`http://127.0.0.1:${port}/`);
    const widgetFrame = page.frameLocator('iframe[title="External Bitcoin widget"]');
    await expect(widgetFrame.getByRole("link", { name: "priceb.tc" })).toBeVisible({ timeout: 15_000 });
    await expect(widgetFrame.locator(".widget__price")).not.toHaveText("—", { timeout: 15_000 });
  } finally {
    await new Promise<void>((resolve, reject) =>
      parentServer.close((error) => (error ? reject(error) : resolve())),
    );
  }
});

test("transparent overlay leaves the browser canvas transparent", async ({ page }) => {
  await page.goto("/overlay?currency=USD&layout=lower-third&background=transparent&motion=none");

  await expect(page.locator(".widget__price")).not.toHaveText("—", { timeout: 15_000 });
  const colors = await page.evaluate(() => ({
    html: getComputedStyle(document.documentElement).backgroundColor,
    body: getComputedStyle(document.body).backgroundColor,
  }));
  expect(colors).toEqual({ html: "rgba(0, 0, 0, 0)", body: "rgba(0, 0, 0, 0)" });
});

test("mobile homepage has no horizontal overflow", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(page.locator(".hero__price")).not.toHaveText("—", { timeout: 15_000 });

  const dimensions = await page.evaluate(() => ({ width: window.innerWidth, contentWidth: document.documentElement.scrollWidth }));
  expect(dimensions.contentWidth).toBeLessThanOrEqual(dimensions.width + 1);
});
