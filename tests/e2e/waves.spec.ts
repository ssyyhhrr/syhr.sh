/**
 * The wave background. It was kept on condition it stops wasting battery, so it must
 * animate normally, hold still for people who ask for reduced motion, and stop drawing while
 * the tab is hidden. Checked from the outside, by sampling the canvas's pixels over time.
 */
import type { Page } from "@playwright/test";
import { expect, test } from "./support/fixtures.ts";

test.skip(({ target }) => target === "legacy", "Motion controls were added in the overhaul.");

/** A cheap fingerprint of what's on the canvas right now. */
async function canvasFingerprint(page: Page): Promise<string> {
  return page.evaluate(() => {
    const canvas = document.querySelector<HTMLCanvasElement>("canvas.waves");
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return "no canvas";
    const { data } = context.getImageData(0, 0, canvas.width, canvas.height);
    let hash = 0;
    for (let i = 0; i < data.length; i += 4 * 97) hash = (hash * 31 + (data[i] ?? 0)) | 0;
    return `${canvas.width}x${canvas.height}:${hash}`;
  });
}

async function changesOver(page: Page, ms: number): Promise<boolean> {
  const before = await canvasFingerprint(page);
  await page.waitForTimeout(ms);
  return (await canvasFingerprint(page)) !== before;
}

test("the waves are drawn and keep moving", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("canvas.waves")).toBeVisible();
  expect(await changesOver(page, 800)).toBe(true);
});

test("the waves hold still under reduced motion", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await page.waitForTimeout(300);
  expect(await canvasFingerprint(page)).not.toBe("no canvas");
  expect(await changesOver(page, 800)).toBe(false);
  // Turning the setting off starts them again.
  await page.emulateMedia({ reducedMotion: "no-preference" });
  expect(await changesOver(page, 800)).toBe(true);
});

test("the waves stop while the tab is hidden and resume after", async ({ page }) => {
  await page.goto("/");
  const setHidden = (hidden: boolean) =>
    page.evaluate((value) => {
      Object.defineProperty(document, "hidden", { value, configurable: true });
      document.dispatchEvent(new Event("visibilitychange"));
    }, hidden);
  await setHidden(true);
  await page.waitForTimeout(100);
  expect(await changesOver(page, 800)).toBe(false);
  await setHidden(false);
  expect(await changesOver(page, 800)).toBe(true);
});

test("the canvas resolution is capped to spare phones", async ({ page }) => {
  await page.goto("/");
  const { width, cssWidth, ratio } = await page.evaluate(() => {
    const canvas = document.querySelector<HTMLCanvasElement>("canvas.waves");
    return {
      width: canvas?.width ?? 0,
      cssWidth: canvas?.clientWidth ?? 0,
      ratio: window.devicePixelRatio,
    };
  });
  expect(width / cssWidth).toBeLessThanOrEqual(Math.min(ratio, 1.5) + 0.01);
});
