import { defineConfig, devices } from "@playwright/test";

// The API must already be running (see `make e2e`); Playwright starts Vite.
const WEB_PORT = 5173;
const BASE_URL = process.env.E2E_BASE_URL ?? `http://localhost:${WEB_PORT}`;
const STUDIO_TIMEZONE = "America/Chicago";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: BASE_URL,
    timezoneId: STUDIO_TIMEZONE,
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: `npx vite --port ${WEB_PORT} --strictPort`,
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
  },
});
