/**
 * Creating a short link: apply the rules, reuse the existing link for a URL we've seen, or
 * store a new one under a free random slug. The one place both the JSON API and the
 * no-JavaScript form go through, so they can't drift apart.
 */
import { evaluateLink, type Refusal } from "../core/links.ts";
import { rateLimitMessage } from "../core/rate-limit.ts";
import { generateSlug, pickFreeSlug, shortUrlFor } from "../core/slugs.ts";
import type { RateLimiter } from "./rate-limiter.ts";
import type { Store } from "./store.ts";

/** What shortening needs from the rest of the app. */
export interface ShortenContext {
  store: Store;
  limiter: RateLimiter;
  publicUrl: string;
  now: () => number;
  randomBytes: (count: number) => Uint8Array;
}

/** The outcome of one attempt to shorten a link. */
export type ShortenResult =
  | { kind: "created" | "existing"; slug: string; shortUrl: string; url: string }
  | { kind: "refused"; refusal: Refusal }
  | { kind: "rate_limited"; retryAfterMs: number; message: string };

/**
 * Shortens `input` on behalf of the client identified by `clientKey`.
 *
 * Only attempts that pass the rules count towards the rate limit: a typo shouldn't use up
 * someone's allowance, and refusing costs almost nothing. Returning an existing link does
 * count, so the limit also bounds how fast one client can probe what's stored.
 */
export function shortenLink(
  context: ShortenContext,
  input: string,
  clientKey: string,
): ShortenResult {
  const { store } = context;
  const decision = evaluateLink(input, {
    ownHost: new URL(context.publicUrl).hostname,
    blockedDomains: store.blockedDomainSet(),
  });
  if (!decision.ok) return { kind: "refused", refusal: decision.refusal };

  const now = context.now();
  const allowance = context.limiter.consume(clientKey, now);
  if (!allowance.allowed) {
    return {
      kind: "rate_limited",
      retryAfterMs: allowance.retryAfterMs,
      message: rateLimitMessage(allowance.retryAfterMs),
    };
  }

  const existing = store.findByUrl(decision.url);
  if (existing) {
    return {
      kind: "existing",
      slug: existing.slug,
      shortUrl: shortUrlFor(context.publicUrl, existing.slug),
      url: existing.url,
    };
  }
  const slug = pickFreeSlug(
    () => generateSlug(context.randomBytes),
    (candidate) => store.hasSlug(candidate),
  );
  store.addLink({ slug, url: decision.url, createdAt: now });
  return {
    kind: "created",
    slug,
    shortUrl: shortUrlFor(context.publicUrl, slug),
    url: decision.url,
  };
}
