/**
 * The page's frame at desktop and phone sizes: sy.hr's footer row with working links and
 * tooltips, the self-hosted font, nothing overflowing sideways, and nothing overlapping. These
 * are the things that break silently when CSS changes.
 */
import { expect, test } from "./support/fixtures.ts";

test.skip(({ target }) => target === "legacy", "The layout was redesigned in the overhaul.");

test.beforeEach(async ({ page }) => {
  await page.goto("/");
});

test("the footer has sy.hr's profile links, with tooltips", async ({ page }) => {
  const profiles = page.getByRole("list", { name: "syhr elsewhere" }).getByRole("link");
  await expect(profiles).toHaveCount(8);
  const expected: [string, string][] = [
    ["Discord: sy.hr", "https://sy.hr/discord"],
    ["GitHub: syhr", "https://sy.hr/github"],
    ["Letterboxd: sy_hr", "https://sy.hr/letterboxd"],
    ["Spotify: syhr", "https://sy.hr/spotify"],
    ["Steam: syhr", "https://sy.hr/steam"],
    ["TryHackMe: sy.hr", "https://sy.hr/tryhackme"],
    ["YouTube: syhr", "https://sy.hr/youtube"],
    ["Email: mail@rhysbi.shop", "mailto:mail@rhysbi.shop"],
  ];
  for (const [index, [name, href]] of expected.entries()) {
    await expect(profiles.nth(index)).toHaveAccessibleName(name);
    await expect(profiles.nth(index)).toHaveAttribute("href", href);
  }
  // Keyboard focus shows the username.
  await profiles.nth(1).focus();
  await expect(profiles.nth(1).locator(".tooltip-text")).toBeVisible();
  await expect(page.getByRole("link", { name: "syhr", exact: true }).last()).toHaveAttribute(
    "href",
    "https://sy.hr",
  );
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
