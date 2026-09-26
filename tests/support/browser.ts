/**
 * Browser launch settings shared by the Playwright tests and scripts.
 *
 * Some environments (notably sandboxed containers) ship a Chromium build that doesn't match the
 * installed Playwright version and can't download another. Setting
 * `PLAYWRIGHT_CHROMIUM_EXECUTABLE` points Playwright at that binary instead.
 */
import type { LaunchOptions } from "@playwright/test";

/** Launch options for Chromium, honouring `PLAYWRIGHT_CHROMIUM_EXECUTABLE` when set. */
export function chromiumLaunchOptions(): LaunchOptions {
  const executablePath = process.env["PLAYWRIGHT_CHROMIUM_EXECUTABLE"];
  return executablePath ? { executablePath } : {};
}
