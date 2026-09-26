/**
 * Protects slug generation and validation. Slugs must be unguessably random and evenly spread
 * (so links can't be enumerated), unique, and custom slugs must never shadow the app's own
 * routes.
 */
import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  checkCustomSlug,
  generateSlug,
  looksLikeSlug,
  pickFreeSlug,
  shortUrlFor,
  SLUG_ALPHABET,
} from "../../src/core/slugs.ts";

describe("generateSlug", () => {
  it("makes 6 characters from the alphabet", () => {
    for (let i = 0; i < 200; i++) expect(generateSlug(randomBytes)).toMatch(/^[A-Za-z0-9]{6}$/);
  });

  it("skips bytes that would bias the distribution", () => {
    // 248+ would wrap onto the first 8 letters; they must be discarded, not folded in.
    const bytes = [250, 255, 248, 0, 61, 62, 247, 1, 2];
    const source = (count: number) => Uint8Array.from(bytes.splice(0, count));
    expect(generateSlug(source)).toBe(`A9A${SLUG_ALPHABET.charAt(247 % 62)}BC`);
  });

  it("keeps drawing when a batch runs out", () => {
    let calls = 0;
    const source = (count: number) => {
      calls++;
      return new Uint8Array(count).fill(calls === 1 ? 255 : 5);
    };
    expect(generateSlug(source)).toBe("FFFFFF");
    expect(calls).toBe(2);
  });

  it("uses every character with roughly equal frequency", () => {
    const counts = new Map<string, number>();
    for (let i = 0; i < 20_000; i++) {
      for (const char of generateSlug(randomBytes)) counts.set(char, (counts.get(char) ?? 0) + 1);
    }
    expect(counts.size).toBe(62);
    const expected = (20_000 * 6) / 62;
    for (const count of counts.values())
      expect(Math.abs(count - expected) / expected).toBeLessThan(0.15);
  });
});

describe("pickFreeSlug", () => {
  it("returns the first slug that isn't taken", () => {
    const candidates = ["aaaaaa", "bbbbbb", "cccccc"];
    const slug = pickFreeSlug(
      () => candidates.shift() ?? "",
      (s) => s !== "cccccc",
    );
    expect(slug).toBe("cccccc");
  });

  it("gives up rather than looping forever", () => {
    expect(() =>
      pickFreeSlug(
        () => "taken1",
        () => true,
        5,
      ),
    ).toThrow(/5 attempts/);
  });
});

describe("custom slugs", () => {
  it.each(["kachow", "my-link", "under_score", "A".repeat(64)])("accepts %s", (slug) => {
    expect(checkCustomSlug(slug)).toBeNull();
  });

  it.each<[string, string]>([
    ["", "invalid_characters"],
    ["has space", "invalid_characters"],
    ["dot.ted", "invalid_characters"],
    ["slash/ed", "invalid_characters"],
    ["émoji", "invalid_characters"],
    ["A".repeat(65), "too_long"],
    ["api", "reserved"],
    ["Assets", "reserved"],
    ["healthz", "reserved"],
  ])("rejects %j as %s", (slug, problem) => {
    expect(checkCustomSlug(slug)).toBe(problem);
  });

  it("recognises what could be a slug in a path", () => {
    expect(looksLikeSlug("Ab3dE9")).toBe(true);
    expect(looksLikeSlug("favicon.ico")).toBe(false);
  });
});

describe("shortUrlFor", () => {
  it("builds the link without a trailing slash", () => {
    expect(shortUrlFor("https://syhr.sh", "Ab3dE9")).toBe("https://syhr.sh/Ab3dE9");
    expect(shortUrlFor("http://localhost:4000", "x")).toBe("http://localhost:4000/x");
  });
});
