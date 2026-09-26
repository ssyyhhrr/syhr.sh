/**
 * Protects the creation rate limit (10 a minute, 100 a day by default). Too loose and one
 * client can fill the database with spam links; too strict, or wrong about when to retry, and
 * real people get locked out.
 */
import { describe, expect, it } from "vitest";
import { consumeRateLimits, describeWait, type RateLimit } from "../../src/core/rate-limit.ts";

const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;
const limits: RateLimit[] = [
  { max: 10, windowMs: MINUTE },
  { max: 100, windowMs: DAY },
];

/** Replays events at the given times, returning the final history and decisions. */
function replay(times: number[]) {
  let history: number[] = [];
  return times.map((now) => {
    const decision = consumeRateLimits(history, now, limits);
    history = decision.history;
    return decision;
  });
}

describe("consumeRateLimits", () => {
  it("allows up to the per-minute limit, then refuses", () => {
    const decisions = replay(Array.from({ length: 11 }, (_, i) => i * 1000));
    expect(decisions.slice(0, 10).every((d) => d.allowed)).toBe(true);
    expect(decisions[10]?.allowed).toBe(false);
    // The first event (t=0) leaves the window at t=60s; the refusal happened at t=10s.
    expect(decisions[10]?.retryAfterMs).toBe(50_000);
  });

  it("allows again once the window has moved on", () => {
    const decisions = replay([...Array.from({ length: 10 }, () => 0), MINUTE + 1]);
    expect(decisions.at(-1)?.allowed).toBe(true);
  });

  it("does not count refused attempts", () => {
    const decisions = replay([...Array.from({ length: 10 }, () => 0), 1, 2, 3, MINUTE + 1]);
    expect(decisions.slice(10, 13).every((d) => !d.allowed)).toBe(true);
    expect(decisions.at(-1)?.allowed).toBe(true);
  });

  it("enforces the daily limit even when every minute is under its limit", () => {
    // 100 events, 10 per minute across 10 minutes, then one more in a fresh minute.
    const times = Array.from({ length: 100 }, (_, i) => Math.floor(i / 10) * MINUTE);
    const decisions = replay([...times, 20 * MINUTE]);
    expect(decisions.slice(0, 100).every((d) => d.allowed)).toBe(true);
    const last = decisions.at(-1);
    expect(last?.allowed).toBe(false);
    expect(last?.retryAfterMs).toBe(DAY - 20 * MINUTE);
  });

  it("forgets events older than the longest window", () => {
    const decision = consumeRateLimits([0, 1, 2], DAY + 10, limits);
    expect(decision.history).toEqual([DAY + 10]);
  });
});

describe("describeWait", () => {
  it.each([
    [0, "1 second"],
    [1, "1 second"],
    [1001, "2 seconds"],
    [59_000, "59 seconds"],
    [119_000, "119 seconds"],
    [120_000, "2 minutes"],
    [61 * MINUTE, "61 minutes"],
    [2 * 60 * MINUTE, "2 hours"],
    [DAY - 20 * MINUTE, "24 hours"],
  ])("describes %i ms as %s", (ms, words) => {
    expect(describeWait(ms)).toBe(words);
  });
});
