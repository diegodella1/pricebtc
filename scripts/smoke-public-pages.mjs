import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { chromium, expect } from "@playwright/test";

export async function verifyPublicPages(base, { offline = false } = {}) {
  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH ?? (existsSync("/usr/bin/chromium") ? "/usr/bin/chromium" : chromium.executablePath()),
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    if (offline) await page.route("**/*", route => new URL(route.request().url()).origin === new URL(base).origin ? route.continue() : route.abort());
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    const home = await page.goto(base, { waitUntil: "domcontentloaded" });
    assert.equal(home.status(), 200, "Home: HTTP status");
    const hero = page.locator('#bid-top-slot .sponsor-empty-cta, #bid-top-slot .bid-top');
    await expect(hero).toHaveCount(1, { timeout: 15_000 });
    await expect(hero).toBeVisible();
    const strip = page.locator('#bid-strip-slot .sponsor-strip');
    await expect(strip).toHaveCount(1);
    await expect(strip).toBeVisible();
    const emptyHero = page.locator('#bid-top-slot .sponsor-empty-cta');
    if (await emptyHero.count()) {
      await expect(emptyHero).toContainText('Pay crypto');
      await expect(emptyHero).toHaveAttribute('href', /^\/sponsors#(claim|waitlist)$/);
    }
    for (const width of [1440, 768, 360]) {
      await page.setViewportSize({ width, height: 1000 });
      await expect(strip).toBeVisible();
      const chartBox = await page.locator('.hero__chart').boundingBox();
      const stripBox = await strip.boundingBox();
      assert.ok(chartBox && stripBox && stripBox.y >= chartBox.y + chartBox.height - 1, `Sponsor strip must be below chart at ${width}px`);
      await expect.poll(() => page.evaluate(() => globalThis.document.documentElement.scrollWidth - globalThis.innerWidth), {
        message: `Horizontal overflow at ${width}px`,
      }).toBeLessThanOrEqual(1);
    }
    await page.setViewportSize({ width: 1440, height: 1000 });
    await expect(page.locator('script[src="https://www.googletagmanager.com/gtag/js?id=G-T9E3ZF3J0T"]')).toHaveCount(1);
    const csp = home.headers()["content-security-policy"] ?? "";
    assert.match(csp, /script-src[^;]*https:\/\/www\.googletagmanager\.com/, "GA4 script CSP");
    assert.match(csp, /connect-src[^;]*https:\/\/www\.google-analytics\.com/, "GA4 collection CSP");
    assert.equal(await page.evaluate(() => (globalThis.dataLayer ?? []).some(entry => entry[0] === "config" && entry[1] === "G-T9E3ZF3J0T")), true, "GA4 initialized");
    console.log("Browser OK: home — hero, strip below chart, Pay crypto, responsive layout, GA4 configuration/CSP");
    for (const [path, heading] of [
      ["/terms", "Terms of Service"], ["/privacy", "Privacy Policy"],
      ["/status", "Service Health"], ["/pricing", "Free API. Sponsor-supported."],
      ["/sponsors", "TOP 21 SPONSORS."], ["/sponsors#waitlist", "JOIN THE WAITLIST."], ["/api", "Free JSON API"],
      ["/studio", "Widget Studio"],
    ]) {
      const response = await page.goto(`${base}${path}`, { waitUntil: "domcontentloaded" });
      if (response) assert.equal(response.status(), 200, `${path}: HTTP status`);
      else assert.ok(path.includes("#"), `${path}: expected a document response`);
      const title = page.getByRole("heading", heading ? { level: 1, name: heading, exact: true } : { level: 1 });
      await expect(title).toBeVisible({ timeout: 15_000 });
      if (path === "/sponsors") {
        await expect(page.locator('.bid-ranking > li')).toHaveCount(21);
      }
      if (path === "/sponsors#waitlist") {
        const waitlist = page.locator('.bid-waitlist-form');
        await expect(waitlist).toBeVisible();
        await waitlist.getByRole('button', { name: 'Join the waitlist', exact: true }).click();
        await expect(waitlist.getByText('Enter a valid email.', { exact: true })).toBeVisible();
        await expect(waitlist.locator('input[type="email"]')).toHaveAttribute('aria-invalid', 'true');
      }
      if (path === "/api") {
        await expect(page.getByRole("link", { name: /Get started free/ })).toBeVisible();
        const observation = page.waitForResponse(response => response.url().includes("/api/price?currency=ARS"));
        await page.getByRole("tab", { name: "ARS", exact: true }).click();
        const result = await observation;
        assert.equal(result.status(), 200);
        assert.equal((await result.json()).currency, "ARS");
        for (const header of ["x-ratelimit-limit", "x-ratelimit-remaining", "x-ratelimit-reset"]) {
          assert.match(result.headers()[header] ?? "", /^\d+$/, header);
        }
      }
      if (path === "/studio") {
        await expect(page.getByText("Includes PRICEB.TC mark · Pro removes it", { exact: true })).toBeVisible();
      }
      console.log(`Browser OK: ${path} — ${await title.textContent()}`);
    }
    assert.deepEqual(errors, [], "Browser runtime errors");
  } finally { await browser.close(); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { await verifyPublicPages(process.argv[2] ?? "https://priceb.tc"); }
  catch (error) { console.error(error); process.exitCode = 1; }
}
