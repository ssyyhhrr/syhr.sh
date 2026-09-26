/**
 * Sliding-window rate limiting for creating links, so one client can't flood the database or
 * mass-produce links for spam.
 *
 * Pure: the caller keeps each client's history (a list of timestamps) and stores whatever this
 * returns, which keeps the rule testable without timers.
 */

/** At most `max` events per `windowMs`. */
export interface RateLimit {
  max: number;
  windowMs: number;
}

/** Outcome of {@link consumeRateLimits}. */
export interface RateLimitDecision {
  allowed: boolean;
  /** The history to store: events older than the longest window dropped, this one added if allowed. */
  history: number[];
  /** 0 when allowed; otherwise milliseconds until one more event would fit every window. */
  retryAfterMs: number;
}

/**
 * Decides whether one more event at `now` fits within every one of `limits` (for example 10 a
 * minute and 100 a day), given the timestamps of earlier events. Refused attempts are not
 * recorded, so a blocked client isn't locked out for longer just by retrying.
 */
export function consumeRateLimits(
  history: readonly number[],
  now: number,
  limits: readonly RateLimit[],
): RateLimitDecision {
  const longest = Math.max(0, ...limits.map((limit) => limit.windowMs));
  const kept = history.filter((at) => at > now - longest).sort((a, b) => a - b);
  let retryAfterMs = 0;
  for (const limit of limits) {
    const inWindow = kept.filter((at) => at > now - limit.windowMs);
    if (inWindow.length < limit.max) continue;
    // This window has room again once enough of its oldest events have aged out.
    const mustExpire = inWindow[inWindow.length - limit.max] ?? now;
    retryAfterMs = Math.max(retryAfterMs, mustExpire + limit.windowMs - now);
  }
  if (retryAfterMs > 0) return { allowed: false, history: kept, retryAfterMs };
  return { allowed: true, history: [...kept, now], retryAfterMs: 0 };
}

/**
 * Says how long to wait in words, rounded up so people never retry too early: "30 seconds",
 * "1 minute", "3 hours".
 */
export function describeWait(ms: number): string {
  const seconds = Math.max(1, Math.ceil(ms / 1000));
  const [amount, unit] =
    seconds < 120
      ? [seconds, "second"]
      : seconds < 2 * 3600
        ? [Math.ceil(seconds / 60), "minute"]
        : [Math.ceil(seconds / 3600), "hour"];
  return `${amount} ${unit}${amount === 1 ? "" : "s"}`;
}

/** The message shown when someone has made too many links. */
export function rateLimitMessage(retryAfterMs: number): string {
  return `You've made a lot of links. Try again in ${describeWait(retryAfterMs)}.`;
}
