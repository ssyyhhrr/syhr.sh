/**
 * What people see when something goes wrong. The old page only shook the box; now every
 * failure must say, in words, what happened, and clear itself once the person starts fixing
 * it. Server refusals are covered in shorten.spec.ts; these are the cases the browser handles.
 */
import { expect, test } from "./support/fixtures.ts";
import { formError, shortenButton, uniqueTarget, urlInput } from "./support/ui.ts";

test.skip(({ target }) => target === "legacy", "Error messages were added in the overhaul.");

test.beforeEach(async ({ page }) => {
  await page.goto("/");
});

test("an empty box asks for a link without calling the server", async ({ page }) => {
  let calls = 0;
  page.on("request", (request) => {
    if (request.url().endsWith("/api/links")) calls++;
  });
  await shortenButton(page).click();
  await expect(formError(page)).toHaveText("Paste a link to shorten it.");
  await expect(urlInput(page)).toHaveAttribute("aria-invalid", "true");
  expect(calls).toBe(0);
});

test("the message clears as soon as the input is edited", async ({ page }) => {
  await urlInput(page).fill("not a url");
  await shortenButton(page).click();
  await expect(formError(page)).toHaveText(/valid web address/);
  // Focusing puts the caret at the start; move it to the end so Backspace deletes something.
  await urlInput(page).press("End");
  await urlInput(page).press("Backspace");
  await expect(formError(page)).toHaveText("");
  await expect(urlInput(page)).not.toHaveAttribute("aria-invalid", /.*/);
});

test("a network failure says so, and the form stays usable", async ({ page }) => {
  await page.route("**/api/links", (route) => route.abort("internetdisconnected"));
  await urlInput(page).fill(uniqueTarget());
  await shortenButton(page).click();
  await expect(formError(page)).toHaveText(/Couldn't reach syhr\.sh/);
  await expect(shortenButton(page)).toBeEnabled();
});

test("a server error gives a generic message rather than nothing", async ({ page }) => {
  await page.route("**/api/links", (route) =>
    route.fulfill({ status: 500, body: "Something went wrong.", contentType: "text/plain" }),
  );
  await urlInput(page).fill(uniqueTarget());
  await shortenButton(page).click();
  await expect(formError(page)).toHaveText(/Something went wrong on our side/);
});

test("the rate limit message comes through from the server", async ({ page }) => {
  await page.route("**/api/links", (route) =>
    route.fulfill({
      status: 429,
      contentType: "application/json",
      body: JSON.stringify({
        error: "rate_limited",
        message: "You've made a lot of links. Try again in 42 seconds.",
      }),
    }),
  );
  await urlInput(page).fill(uniqueTarget());
  await shortenButton(page).click();
  await expect(formError(page)).toHaveText("You've made a lot of links. Try again in 42 seconds.");
});

test("the button can't be pressed twice while a link is being made", async ({ page }) => {
  const { promise: held, resolve: release } = Promise.withResolvers<undefined>();
  let calls = 0;
  await page.route("**/api/links", async (route) => {
    calls++;
    await held;
    await route.continue();
  });
  await urlInput(page).fill(uniqueTarget());
  await shortenButton(page).click();
  await expect(shortenButton(page)).toBeDisabled();
  await expect(page.locator(".submit.is-busy")).toBeVisible();
  release(undefined);
  await expect(page.locator(".result .short-link")).toBeVisible();
  expect(calls).toBe(1);
});
