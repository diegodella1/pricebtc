import { expect, test, type Page } from "@playwright/test";
test.skip(
  process.env.SATS_E2E !== "true",
  "Requires isolated mock API and worker",
);
async function participate(page: Page, name: string, amount: string) {
  await page.goto("/bid");
  await page.getByLabel("Name", { exact: true }).fill(name);
  await page.getByLabel("Website", { exact: true }).fill("https://example.com");
  await page
    .getByLabel("One-line description")
    .fill("Independent Bitcoin project");
  await page.getByLabel("Amount in sats").fill(amount);
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "CREATE LIGHTNING INVOICE" }).click();
  await expect(page.getByRole("dialog")).toBeVisible({ timeout: 20000 });
  await page.getByRole("button", { name: "SIMULATE PAYMENT" }).click();
  await expect(
    page.getByRole("dialog").getByText("Payment credited", { exact: true }),
  ).toBeVisible({ timeout: 20000 });
  await page.getByRole("button", { name: "Close payment" }).click();
}
test("A/B/A payment flow, browser identity and responsive scoreboard", async ({
  browser,
}) => {
  test.setTimeout(180000);
  const a = await browser.newContext();
  const b = await browser.newContext();
  const pageA = await a.newPage();
  const pageB = await b.newPage();
  const suffix = Date.now().toString().slice(-6);
  const current = await (
    await pageA.request.get("/api/sats-bid/leaderboard")
  ).json();
  const initial = BigInt(current.leader?.total_sats ?? "0") + 10000n;
  await participate(pageA, `Alpha ${suffix}`, initial.toString());
  await participate(pageB, `Beta ${suffix}`, (initial + 2000n).toString());
  await pageA.reload();
  await expect(pageA.getByLabel("Name", { exact: true })).toHaveValue(
    `Alpha ${suffix}`,
  );
  await pageA.getByLabel("Amount in sats").fill("3000");
  await pageA.getByRole("checkbox").check();
  await pageA
    .getByRole("button", { name: /CREATE LIGHTNING INVOICE|ADD SATS/ })
    .click();
  await pageA.getByRole("button", { name: "SIMULATE PAYMENT" }).click();
  await expect(
    pageA.getByRole("dialog").getByText("Payment credited", { exact: true }),
  ).toBeVisible({ timeout: 20000 });
  await pageA.getByRole("button", { name: "Close payment" }).click();
  await pageA.goto("/");
  await expect(pageA.locator(".bid-top-name")).toContainText(`Alpha ${suffix}`);
  for (const width of [360, 768, 1440]) {
    await pageA.setViewportSize({ width, height: 1000 });
    expect(
      await pageA.evaluate(
        () => document.documentElement.scrollWidth - innerWidth,
      ),
    ).toBeLessThanOrEqual(1);
  }
  await pageA.screenshot({
    path: "/tmp/pricebtc-sats-home.png",
    fullPage: true,
  });
  await pageA.setViewportSize({ width: 360, height: 800 });
  await pageA.screenshot({
    path: "/tmp/pricebtc-sats-mobile.png",
    fullPage: true,
  });
  await a.close();
  await b.close();
});

test("operator signs in, hides the leader across public pages and revokes access", async ({
  page,
  browser,
}) => {
  test.skip(
    !process.env.SATS_E2E_ADMIN_PASSWORD,
    "Requires generated local operator credentials",
  );
  test.setTimeout(120000);
  const board = await (
    await page.request.get("/api/sats-bid/leaderboard")
  ).json();
  const leader = board.leader;
  await page.goto("/admin");
  await page.getByLabel("Email", { exact: true }).fill("operator@example.com");
  await page
    .getByLabel("Password", { exact: true })
    .fill(process.env.SATS_E2E_ADMIN_PASSWORD!);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.getByRole("button", { name: "participants", exact: true }).click();
  const card = page.locator("article").filter({
    has: page.getByRole("heading", { name: leader.name, exact: true }),
  });
  await expect(card).toBeVisible();
  page.on(
    "dialog",
    (dialog) => void dialog.accept("Automated moderation verification"),
  );
  await card.getByRole("button", { name: "hide", exact: true }).click();
  await expect(card.locator("dd").filter({ hasText: /^true$/ })).toBeVisible();
  const publicContext = await browser.newContext();
  const publicPage = await publicContext.newPage();
  await publicPage.goto("/");
  await expect(publicPage.locator(".bid-top-name")).not.toContainText(
    leader.name,
  );
  await publicPage.goto(`/day/${board.round.date}`);
  await expect(
    publicPage.getByRole("heading", { name: /THE ROUND/ }),
  ).toBeVisible();
  await expect(publicPage.locator(".bid-ranking")).not.toContainText(
    leader.name,
  );
  await card.getByRole("button", { name: "unhide", exact: true }).click();
  await expect(card.locator("dd").filter({ hasText: /^false$/ })).toBeVisible();
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Sign in", exact: true }),
  ).toBeVisible();
  expect(
    (await page.request.get("/api/sats-bid/admin/payments")).status(),
  ).toBe(401);
  await publicContext.close();
});
