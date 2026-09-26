/**
 * Shortening through the page, the way a visitor does it. These are the behaviours kept
 * from the old app: short links on syhr.sh with a 6-character slug, `https://` added to bare
 * domains, one link per URL, and refusing links that would loop back to syhr.sh or aren't web
 * addresses at all.
 */
import { expect, test } from "./support/fixtures.ts";
import { shorten, shortenOk, uniqueTarget } from "./support/ui.ts";

test.beforeEach(async ({ page }) => {
  await page.goto("/");
});

test("shortening a URL gives a syhr.sh link with a 6-character slug", async ({ page }) => {
  const { link, slug } = await shortenOk(page, uniqueTarget());
  expect(slug).toMatch(/^[A-Za-z0-9]{6}$/);
  expect(link).toMatch(/^https:\/\/syhr\.sh\/[A-Za-z0-9]{6}\/?$/);
});

test("a bare domain is treated as https", async ({ page, request }) => {
  const { slug } = await shortenOk(page, "example.org");
  const response = await request.get(`/${slug}`, { maxRedirects: 0 });
  expect(new URL(response.headers()["location"] ?? "").href).toBe("https://example.org/");
});

test("shortening the same URL twice gives the same link", async ({ page }) => {
  const target = uniqueTarget();
  const first = await shortenOk(page, target);
  await page.goto("/");
  const second = await shortenOk(page, target);
  expect(second.slug).toBe(first.slug);
});

test("different URLs get different links", async ({ page }) => {
  const first = await shortenOk(page, uniqueTarget());
  await page.goto("/");
  const second = await shortenOk(page, uniqueTarget());
  expect(second.slug).not.toBe(first.slug);
});

test("links to syhr.sh itself are refused", async ({ page }) => {
  expect(await shorten(page, "https://syhr.sh/kachow")).toEqual({ kind: "refused" });
});

test("input that isn't a web address is refused", async ({ page }) => {
  expect(await shorten(page, "not a url")).toEqual({ kind: "refused" });
});

test("query strings survive shortening intact", async ({ page, request, target }) => {
  test.fail(
    target === "legacy",
    "Pre-overhaul bug: the page posted the URL unencoded, so everything after '&' was lost.",
  );
  const url = `${uniqueTarget()}?a=1&b=two+words#part`;
  const { slug } = await shortenOk(page, url);
  const response = await request.get(`/${slug}`, { maxRedirects: 0 });
  expect(response.headers()["location"]).toBe(url);
});
