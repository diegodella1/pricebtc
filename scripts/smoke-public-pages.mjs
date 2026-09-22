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
