/**
 * The owner's admin command against the running site: what they do with `syhr` on the server
 * must take effect for visitors straight away, with no restart. A custom slug redirects, a
 * deleted link shows the 404 page, and a blocked domain is refused in the browser.
 */
import { spawnSync } from "node:child_process";
import path from "node:path";
import { expect, test } from "./support/fixtures.ts";
import { E2E_DATABASE_PATH, PUBLIC_ORIGIN } from "./support/target.ts";
import { shorten, shortenOk, uniqueTarget } from "./support/ui.ts";

test.skip(({ target }) => target === "legacy", "The admin command was added in the overhaul.");

const root = path.resolve(import.meta.dirname, "../..");

function syhr(...args: string[]): string {
  const result = spawnSync(process.execPath, ["src/cli/main.ts", ...args], {
    cwd: root,
    encoding: "utf8",
    env: { ...process.env, DATABASE_PATH: E2E_DATABASE_PATH, PUBLIC_URL: PUBLIC_ORIGIN },
  });
  if (result.status !== 0) throw new Error(`syhr ${args.join(" ")} failed: ${result.stderr}`);
  return result.stdout;
}

/** A slug unique to this test run and project, so parallel projects don't collide. */
const uniqueSlug = (prefix: string) =>
  `${prefix}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

test("a custom slug added with the CLI redirects on the live site", async ({ request }) => {
  const slug = uniqueSlug("custom");
  const target = uniqueTarget();
  syhr("links", "add", target, "--slug", slug);
  const response = await request.get(`/${slug}`, { maxRedirects: 0 });
  expect(response.status()).toBe(302);
  expect(response.headers()["location"]).toBe(target);
});

test("a link deleted with the CLI shows the 404 page at once", async ({ page }) => {
  await page.goto("/");
  const { slug } = await shortenOk(page, uniqueTarget());
  syhr("links", "delete", slug);
  const response = await page.goto(`/${slug}`);
  expect(response?.status()).toBe(404);
  await expect(page.getByText("That short link doesn't exist.")).toBeVisible();
});

test("a domain blocked with the CLI is refused in the browser", async ({ page }) => {
  const domain = `${uniqueSlug("blocked")}.example.net`;
  syhr("domains", "block", domain);
  await page.goto("/");
  const outcome = await shorten(page, `https://www.${domain}/login`);
  expect(outcome).toEqual({
    kind: "refused",
    message: "Links to that site can't be shortened here.",
  });
});
