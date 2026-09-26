/**
 * The result card: what someone gets after shortening. It replaced the old habit of
 * overwriting the input (the old page's worst annoyance), so it must show the link and where it
 * goes, keep what was pasted, and make the link easy to take away: Copy, Share on devices that
 * can, and a QR code that really scans to the short link.
 */
import jsqrModule from "jsqr";
import { PNG } from "pngjs";
import { expect, test } from "./support/fixtures.ts";
import { shortenOk, shortLink, uniqueTarget, urlInput } from "./support/ui.ts";

// jsqr is CommonJS with an __esModule default export. TypeScript (NodeNext) types the default
// import as the module object; Playwright's loader hands over the function itself. Accept both.
type JsQr = typeof jsqrModule.default;
const loaded: unknown = jsqrModule;
const jsQR = (typeof loaded === "function" ? loaded : jsqrModule.default) as JsQr;

test.skip(({ target }) => target === "legacy", "The result card was added in the overhaul.");

test.beforeEach(async ({ page }) => {
  await page.goto("/");
});

test("shows the short link and where it goes, keeping the pasted URL", async ({ page }) => {
  const target = uniqueTarget();
  const { link } = await shortenOk(page, target);
  await expect(shortLink(page)).toHaveAttribute("href", link);
  await expect(page.locator(".result-url")).toHaveText(target);
  await expect(urlInput(page)).toHaveValue(target);
  await expect(shortLink(page)).toBeFocused();
});

test("Copy puts the short link on the clipboard", async ({ page, context, browserName }) => {
  const { link } = await shortenOk(page, uniqueTarget());
  const copy = page.getByRole("button", { name: "Copy" });
  if (browserName === "chromium") {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  }
  await copy.click();
  await expect(page.getByRole("button", { name: "Copied" })).toBeVisible();
  if (browserName === "chromium") {
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(link);
  }
  // It goes back to "Copy" so it can be used again.
  await expect(page.getByRole("button", { name: "Copy" })).toBeVisible({ timeout: 4000 });
});

test("Share is offered only where the browser can share", async ({ page }) => {
  await shortenOk(page, uniqueTarget());
  const canShare = await page.evaluate(() => typeof navigator.share === "function");
  await expect(page.getByRole("button", { name: "Share" })).toBeVisible({ visible: canShare });
});

test("Share hands the short link to the system share sheet", async ({ page }) => {
  await page.addInitScript(() => {
    const shared: ShareData[] = [];
    Object.assign(window, { shared });
    Object.defineProperty(navigator, "share", {
      value: (data: ShareData) => {
        shared.push(data);
        return Promise.resolve();
      },
    });
    Object.defineProperty(navigator, "canShare", { value: () => true });
  });
  await page.goto("/");
  const { link } = await shortenOk(page, uniqueTarget());
  await page.getByRole("button", { name: "Share" }).click();
  const shared = await page.evaluate(() => (window as unknown as { shared: ShareData[] }).shared);
  expect(shared).toEqual([{ title: "syhr.sh", url: link }]);
});

test("the QR code scans to the short link", async ({ page }) => {
  const { link } = await shortenOk(page, uniqueTarget());
  const qr = page.getByRole("img", { name: "QR code for the short link" });
  await expect(qr).toBeVisible();
  const png = PNG.sync.read(await qr.screenshot());
  const decoded = jsQR(new Uint8ClampedArray(png.data), png.width, png.height);
  expect(decoded?.data).toBe(link);
});

test("'Shorten another' clears the way for the next link", async ({ page }) => {
  await shortenOk(page, uniqueTarget());
  await page.getByRole("link", { name: "Shorten another" }).click();
  await expect(page.locator(".result")).toBeHidden();
  await expect(urlInput(page)).toHaveValue("");
  await expect(urlInput(page)).toBeFocused();
  await expect(page).toHaveURL(/\/$/);
});

test("a second shorten replaces the first result", async ({ page }) => {
  const first = await shortenOk(page, uniqueTarget());
  const second = await shortenOk(page, uniqueTarget());
  expect(second.link).not.toBe(first.link);
  await expect(page.locator(".short-link")).toHaveCount(1);
  await expect(shortLink(page)).toHaveText(second.link);
});
