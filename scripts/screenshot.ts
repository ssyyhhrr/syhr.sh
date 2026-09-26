/**
 * Regenerates the README's screenshots (docs/screenshot-desktop.png and
 * docs/screenshot-phone.png) from the real app: builds it, starts it on a throwaway database,
 * shortens a link and captures the result at desktop and phone sizes.
 *
 * Reduced motion is emulated so the waves hold one still frame and the images only change when
 * the page does. Run with: npm run screenshots
 */
import { execFileSync, spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { chromium } from "@playwright/test";
import { chromiumLaunchOptions } from "../tests/support/browser.ts";
import { buildAssets } from "./build.ts";

const root = path.resolve(import.meta.dirname, "..");
const port = 4310;
const base = `http://127.0.0.1:${port}`;

await buildAssets();
const dataDir = mkdtempSync(path.join(tmpdir(), "syhr-shots-"));
const env = {
  ...process.env,
  PORT: String(port),
  HOST: "127.0.0.1",
  DATABASE_PATH: path.join(dataDir, "db"),
};
const exampleUrl = "https://github.com/ssyyhhrr/syhr.sh";
const server = spawn(process.execPath, ["src/server/main.ts"], { cwd: root, stdio: "ignore", env });

try {
  for (let i = 0; i < 100; i++) {
    const up = await fetch(`${base}/healthz`).then(
      (r) => r.ok,
      () => false,
    );
    if (up) break;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  // Store the example link under a fixed slug (the server has created the database by now).
  // Shortening it in the page then returns that link (dedup), so the images don't change with
  // every random slug.
  execFileSync(
    process.execPath,
    ["src/cli/main.ts", "links", "add", exampleUrl, "--slug", "Ab3dE9"],
    { cwd: root, env },
  );
  const browser = await chromium.launch(chromiumLaunchOptions());
  const sizes = {
    desktop: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 },
    phone: {
      viewport: { width: 390, height: 844 },
      deviceScaleFactor: 2,
      isMobile: true,
      hasTouch: true,
    },
  };
  for (const [name, options] of Object.entries(sizes)) {
    const context = await browser.newContext({ ...options, reducedMotion: "reduce" });
    const page = await context.newPage();
    await page.goto(base);
    await page.getByRole("textbox", { name: "Long link" }).fill(exampleUrl);
    await page.getByRole("button", { name: "Shorten", exact: true }).click();
    await page.locator(".result .short-link").waitFor();
    // Park the focus and pointer so no hover or focus ring shows in the picture.
    await page.locator("body").click({ position: { x: 5, y: 5 } });
    // A string, because this file is type-checked for Node, without DOM globals.
    await page.evaluate("document.fonts.ready");
    await page.screenshot({ path: path.join(root, "docs", `screenshot-${name}.png`) });
    await context.close();
    console.log(`Wrote docs/screenshot-${name}.png`);
  }
  await browser.close();
} finally {
  server.kill();
  rmSync(dataDir, { recursive: true, force: true });
}
