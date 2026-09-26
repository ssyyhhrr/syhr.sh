/**
 * How a person uses the shortener, expressed once so the specs read as behaviour rather than
 * selectors. When the page's markup changes, only this file should need to follow.
 *
 * The old app (E2E_TARGET=legacy) showed results by replacing the text in the box and refused
 * silently with a shake; the new one shows a result card or an error message. Both are
 * supported so the kept behaviours can still be checked against the old app.
 */
import { expect, type Page } from "@playwright/test";
import { e2eTarget, PUBLIC_ORIGIN } from "./target.ts";

/** What happened when someone tried to shorten a link. */
export type ShortenOutcome =
  { kind: "link"; link: string; slug: string } | { kind: "refused"; message: string };

const shortLinkPattern = /^https:\/\/syhr\.sh\/([A-Za-z0-9]+)\/?$/;

/** The box people paste into. */
export function urlInput(page: Page) {
  return page.getByRole("textbox", { name: "Long link" }).or(page.locator('input[name="url"]'));
}

/** The button that shortens. */
export function shortenButton(page: Page) {
  return page.getByRole("button", { name: "Shorten", exact: true });
}

/** The short link shown after shortening. */
export function shortLink(page: Page) {
  return page.locator(".result .short-link");
}

/** The message explaining why a link was refused. */
export function formError(page: Page) {
  return page.getByRole("alert");
}

async function shortenOnLegacy(page: Page, text: string): Promise<ShortenOutcome> {
  await urlInput(page).fill(text);
  await shortenButton(page).click();
  // The old page disables the button while working and re-enables it on every outcome. It
  // shows the short link in place of what was typed, and leaves the text alone on refusal.
  await expect(shortenButton(page)).toBeEnabled({ timeout: 15_000 });
  const shown = await urlInput(page).inputValue();
  const match = shown === text ? null : shortLinkPattern.exec(shown);
  return match?.[1]
    ? { kind: "link", link: shown, slug: match[1] }
    : { kind: "refused", message: "" };
}

/**
 * Types `text` into the box, presses Shorten and waits for the outcome: a short link, or a
 * message saying why not.
 */
export async function shorten(page: Page, text: string): Promise<ShortenOutcome> {
  if (e2eTarget() === "legacy") return shortenOnLegacy(page, text);
  await urlInput(page).fill(text);
  await shortenButton(page).click();
  // The alert is always in the page (empty until there's something to say) and the result
  // card is hidden until there's a link, so wait for whichever becomes visible with content.
  const visibleLink = shortLink(page).filter({ visible: true });
  const visibleError = formError(page).filter({ visible: true, hasText: /\S/ });
  await expect(visibleLink.or(visibleError)).toBeVisible();
  if (await shortLink(page).isVisible()) {
    const link = (await shortLink(page).textContent()) ?? "";
    const slug = shortLinkPattern.exec(link)?.[1] ?? "";
    return { kind: "link", link, slug };
  }
  return { kind: "refused", message: (await formError(page).textContent()) ?? "" };
}

/** Shortens `text` and fails the test unless a short link comes back. */
export async function shortenOk(page: Page, text: string): Promise<{ link: string; slug: string }> {
  const outcome = await shorten(page, text);
  if (outcome.kind !== "link") {
    throw new Error(`Expected a short link for "${text}", got: ${outcome.message}`);
  }
  expect(outcome.link.startsWith(`${PUBLIC_ORIGIN}/`)).toBe(true);
  return outcome;
}

/** A unique URL on a test host, so tests don't see each other's links. */
export function uniqueTarget(host = "example.com"): string {
  return `https://${host}/e2e/${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}
