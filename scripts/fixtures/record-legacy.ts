/**
 * Records how the pre-overhaul app treated a list of inputs, by typing each one into its page
 * in a real browser and following the link it produced. The result,
 * tests/fixtures/legacy-shorten.json, lets unit tests check the new URL rules against what the
 * old app really did, rather than against anyone's memory of it.
 *
 * Run with: npm run fixtures:legacy
 * Needs network access to example.com/.org/.net: the old server fetched every target first.
 * The browser side is isolated (tests/support/network.ts), so any other host counts as
 * unreachable, which is why the old page refuses "localhost" here.
 */
import { writeFileSync } from "node:fs";
import path from "node:path";
import { chromium, type Page } from "@playwright/test";
import { chromiumLaunchOptions } from "../../tests/support/browser.ts";
import { LEGACY_COMMIT, LEGACY_PORT, startLegacyApp } from "../../tests/support/legacy.ts";
import { isolateNetwork } from "../../tests/support/network.ts";

/** One recorded input. */
export interface LegacyShortenCase {
  /** What was typed into the box. */
  input: string;
  /** The URL the old page sent to the server, or null if it refused before sending. */
  submitted: string | null;
  outcome: "link" | "refused";
  /** Where the resulting short link redirected, when there was one. */
  redirectsTo: string | null;
}

const INPUTS = [
  "example.com",
  "https://example.com",
  "http://example.com",
  "EXAMPLE.COM",
  "example.com/",
  "example.com/path/to/page",
  "https://example.com:443/port",
  "https://example.org/search?q=one+two",
  "https://example.com/list?a=1&b=2",
  "https://example.net/page#section",
  "https://example.com/caf%C3%A9",
  "syhr.sh",
  "http://syhr.sh",
  "https://syhr.sh/kachow",
  "not a url",
  "localhost",
  "ftp://example.com",
  "javascript:alert(1)",
];

const origin = `http://127.0.0.1:${LEGACY_PORT}`;

async function waitForServer(): Promise<void> {
  for (let attempt = 0; attempt < 100; attempt++) {
    try {
      if ((await fetch(origin)).ok) return;
    } catch {
      // Not listening yet.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("The legacy app did not start");
}

async function record(page: Page, input: string): Promise<LegacyShortenCase> {
  await page.goto(origin);
  let submitted: string | null = null;
  page.on("request", (request) => {
    // The old page sent `url=<raw text>` without encoding it, so take the raw body verbatim.
    const body = request.postData();
    if (request.url().endsWith("/shorten") && body) submitted = body.replace(/^url=/, "");
  });
  const box = page.locator('input[name="url"]');
  const button = page.getByRole("button", { name: "Shorten" });
  await box.fill(input);
  await button.click();
  // The button is disabled while the page works and re-enabled on every outcome.
  while (!(await button.isEnabled())) await page.waitForTimeout(50);
  const shown = await box.inputValue();
  const slug = shown === input ? null : /^https:\/\/syhr\.sh\/([A-Za-z0-9]+)\/$/.exec(shown)?.[1];
  if (!slug) return { input, submitted, outcome: "refused", redirectsTo: null };
  const response = await fetch(`${origin}/${slug}`, { redirect: "manual" });
  return { input, submitted, outcome: "link", redirectsTo: response.headers.get("location") };
}

const server = startLegacyApp();
try {
  await waitForServer();
  const browser = await chromium.launch(chromiumLaunchOptions());
  const context = await browser.newContext();
  await isolateNetwork(context, origin, "legacy");
  const cases: LegacyShortenCase[] = [];
  for (const input of INPUTS) {
    const page = await context.newPage();
    cases.push(await record(page, input));
    await page.close();
  }
  await browser.close();
  const file = path.resolve(import.meta.dirname, "../../tests/fixtures/legacy-shorten.json");
  const fixture = {
    generatedBy: "scripts/fixtures/record-legacy.ts",
    commit: LEGACY_COMMIT,
    cases,
  };
  writeFileSync(file, `${JSON.stringify(fixture, null, 2)}\n`);
  console.log(`Wrote ${cases.length} cases to ${path.relative(process.cwd(), file)}`);
} finally {
  server.kill();
}
