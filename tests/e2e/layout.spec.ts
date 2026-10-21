/**
 * The page's frame at desktop and phone sizes: sy.hr's footer with working links, the
 * self-hosted font, nothing overflowing sideways, and nothing overlapping. These
 * are the things that break silently when CSS changes.
 */
import { expect, test } from "./support/fixtures.ts";

test.skip(({ target }) => target === "legacy", "The layout was redesigned in the overhaul.");

test.beforeEach(async ({ page }) => {
  await page.goto("/");
});

test("the footer has sy.hr's links", async ({ page }) => {
  const footer = page.locator("footer");
  await expect(footer).toContainText("© syhr");
  const more = footer.getByRole("link", { name: "Looking for more? sy.hr" });
  await expect(more).toHaveAttribute("href", "https://sy.hr");
  await expect(more).toHaveAttribute("target", "_blank");
  // Not a new tab: that would leave an empty one behind as the mail app opens.
  const email = footer.getByRole("link", { name: "mail@rhysbi.shop" });
  await expect(email).toHaveAttribute("href", "mailto:mail@rhysbi.shop");
  await expect(email).not.toHaveAttribute("target", /./);
});

test("the page uses the self-hosted Raleway", async ({ page }) => {
  await page.evaluate(() => document.fonts.ready);
  expect(await page.evaluate(() => document.fonts.check("800 16px Raleway"))).toBe(true);
  await expect(page.locator(".title")).toHaveCSS("font-family", /Raleway/);
});

test("nothing overflows sideways", async ({ page }) => {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
});

test("the form sits above the footer without overlapping it", async ({ page }) => {
  const form = await page.locator("form.shorten").boundingBox();
  const footer = await page.locator("footer").boundingBox();
  expect(form && footer && form.y + form.height <= footer.y).toBe(true);
});

test("the page is marked as scripted, revealing script-only controls", async ({ page }) => {
  await expect(page.locator("html")).toHaveClass(/\bjs\b/);
  await expect(page.locator("html")).not.toHaveClass(/no-js/);
});
