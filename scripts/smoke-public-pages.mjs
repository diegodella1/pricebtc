import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
import { chromium, expect } from "@playwright/test";

export async function verifyPublicPages(base) {
  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH ?? "/usr/bin/chromium",
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    const home = await page.goto(base, { waitUntil: "domcontentloaded" });
    assert.equal(home.status(), 200, "Home: HTTP status");
    await expect(page.locator('#bid-top-slot .sponsor-empty-cta, #bid-top-slot .bid-top-spot')).toHaveCount(1, { timeout: 15_000 });
    await expect(page.locator('.sponsor-empty-cta')).toHaveCount(1);
    await expect(page.locator('script[src="https://www.googletagmanager.com/gtag/js?id=G-T9E3ZF3J0T"]')).toHaveCount(1);
    const csp = home.headers()["content-security-policy"] ?? "";
    assert.match(csp, /script-src[^;]*https:\/\/www\.googletagmanager\.com/, "GA4 script CSP");
    assert.match(csp, /connect-src[^;]*https:\/\/www\.google-analytics\.com/, "GA4 collection CSP");
    assert.equal(await page.evaluate(() => (globalThis.dataLayer ?? []).some(entry => entry[0] === "config" && entry[1] === "G-T9E3ZF3J0T")), true, "GA4 initialized");
    const waitlist = page.locator('.bid-waitlist-form');
    await expect(waitlist).toBeVisible();
    await waitlist.getByRole('button', { name: 'Join the waitlist', exact: true }).click();
    await expect(waitlist.getByText('Enter a valid email.', { exact: true })).toBeVisible();
    await expect(waitlist.locator('input[type="email"]')).toHaveAttribute('aria-invalid', 'true');
    console.log("Browser OK: home — one sponsor, GA4 configuration/CSP, waitlist validation");
    for (const [path, heading] of [
      ["/terms", "Terms of Service"], ["/privacy", "Privacy Policy"],
      ["/status", "Service Health"], ["/pricing", "Pricing"],
      ["/sponsors", null], ["/api", "Free JSON API"],
      ["/studio", "Widget Studio"],
    ]) {
      const response = await page.goto(`${base}${path}`, { waitUntil: "domcontentloaded" });
      assert.equal(response.status(), 200, `${path}: HTTP status`);
      const title = page.getByRole("heading", heading ? { level: 1, name: heading, exact: true } : { level: 1 });
      await expect(title).toBeVisible({ timeout: 15_000 });
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
