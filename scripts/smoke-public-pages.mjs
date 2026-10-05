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
    const rail = page.locator('#bid-logo-rail .logo-rail');
    await expect(rail).toHaveCount(1);
    await expect(rail).toBeVisible();
    await expect(rail.locator('.logo-rail__cell')).toHaveCount(5);
    const emptyHero = page.locator('#bid-top-slot .sponsor-empty-cta');
    if (await emptyHero.count()) {
      await expect(emptyHero).toContainText('Pay BTC · USDT · USDC');
      await expect(emptyHero).toContainText('Be #01');
      await expect(emptyHero).toContainText('Claim Be #01');
      await expect(emptyHero.getByRole('link')).toHaveAttribute('href', /^\/sponsors#(claim|waitlist)$/);
      await expect(strip).toContainText('Spot #02 · Open');
      await expect(strip.getByRole('link', { name: 'Claim #02 →' })).toHaveAttribute('href', '/sponsors#claim');
    }
    const desktopMinWidth = 851;
    for (const width of [1440, 768, 360]) {
      await page.setViewportSize({ width, height: 1000 });
      await expect(strip).toBeVisible();
      await expect(rail).toBeVisible();
      assert.equal(await page.locator(".sponsor-strip").count(), 1, `Single home sponsor strip at ${width}px`);
      const chartBox = await page.locator(".hero__chart").boundingBox();
      const stripBox = await strip.boundingBox();
      const railBox = await rail.boundingBox();
      const topSlotBox = await page.locator("#bid-top-slot").boundingBox();
      const rightRailBox = await page.locator(".right-rail").boundingBox();
      const instrumentBox = await page.locator(".instrument").boundingBox();
      const freeUtilBox = await page.locator(".free-util").boundingBox();
      assert.ok(topSlotBox && stripBox, `Sponsor strip and hero slot layout at ${width}px`);
      assert.ok(
        stripBox.y >= topSlotBox.y + topSlotBox.height - 1,
        `Sponsor strip must sit below hero #01 at ${width}px`,
      );
      assert.ok(
        rightRailBox && stripBox && Math.abs(stripBox.width - rightRailBox.width) <= 2,
        `Sponsor strip must span full right rail width at ${width}px`,
      );
      if (width >= desktopMinWidth) {
        assert.ok(
          topSlotBox && Math.abs(stripBox.width - topSlotBox.width) <= 2,
          `Sponsor strip must match hero #01 column width at desktop ${width}px`,
        );
        assert.ok(rightRailBox && chartBox && instrumentBox, `Right rail beside instrument at ${width}px`);
        assert.ok(
          stripBox.x >= rightRailBox.x - 1 && stripBox.x + stripBox.width <= rightRailBox.x + rightRailBox.width + 1,
          `Sponsor strip must stay inside right rail at ${width}px`,
        );
        assert.ok(
          stripBox.y < chartBox.y + chartBox.height - 1,
          `Sponsor strip must stay beside chart (not under it) at desktop ${width}px`,
        );
        assert.ok(
          instrumentBox && rightRailBox &&
            Math.abs(instrumentBox.y + instrumentBox.height - (rightRailBox.y + rightRailBox.height)) <= 2,
          `Right rail bottom must align with price card at desktop ${width}px`,
        );
        assert.ok(
          stripBox.height >= 120,
          `#02 card must fill remaining rail height at desktop ${width}px (got ${stripBox?.height ?? 0}px)`,
        );
        if (freeUtilBox) {
          assert.ok(
            stripBox.y + stripBox.height <= freeUtilBox.y + 1,
            `Sponsor strip must not be clipped by free utility at ${width}px`,
          );
        }
      } else {
        assert.ok(
          chartBox && stripBox && stripBox.y >= chartBox.y + chartBox.height - 1,
          `Sponsor strip must be below chart at ${width}px`,
        );
      }
      assert.ok(stripBox && railBox && railBox.y >= stripBox.y + stripBox.height - 1, `Logo rail must be below strip at ${width}px`);
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
    console.log("Browser OK: home — hero, large #02 card in right rail (flush with price card at desktop), logo rail below strip (5 cells), Be #01 / Claim #02, responsive layout, GA4 configuration/CSP");
    for (const [path, heading] of [
      ["/terms", "Terms of Service"], ["/privacy", "Privacy Policy"],
      ["/status", "Service Health"], ["/pricing", "Free API. Sponsor-supported."],
      ["/sponsors", "CLAIM YOUR SPOT."], ["/sponsors#board", "TOP 21 SPONSORS."], ["/api", "Free JSON API"],
      ["/bitcoin-price-widget", "Add a Bitcoin price widget to your website"],
      ["/bitcoin-obs-overlay", "Put the Bitcoin price on your OBS stream"],
      ["/studio", "Widget Studio"],
    ]) {
      const response = await page.goto(`${base}${path}`, { waitUntil: "domcontentloaded" });
      if (response) assert.equal(response.status(), 200, `${path}: HTTP status`);
      else assert.ok(path.includes("#"), `${path}: expected a document response`);
      const title = page.getByRole("heading", heading ? { level: 1, name: heading, exact: true } : { level: 1 });
      await expect(title).toBeVisible({ timeout: 15_000 });
      if (path === "/sponsors#board") {
        await expect(page.locator('.bid-ranking > li')).toHaveCount(21);
      }
      if (path === "/api") {
        const header = page.locator('header.site-header');
        await expect(header.getByRole("link", { name: /^Claim$/ })).toBeVisible();
        await expect(header.getByRole("navigation").getByRole("link", { name: "Price" })).toBeVisible();
        await expect(header.getByRole("navigation").getByRole("link", { name: "Sponsors" })).toBeVisible();
        await expect(header.getByRole("navigation").getByRole("link", { name: "API" })).toBeVisible();
        await expect(header.getByRole("navigation").getByRole("link", { name: "Studio" })).toHaveClass(/header-nav-studio/);
        await expect(page.getByRole("link", { name: /Claim a Top 21 sponsor slot →/ })).toBeVisible();
        const observation = page.waitForResponse(response => response.url().includes("/api/price?currency=ARS"));
        await page.getByRole("tab", { name: "ARS", exact: true }).click();
        const result = await observation;
        assert.equal(result.status(), 200);
        assert.equal((await result.json()).currency, "ARS");
        for (const header of ["x-ratelimit-limit", "x-ratelimit-remaining", "x-ratelimit-reset"]) {
          assert.match(result.headers()[header] ?? "", /^\d+$/, header);
        }
      }
      if (path === "/bitcoin-price-widget" || path === "/bitcoin-obs-overlay") {
        const header = page.locator('header.site-header');
        await expect(header.getByRole("link", { name: /^Claim$/ })).toBeVisible();
        await expect(header.getByRole("navigation").getByRole("link", { name: "Price" })).toBeVisible();
        await expect(header.getByRole("navigation").getByRole("link", { name: "Sponsors" })).toBeVisible();
        await expect(header.getByRole("navigation").getByRole("link", { name: "API" })).toBeVisible();
        await expect(header.getByRole("navigation").getByRole("link", { name: "Studio" })).toHaveClass(/header-nav-studio/);
        await expect(page.getByRole("link", { name: /Claim a Top 21 sponsor slot →/ })).toBeVisible();
        await expect(page.getByRole("link", { name: /Open Widget Studio →/ })).toBeVisible();
      }
      if (path === "/studio") {
        await expect(page.getByRole('complementary', { name: /Configure widget/i })).toBeVisible();
        await expect(page.getByRole('button', { name: /Copy OBS URL|Copy embed URL/i })).toBeVisible();
        await expect(page.getByText(/Primary export always visible in rail/i)).toBeVisible();
        await expect(page.locator('.preview-well')).toBeVisible();
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
