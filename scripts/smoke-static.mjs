import { chromium } from "@playwright/test";

const baseUrl = process.env.STATIC_BASE_URL ?? "http://127.0.0.1:4173";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function fetchText(path) {
  const response = await fetch(`${baseUrl}${path}`);
  assert(response.ok, `${path} returned ${response.status}`);
  return response.text();
}

const [homeHtml, studioHtml, embedHtml, overlayHtml, robots, sitemap, llms, notFoundHtml] = await Promise.all([
  fetchText("/"),
  fetchText("/studio/"),
  fetchText("/embed/"),
  fetchText("/overlay/"),
  fetchText("/robots.txt"),
  fetchText("/sitemap.xml"),
  fetchText("/llms.txt"),
  fetchText("/404.html"),
]);

assert(homeHtml.includes("FREE BITCOIN PRICE"), "Home lacks pre-rendered value proposition");
assert(homeHtml.includes("mailto:contact@foreign.rodeo"), "Home lacks inquiries email");
assert(homeHtml.includes('rel="canonical" href="https://priceb.tc/"'), "Home canonical is missing");
assert(homeHtml.includes('type="application/ld+json"'), "Home structured data is missing");
const schemaMatch = homeHtml.match(/<script[^>]+type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/);
assert(schemaMatch?.[1], "Home structured data payload is empty");
const schema = JSON.parse(schemaMatch[1]);
assert(
  schema["@graph"]?.some((entry) => entry["@type"] === "WebSite") &&
    schema["@graph"]?.some((entry) => entry["@type"] === "SoftwareApplication"),
  "Home structured data graph is incomplete",
);
assert(studioHtml.includes("Bitcoin Widget &amp; OBS Overlay Studio"), "Studio metadata is missing");
assert(studioHtml.includes("BUILD A BITCOIN"), "Studio lacks pre-rendered content");
assert(embedHtml.includes('content="noindex,follow,noarchive"'), "Embed renderer must be noindex");
assert(overlayHtml.includes('content="noindex,follow,noarchive"'), "Overlay renderer must be noindex");
assert(!embedHtml.includes('type="application/ld+json"'), "Embed renderer must not expose product schema");
assert(robots.includes("Sitemap: https://priceb.tc/sitemap.xml"), "robots.txt lacks sitemap reference");
assert(sitemap.includes("https://priceb.tc/studio"), "Sitemap lacks Studio");
assert(!sitemap.includes("/embed") && !sitemap.includes("/overlay"), "Sitemap contains renderer URLs");
assert(llms.includes("contact@foreign.rodeo") && llms.includes("Renderer URL contract"), "llms.txt is incomplete");
assert(notFoundHtml.includes('content="noindex,nofollow"'), "Static 404 must be noindex");
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH ?? "/usr/bin/chromium",
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});

try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

  await page.goto(`${baseUrl}/`, { waitUntil: "domcontentloaded" });
  await page.getByRole("link", { name: "contact@foreign.rodeo" }).waitFor({ state: "attached" });
  await page.waitForFunction(() => document.querySelector(".hero__price")?.textContent?.trim() !== "—", null, {
    timeout: 20_000,
  });
  await page.locator(".price-chart svg").waitFor({ state: "visible", timeout: 20_000 });

  await page.goto(`${baseUrl}/studio/?mode=embed`, { waitUntil: "domcontentloaded" });
  await page.locator('#studio-currency option[value="EUR"]').waitFor({ state: "attached", timeout: 20_000 });
  await page.getByRole("button", { name: "OBS OVERLAY" }).click();
  await page.getByLabel("Display currency").selectOption("EUR");
  await page.getByRole("button", { name: "Ticker bar" }).click();
  const rendererUrl = await page.getByLabel("BROWSER SOURCE URL").inputValue();
  if (!rendererUrl.includes("/overlay?") || !rendererUrl.includes("currency=EUR") || !rendererUrl.includes("layout=ticker")) {
    throw new Error(`Unexpected renderer URL: ${rendererUrl}`);
  }
  await page.getByRole("button", { name: "COPY URL" }).click();
  await page.getByRole("button", { name: "COPIED ✓" }).waitFor({ state: "visible" });
  await page.goto(rendererUrl, { waitUntil: "domcontentloaded" });
  await page.locator(".widget--ticker").waitFor({ state: "visible", timeout: 20_000 });
  await page.waitForFunction(() => {
    const label = document.querySelector(".widget__price")?.getAttribute("aria-label") ?? "";
    return label.startsWith("Bitcoin price ") && !/syncing|unavailable/i.test(label);
  }, null, {
    timeout: 20_000,
  });

  await page.goto(`${baseUrl}/overlay/?currency=USD&layout=lower-third&background=transparent&motion=none`, {
    waitUntil: "domcontentloaded",
  });
  await page.waitForFunction(() => {
    const label = document.querySelector(".widget__price")?.getAttribute("aria-label") ?? "";
    return label.startsWith("Bitcoin price ") && !/syncing|unavailable/i.test(label);
  }, null, {
    timeout: 20_000,
  });
  const backgrounds = await page.evaluate(() => ({
    html: getComputedStyle(document.documentElement).backgroundColor,
    body: getComputedStyle(document.body).backgroundColor,
  }));
  if (backgrounds.html !== "rgba(0, 0, 0, 0)" || backgrounds.body !== "rgba(0, 0, 0, 0)") {
    throw new Error(`Overlay is not transparent: ${JSON.stringify(backgrounds)}`);
  }

  process.stdout.write("Static smoke passed: pre-render, SEO assets, home, live data, chart, studio, export URL, overlay.\n");
} finally {
  await browser.close();
}
