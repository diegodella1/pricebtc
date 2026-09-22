import { expect, test } from "@playwright/test";

test.skip(
  process.env.SATS_COMING_SOON_E2E !== "true",
  "Requires the API without a bidding database",
);
test("sponsor presentation is visible without enabling payments", async ({
  page,
}) => {
  test.setTimeout(120000);
  await page.emulateMedia({ reducedMotion: "reduce" });
  const unavailable: string[] = [];
  const writes: string[] = [];
  page.on("response", (response) => {
    if (response.url().includes("/api/sats-bid/") && response.status() >= 400)
      unavailable.push(response.url());
  });
  page.on("request", (request) => {
    if (request.url().includes("/api/sats-bid/") && request.method() !== "GET")
      writes.push(request.url());
  });
  const status = await (
    await page.request.get("/api/sats-bid/round/current")
  ).json();
  expect(status).toEqual({
    enabled: false,
    bids_open: false,
    coming_soon: true,
  });
  await page.goto("/");
  await expect(page.locator("#bid-top-slot")).toContainText(
    "SPONSOR SPACE / AVAILABLE",
  );
  await expect(page.locator("#sats-bid")).toContainText("PRÓXIMAMENTE");
  await expect(page.locator("#sats-bid")).toContainText("0 participants");
  await expect(page.locator(".bid-how-it-works li")).toHaveCount(3);
  await page
    .locator("#bid-top-slot")
    .getByRole("link", { name: /See how it works/ })
    .click();
  await expect(page).toHaveURL(/#sats-bid$/);
  for (const width of [360, 768, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth - innerWidth,
      ),
    ).toBeLessThanOrEqual(1);
  }
  await page.evaluate(() => { (document.activeElement as HTMLElement)?.blur(); window.scrollTo(0, 0); });
  await page.screenshot({
    path: "/tmp/pricebtc-coming-soon-desktop.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 360, height: 800 });
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: "/tmp/pricebtc-coming-soon-mobile.png",
    fullPage: true,
  });
  for (const path of ["/sponsors", "/leaderboard", "/history"]) {
    await page.goto(path);
    await expect(page.locator(".bid-launch-notice")).toContainText(
      "PRÓXIMAMENTE",
    );
    await expect(page.locator("form")).toHaveCount(0);
    await expect(
      page.getByRole("button", {
        name: /CREATE LIGHTNING INVOICE|SIMULATE PAYMENT/,
      }),
    ).toHaveCount(0);
  }
  expect(unavailable).toEqual([]);
  expect(writes).toEqual([]);
});
