import { expect, test } from "@playwright/test";

test("FAQ is linked from home and its answers work on desktop and mobile", async ({ page }) => {
  await page.goto("/");
  await page.locator('footer a[href="/faq"]').click();
  await expect(page).toHaveURL(/\/faq$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("PRICEB.TC FAQ");
  await expect(page.locator("main details")).toHaveCount(10);
  for (const width of [1440, 360]) {
    await page.setViewportSize({ width, height: 900 });
    const details = page.locator("main details");
    for (const detail of await details.all()) {
      await detail.locator("summary").focus();
      await page.keyboard.press("Enter");
      await expect(detail.locator(".faq-answer")).toBeVisible();
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
    for (const detail of await details.all()) await detail.locator("summary").click();
  }
});

test("FAQ content and structured answers are available without JavaScript", async ({ browser, baseURL }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  try {
    const page = await context.newPage();
    const response = await page.goto(`${baseURL}/faq`);
    expect(response?.status()).toBe(200);
    await expect(page.locator("main details")).toHaveCount(10);
    const schema = JSON.parse((await page.locator('#structured-data').textContent())!);
    expect(schema["@type"]).toBe("FAQPage");
    expect(schema.mainEntity).toHaveLength(10);
    await page.locator("summary").first().click();
    await expect(page.locator(".faq-answer").first()).toBeVisible();
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", "https://priceb.tc/faq");
  } finally {
    await context.close();
  }
});
