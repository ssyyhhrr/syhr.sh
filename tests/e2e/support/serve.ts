/**
 * Starts the app under test for Playwright's `webServer` (see playwright.config.ts) and stops
 * it when Playwright does.
 */
import { startLegacyApp } from "../../support/legacy.ts";
import { e2eTarget } from "./target.ts";

const target = e2eTarget();
if (target !== "legacy") throw new Error(`No server for E2E target "${target}" yet`);

const child = startLegacyApp();
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => child.kill(signal));
}
child.on("exit", (code) => process.exit(code ?? 0));
