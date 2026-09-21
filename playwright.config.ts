import { defineConfig } from "@playwright/test";

const port = Number(process.env.E2E_PORT ?? 3466);

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 30_000,
  reporter: [["list"]],
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    headless: true,
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
    launchOptions: {
      executablePath: process.env.CHROMIUM_PATH ?? "/usr/bin/chromium",
      args: ["--no-sandbox", "--disable-dev-shm-usage", ...(process.env.CHROMIUM_LOW_MEMORY === "true" ? ["--disable-gpu", "--renderer-process-limit=2"] : [])],
    },
  },
  webServer: {
    command: "npm start",
    url: `http://127.0.0.1:${port}/healthz`,
    env: { PORT: String(port) },
    reuseExistingServer: true,
    timeout: 30_000,
  },
});
