import path from "node:path";
import { defineConfig, devices } from "@playwright/test";

// Deliberately not 3000: that is where the Clinical Bond desktop launcher serves
// the production build. `reuseExistingServer` would otherwise hand the suite that
// server, which correctly has no development sign-in — every test would fail for a
// reason that has nothing to do with the code under test.
const port = Number(process.env.PLAYWRIGHT_PORT || 3100);
const baseURL = process.env.PLAYWRIGHT_BASE_URL || `http://localhost:${port}`;

export default defineConfig({
  testDir: "./tests/browser",
  outputDir: "test-results/playwright",
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  timeout: 45_000,
  expect: {
    timeout: 7_500,
  },
  reporter: process.env.CI
    ? [["line"], ["html", { outputFolder: "playwright-report", open: "never" }]]
    : "list",
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
      },
    },
  ],
  webServer: {
    // The suite gets its own database. Sharing the default one meant browser runs
    // were signing notes and filing documents into the clinician's real records,
    // and accumulated state from earlier runs then changed how later runs behaved.
    env: {
      EHR_DATABASE_PATH: path.resolve(__dirname, "test-results/browser-ehr.db"),
    },
    command: `npm run dev -- --hostname 127.0.0.1 --port ${port}`,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    stdout: "pipe",
    stderr: "pipe",
  },
});
