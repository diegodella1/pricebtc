import { chromium } from "@playwright/test";

const baseUrl = process.env.VISUAL_BASE_URL ?? "http://127.0.0.1:3466";
const captures = [
  { name: "home", path: "/", width: 1440, height: 1000, fullPage: true },
  { name: "studio", path: "/studio?mode=embed", width: 1440, height: 1100, fullPage: true },
  {
    name: "embed",
    path: "/embed?v=1&currency=USD&layout=card&theme=dark&chart=1&range=24h",
    width: 960,
    height: 540,
    fullPage: false,
  },
  {
    name: "overlay",
    path: "/overlay?v=1&currency=EUR&layout=lower-third&background=transparent",
    width: 1280,
    height: 720,
    fullPage: false,
  },
];

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH ?? "/usr/bin/chromium",
  headless: true,
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});

try {
  for (const capture of captures) {
    const context = await browser.newContext({ viewport: { width: capture.width, height: capture.height } });
    const page = await context.newPage();
    await page.goto(`${baseUrl}${capture.path}`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(2_500);
    await page.screenshot({ path: `/tmp/pricebtc-${capture.name}.png`, fullPage: capture.fullPage });
    await context.close();
  }
} finally {
  await browser.close();
}
