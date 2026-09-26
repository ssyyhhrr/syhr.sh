/**
 * Starts the app under test for Playwright's `webServer` (see playwright.config.ts) and stops
 * it when Playwright does.
 *
 * The new app gets a fresh database in a temporary directory, the production PUBLIC_URL (so
 * "links to syhr.sh" means what it does in production), and rate limits high enough that the
 * suite's own traffic never trips them; the limits have their own API tests.
 */
import { spawn, type ChildProcess } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { startLegacyApp } from "../../support/legacy.ts";
import { E2E_PORT, e2eTarget, PUBLIC_ORIGIN } from "./target.ts";

const repoRoot = path.resolve(import.meta.dirname, "../../..");

function startNewApp(): { child: ChildProcess; cleanUp: () => void } {
  const dataDir = mkdtempSync(path.join(tmpdir(), "syhr-e2e-"));
  const child = spawn(process.execPath, ["src/server/main.ts"], {
    cwd: repoRoot,
    stdio: "inherit",
    env: {
      ...process.env,
      PORT: String(E2E_PORT),
      HOST: "127.0.0.1",
      PUBLIC_URL: PUBLIC_ORIGIN,
      DATABASE_PATH: path.join(dataDir, "e2e.db"),
      RATE_LIMIT_PER_MINUTE: "100000",
      RATE_LIMIT_PER_DAY: "1000000",
    },
  });
  const cleanUp = () => {
    rmSync(dataDir, { recursive: true, force: true });
  };
  return { child, cleanUp };
}

const { child, cleanUp } =
  e2eTarget() === "legacy" ? { child: startLegacyApp(), cleanUp: () => undefined } : startNewApp();

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => child.kill(signal));
}
child.on("exit", (code) => {
  cleanUp();
  process.exit(code ?? 0);
});
