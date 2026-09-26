/**
 * Unit tests (pure core logic) and API tests (the HTTP app and CLI against a real SQLite file).
 * Browser tests are Playwright's; see playwright.config.ts.
 */
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/unit/**/*.test.ts", "tests/api/**/*.test.ts"],
    // API tests spawn real processes (the CLI); give them room on slow machines.
    testTimeout: 20_000,
  },
});
