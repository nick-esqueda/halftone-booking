import { defineConfig, devices } from "@playwright/test";

// The API must already be running (see `make e2e`); Playwright starts Vite.
const WEB_PORT = 5173;
const BASE_URL = process.env.E2E_BASE_URL ?? `http://localhost:${WEB_PORT}`;
const STUDIO_TIMEZONE = "America/Chicago";
// A day ahead of the studio, to prove remote users book the right slot.
const REMOTE_TIMEZONE = "Asia/Tokyo";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  // The projects share one database and the same time slots, so run one at a time.
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: BASE_URL,
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "studio-timezone",
      use: { ...devices["Desktop Chrome"], timezoneId: STUDIO_TIMEZONE },
    },
    {
      name: "remote-timezone",
      use: { ...devices["Desktop Chrome"], timezoneId: REMOTE_TIMEZONE },
    },
  ],
  webServer: {
    command: `npx vite --port ${WEB_PORT} --strictPort`,
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
  },
});
