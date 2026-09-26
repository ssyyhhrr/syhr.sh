/**
 * How a person uses the shortener, expressed once so the specs read as behaviour rather than
 * selectors. When the page's markup changes, only this file should need to follow.
 */
import { expect, type Page } from "@playwright/test";
import { PUBLIC_ORIGIN } from "./target.ts";

/** What happened when someone tried to shorten a link. */
export type ShortenOutcome = { kind: "link"; link: string; slug: string } | { kind: "refused" };

const shortLinkPattern = /^https:\/\/syhr\.sh\/([A-Za-z0-9]+)\/?$/;

/** The box people paste into. */
export function urlInput(page: Page) {
  return page.locator('input[name="url"]');
}

/** The button that shortens. */
export function shortenButton(page: Page) {
  return page.getByRole("button", { name: "Shorten" });
}

/**
 * Types `text` into the box, presses Shorten and waits for the page to finish. The button is
 * disabled while a request is in flight and re-enabled on every outcome, which is the signal
 * that the page is done.
 */
export async function shorten(page: Page, text: string): Promise<ShortenOutcome> {
  await urlInput(page).fill(text);
  await shortenButton(page).click();
  await expect(shortenButton(page)).toBeEnabled({ timeout: 15_000 });
  // The old page shows the short link in place of what was typed, and leaves the text alone
  // when it refuses (which matters when the refused text is itself a syhr.sh link).
  const shown = await urlInput(page).inputValue();
  const match = shown === text ? null : shortLinkPattern.exec(shown);
  return match?.[1] ? { kind: "link", link: shown, slug: match[1] } : { kind: "refused" };
}

/** Shortens `text` and fails the test unless a short link comes back. */
export async function shortenOk(page: Page, text: string): Promise<{ link: string; slug: string }> {
  const outcome = await shorten(page, text);
  if (outcome.kind !== "link") throw new Error(`Expected a short link for "${text}"`);
  expect(outcome.link.startsWith(`${PUBLIC_ORIGIN}/`)).toBe(true);
  return outcome;
}

/** A unique URL on a test host, so tests don't see each other's links. */
export function uniqueTarget(host = "example.com"): string {
  return `https://${host}/e2e/${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}
