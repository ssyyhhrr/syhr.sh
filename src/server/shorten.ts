/**
 * Shortening a link for a visitor: apply the rules, charge the client's rate limit, then store
 * the link (or return the one already stored). The one place both the JSON API and the
 * no-JavaScript form go through, so they can't drift apart.
 */
import { evaluateLink, type Refusal } from "../core/links.ts";
import { rateLimitMessage } from "../core/rate-limit.ts";
import { linkPolicy, saveLink, type SavedLink } from "./links.ts";
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
  | SavedLink
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
  const decision = evaluateLink(input, linkPolicy(context.store, context.publicUrl));
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
  const saved = saveLink(context.store, decision.url, {
    publicUrl: context.publicUrl,
    now,
    randomBytes: context.randomBytes,
  });
  // Without a custom slug there's no slug problem to report.
  if (saved.kind === "slug_problem") throw new Error(`Unexpected slug problem: ${saved.problem}`);
  return saved;
}
