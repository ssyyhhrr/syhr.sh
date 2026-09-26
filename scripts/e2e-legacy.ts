/**
 * Runs the end-to-end suite against the pre-overhaul app (see tests/support/legacy.ts).
 * Extra arguments go to Playwright, e.g. `npm run test:e2e:legacy -- -g redirect`.
 *
 * A script rather than an inline `E2E_TARGET=legacy` so it works in Windows shells too.
 */
import { spawnSync } from "node:child_process";

const result = spawnSync("npx", ["playwright", "test", ...process.argv.slice(2)], {
  stdio: "inherit",
  env: { ...process.env, E2E_TARGET: "legacy" },
  shell: process.platform === "win32",
});
process.exit(result.status ?? 1);
