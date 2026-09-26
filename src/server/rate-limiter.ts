/**
 * Holds each client's recent link creations in memory and applies the rules in
 * core/rate-limit.ts.
 *
 * In memory is enough: the app runs as one process, and losing the counts on restart only
 * forgives a few minutes of history.
 */
import { consumeRateLimits, type RateLimit, type RateLimitDecision } from "../core/rate-limit.ts";

/** Per-client limiter for one action (creating links). */
export class RateLimiter {
  readonly #limits: readonly RateLimit[];
  readonly #history = new Map<string, number[]>();
  #lastSweep = 0;

  constructor(limits: readonly RateLimit[]) {
    this.#limits = limits;
  }

  /** Records one attempt by `key` at `now` if it fits the limits, and says whether it did. */
  consume(key: string, now: number): RateLimitDecision {
    this.#sweep(now);
    const decision = consumeRateLimits(this.#history.get(key) ?? [], now, this.#limits);
    this.#history.set(key, decision.history);
    return decision;
  }

  /**
   * Drops clients with nothing left in any window, at most once a minute, so a stream of
   * one-off visitors can't grow the map forever.
   */
  #sweep(now: number): void {
    if (now - this.#lastSweep < 60_000) return;
    this.#lastSweep = now;
    const longest = Math.max(...this.#limits.map((limit) => limit.windowMs));
    for (const [key, history] of this.#history) {
      if (history.every((at) => at <= now - longest)) this.#history.delete(key);
    }
  }

  /** How many clients are being tracked (for tests). */
  get size(): number {
    return this.#history.size;
  }
}
