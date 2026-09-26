/**
 * End-to-end test configuration.
 *
 * Every spec runs at a desktop size and a phone size. Chromium always runs; WebKit (Safari's
 * engine) runs when `E2E_WEBKIT=1`, which CI sets. It is opt-in because WebKit can't be
 * downloaded in every environment the suite runs in.
 *
 * `E2E_TARGET` picks the app under test; see tests/e2e/support/target.ts.
 */
import { defineConfig, devices, type Project } from "@playwright/test";
import { chromiumLaunchOptions } from "./tests/support/browser.ts";
import { E2E_BASE_URL, e2eTarget } from "./tests/e2e/support/target.ts";

const desktop = { viewport: { width: 1440, height: 900 } };
// iPhone 13-sized: the most common phone size class.
const phone = { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true };

const projects: Project[] = [
  {
    name: "chromium-desktop",
    use: { ...devices["Desktop Chrome"], ...desktop, launchOptions: chromiumLaunchOptions() },
  },
  {
    name: "chromium-phone",
    use: { ...devices["Desktop Chrome"], ...phone, launchOptions: chromiumLaunchOptions() },
  },
];
if (process.env["E2E_WEBKIT"] === "1") {
  projects.push(
    { name: "webkit-desktop", use: { ...devices["Desktop Safari"], ...desktop } },
    { name: "webkit-phone", use: { ...devices["iPhone 13"] } },
  );
}

export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: true,
  forbidOnly: process.env["CI"] !== undefined,
  // No retries: a test that only passes on retry is a bug to fix, not noise to hide.
  retries: 0,
  reporter: process.env["CI"] ? [["list"], ["html", { open: "never" }]] : "list",
  use: { baseURL: E2E_BASE_URL, trace: "retain-on-failure" },
  projects,
  webServer: {
    command: "node tests/e2e/support/serve.ts",
    url: `${E2E_BASE_URL}/`,
    env: { E2E_TARGET: e2eTarget() },
    reuseExistingServer: false,
    // The first legacy run extracts and installs the old app, which takes a while.
    timeout: 180_000,
  },
});
