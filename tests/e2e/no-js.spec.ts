/**
 * Shortening with JavaScript off (or blocked, or failed to load). The old site's button did
 * nothing at all if a CDN script failed; now the plain HTML form must work end to end on its
 * own, with the server rendering the result or the reason for refusing.
 */
import { expect, test } from "./support/fixtures.ts";
import { formError, shortenButton, shortLink, uniqueTarget, urlInput } from "./support/ui.ts";

test.skip(({ target }) => target === "legacy", "The old form needed JavaScript.");
test.use({ javaScriptEnabled: false });

test("the form shortens a link without JavaScript", async ({ page, request }) => {
  await page.goto("/");
  const target = uniqueTarget();
  await urlInput(page).fill(target);
  await shortenButton(page).click();
  await expect(shortLink(page)).toHaveText(/^https:\/\/syhr\.sh\/[A-Za-z0-9]{6}$/);
  await expect(page.locator(".result-url")).toHaveText(target);
  // Copy and the QR code need the script, so they're not offered.
  await expect(page.getByRole("button", { name: "Copy" })).toBeHidden();
  await expect(page.locator(".qr")).toBeHidden();

  const slug = new URL((await shortLink(page).textContent()) ?? "").pathname;
  const response = await request.get(slug, { maxRedirects: 0 });
  expect(response.headers()["location"]).toBe(target);
});

test("refusals are explained without JavaScript", async ({ page }) => {
  await page.goto("/");
  await urlInput(page).fill("https://syhr.sh/kachow");
  await shortenButton(page).click();
  await expect(formError(page)).toHaveText("Links to syhr.sh can't be shortened again.");
  await expect(urlInput(page)).toHaveValue("https://syhr.sh/kachow");
});

test("'Shorten another' goes back to an empty form", async ({ page }) => {
  await page.goto("/");
  await urlInput(page).fill(uniqueTarget());
  await shortenButton(page).click();
  // Wait for the server's page to replace this one before clicking on it.
  await expect(shortLink(page)).toBeVisible();
  // Keyboard, not click(): with JavaScript disabled, Playwright's click "stability" check
  // never settles on an element that has run a CSS animation (the card's entrance), and
  // times out. People aren't affected; Enter on a focused link is a real way to follow it.
  await page.getByRole("link", { name: "Shorten another" }).press("Enter");
  await expect(urlInput(page)).toHaveValue("");
  await expect(page.locator(".result")).toBeHidden();
});
