import { expect, test } from "@playwright/test";

test("price history and volume remain inside the chart at every viewport and range", async ({ page }) => {
  await page.route("**/api/history?**", route => route.fulfill({ json: {
    currency: "USD", range: new URL(route.request().url()).searchParams.get("range"),
    source: "coinbase", cachedAt: new Date().toISOString(),
    points: [
      { timestamp: "2026-09-21T10:00:00Z", price: "80000", volume: "10" },
      { timestamp: "2026-09-21T10:05:00Z", price: "81000", volume: "100" },
      { timestamp: "2026-09-21T10:10:00Z", price: "80500", volume: "50" },
    ],
  } }));
  await page.goto("/");
  for (const width of [1440, 768, 360]) {
    await page.setViewportSize({ width, height: 1000 });
    for (const range of ["1H", "24H", "7D"]) {
      await page.getByRole("button", { name: range, exact: true }).click();
      await expect(page.locator(".hero__chart .price-chart__line")).toBeVisible();
      const frame = (await page.locator(".hero__chart").boundingBox())!;
      const svg = (await page.locator(".hero__chart svg").boundingBox())!;
      expect(svg.x).toBeGreaterThanOrEqual(frame.x);
      expect(svg.y).toBeGreaterThanOrEqual(frame.y);
      expect(svg.x + svg.width).toBeLessThanOrEqual(frame.x + frame.width + 1);
      expect(svg.y + svg.height).toBeLessThanOrEqual(frame.y + frame.height + 1);
      const volume = (await page.locator(".hero__chart .price-chart__volume").nth(1).boundingBox())!;
      expect(volume.height).toBeGreaterThan(10);
      expect(volume.y + volume.height).toBeLessThanOrEqual(frame.y + frame.height);
    }
  }
});
