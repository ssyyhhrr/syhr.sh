/**
 * Following a short link. This is what every recipient of a link does, so it must keep
 * working: the slug redirects to the stored URL, with or without the trailing slash the old
 * links carried.
 */
import { expect, test } from "./support/fixtures.ts";
import { shortenOk, uniqueTarget, urlInput } from "./support/ui.ts";

test("a short link redirects to its URL", async ({ page, request }) => {
  await page.goto("/");
  const target = uniqueTarget("example.net");
  const { slug } = await shortenOk(page, target);

  const response = await request.get(`/${slug}`, { maxRedirects: 0 });
  expect(response.status()).toBe(302);
  expect(response.headers()["location"]).toBe(target);
});

test("a short link with a trailing slash still redirects", async ({ page, request }) => {
  await page.goto("/");
  const target = uniqueTarget();
  const { slug } = await shortenOk(page, target);

  const response = await request.get(`/${slug}/`, { maxRedirects: 0 });
  expect(response.status()).toBe(302);
  expect(response.headers()["location"]).toBe(target);
});

test("an unknown short link still offers the shortener", async ({ page }) => {
  await page.goto("/doesNotExist123");
  await expect(urlInput(page)).toBeVisible();
});
