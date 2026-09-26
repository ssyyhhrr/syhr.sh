/**
 * What someone sees on arrival: the name, what the site does, and a form they can use straight
 * away with no account. This is the whole promise of the site ("paste, click, done"), so it is
 * checked first and at every screen size.
 */
import { expect, test } from "./support/fixtures.ts";
import { shortenButton, urlInput } from "./support/ui.ts";

test("the home page names the site and says what it does", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveTitle("syhr.sh");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("syhr.sh");
  await expect(page.getByText(/A simple web tool for creating short, memorable/)).toBeVisible();
  await expect(page.getByRole("link", { name: "syhr", exact: true }).first()).toHaveAttribute(
    "href",
    /^https:\/\/sy\.hr\/?$/,
  );
});

test("the shortener is usable immediately, with no sign-up", async ({ page }) => {
  await page.goto("/");
  await expect(urlInput(page)).toBeVisible();
  await expect(urlInput(page)).toBeEditable();
  await expect(shortenButton(page)).toBeEnabled();
  await expect(page.locator('input[type="password"]')).toHaveCount(0);
});

test("the favicon is served", async ({ request }) => {
  const response = await request.get("/favicon.ico");
  expect(response.status()).toBe(200);
  expect(response.headers()["content-type"]).toMatch(/image/);
});
