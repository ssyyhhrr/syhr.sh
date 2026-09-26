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

test("an unknown short link is a 404 that says so", async ({ page, target }) => {
  test.skip(target === "legacy", "Changed in the overhaul: the old app answered 200.");
  const response = await page.goto("/doesNotExist123");
  expect(response?.status()).toBe(404);
  await expect(page).toHaveTitle(/Link not found/);
  await expect(page.getByText("That short link doesn't exist.")).toBeVisible();
});

test("redirects aren't cached, so a deleted link stops working at once", async ({
  page,
  request,
  target,
}) => {
  test.skip(target === "legacy", "Added in the overhaul.");
  await page.goto("/");
  const { slug } = await shortenOk(page, uniqueTarget());
  const response = await request.get(`/${slug}`, { maxRedirects: 0 });
  expect(response.headers()["cache-control"]).toBe("no-store");
});
