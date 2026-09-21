import dns from "node:dns";
import path from "node:path";
import { defineConfig, devices } from "@playwright/test";

// Prefer IPv4 for localhost lookups to match next dev --hostname 127.0.0.1
dns.setDefaultResultOrder("ipv4first");

// Deliberately not 3000: that is where the Clinical Bond desktop launcher serves
// the production build. `reuseExistingServer` would otherwise hand the suite that
// server, which correctly has no development sign-in — every test would fail for a
// reason that has nothing to do with the code under test.
const port = Number(process.env.PLAYWRIGHT_PORT || 3100);
const baseURL = process.env.PLAYWRIGHT_BASE_URL || `http://127.0.0.1:${port}`;

export default defineConfig({
  testDir: "./tests/browser",
  // Turbopack compiles routes on demand, so without this the first spec to open the
  // dashboard pays for compiling them inside its own timeout. No assertion or
  // timeout changes; first-compile cost just stops being part of the measurement.
  globalSetup: require.resolve("./tests/browser/warm-dev-routes"),
  // `next dev` rewrites next-env.d.ts to name the build directory it used, and the
  // suite deliberately uses its own. Put the committed file back afterwards.
  globalTeardown: require.resolve("./tests/browser/restore-next-env"),
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
    trace: process.env.CI ? "retain-on-failure" : "on-first-retry",
    screenshot: "only-on-failure",
    video: process.env.CI ? "retain-on-failure" : "off",
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
      // Tells next.config.ts this is the suite's server: its own build directory,
      // so an already-running local dev server does not make the whole suite
      // unrunnable, and no dev-tools overlay over the workspace chrome.
      EHR_BROWSER_SUITE: "1",
      // Restrain Turbopack/V8 heap growth on developer machines so dev server does
      // not exhaust host RAM across large suites.
      NODE_OPTIONS: process.env.NODE_OPTIONS || "--max-old-space-size=2048",
    },
    command: `npm run dev -- --hostname 127.0.0.1 --port ${port}`,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    stdout: process.env.EHR_DEV_STDOUT ? "pipe" : "ignore",
    stderr: "pipe",
  },
});
