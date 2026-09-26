/**
 * Which app the end-to-end tests drive, and where it listens.
 *
 * `E2E_TARGET=legacy` runs the pre-overhaul app from git history (see tests/support/legacy.ts),
 * which is how the safety net was proven against the old code. `new` runs the current app.
 * Both are driven only from the outside (HTTP and a real browser), so the same specs apply.
 */

/** The app under test. */
export type E2eTarget = "legacy" | "new";

/** Reads `E2E_TARGET`, rejecting typos so a run can't silently test the wrong app. */
export function e2eTarget(): E2eTarget {
  // Until the new server exists (phase 3 of the overhaul), the old app is the default.
  const value = process.env["E2E_TARGET"] ?? "legacy";
  if (value === "legacy" || value === "new") return value;
  throw new Error(`E2E_TARGET must be "legacy" or "new", got "${value}"`);
}

/** Port the app under test listens on. The old app hard-codes 4000. */
export const E2E_PORT = 4000;

/** Base URL the tests talk to. */
export const E2E_BASE_URL = `http://127.0.0.1:${E2E_PORT}`;

/**
 * The site's public origin, as it appears in the short links the app hands out. Tests map links
 * back onto {@link E2E_BASE_URL} by path, so they never need the real domain to resolve.
 */
export const PUBLIC_ORIGIN = "https://syhr.sh";
