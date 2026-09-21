import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.route("**/api/sats-bid/round/current", route => route.fulfill({ json: { enabled: false, bids_open: false, coming_soon: true } }));
});

test("sponsor is beside the price on desktop and before history on mobile", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/");
  await expect(page.locator("#bid-top-slot .bid-top")).toBeVisible();
  const quote = await page.locator(".price-primary").boundingBox();
  const sponsor = await page.locator("#bid-top-slot").boundingBox();
  expect(sponsor!.x).toBeGreaterThan(quote!.x + quote!.width);
  expect(sponsor!.y + sponsor!.height).toBeLessThan(1000);
  await expect(page.getByLabel("Sponsor placements").locator(".inventory-row")).toHaveCount(3);
  await expect(page.getByText("Future placement · Coming soon", { exact: true })).toHaveCount(2);
  await expect(page.getByRole("button", { name: /Pay|Reserve|Outbid/ })).toHaveCount(0);
  for (const width of [360, 768]) {
    await page.setViewportSize({ width, height: 1000 });
    const q = await page.locator(".price-primary").boundingBox();
    const s = await page.locator("#bid-top-slot").boundingBox();
    const history = await page.locator(".market-history").boundingBox();
    expect(s!.y).toBeGreaterThanOrEqual(q!.y + q!.height);
    expect(history!.y).toBeGreaterThan(s!.y + s!.height);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
  }
});

test("homepage exports the displayed widget and reports clipboard failures", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: async () => { throw new Error("denied"); } } });
    document.execCommand = () => false;
  });
  await page.goto("/");
  await expect(page.getByLabel("OBS source URL")).toHaveValue(/\/overlay\?.*layout=lower-third/);
  await page.getByRole("button", { name: "Copy OBS URL", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "Could not copy" })).toBeVisible();
  await page.getByRole("button", { name: "Website widget", exact: true }).click();
  await expect(page.getByLabel("Website embed code")).toHaveValue(/<iframe.*\/embed\?.*layout=card/);
  await expect(page.locator(".demo-renderer .widget--card")).toBeVisible();
  await page.getByRole("link", { name: "Customize in Studio" }).click();
  await expect(page).toHaveURL(/\/studio\?mode=embed&.*layout=card/);
  await expect(page.locator(".preview-widget .widget--card")).toBeVisible();
});

test("sponsor outage is not presented as an empty leaderboard", async ({ page }) => {
  await page.route("**/api/sats-bid/round/current", route => route.fulfill({ status: 503, json: { error: { message: "Unavailable" } } }));
  await page.goto("/");
  await expect(page.locator("#bid-top-slot")).toContainText("temporarily unavailable");
  await expect(page.getByText("No participants yet.", { exact: true })).toHaveCount(0);
});
