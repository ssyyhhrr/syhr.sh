/**
 * Checks the new link rules against what the pre-overhaul app actually did, as recorded from
 * the old page by scripts/fixtures/record-legacy.ts. Every link the old site accepted must
 * still be accepted and go to the same place (minus the two old bugs, which are asserted to be
 * the only differences), and everything it refused must still be refused.
 */
import { describe, expect, it } from "vitest";
import { evaluateLink } from "../../src/core/links.ts";
import fixture from "../fixtures/legacy-shorten.json" with { type: "json" };

const policy = { ownHost: "syhr.sh", blockedDomains: new Set<string>() };

describe("legacy behaviour", () => {
  const accepted = fixture.cases.filter((c) => c.outcome === "link");
  const refused = fixture.cases.filter((c) => c.outcome === "refused");

  it("covers both outcomes", () => {
    expect(accepted.length).toBeGreaterThan(5);
    expect(refused.length).toBeGreaterThan(3);
  });

  it.each(accepted)("still accepts $input, keeping everything the page sent", (c) => {
    const decision = evaluateLink(c.input, policy);
    expect(decision.ok).toBe(true);
    // The old page added https:// and sent the result; the new rules store the same URL in
    // its canonical spelling.
    if (decision.ok) expect(decision.url).toBe(new URL(c.submitted ?? "").href);
  });

  it("only differs from the old redirects where the old app lost part of the URL", () => {
    const changed = accepted.filter(
      (c) => new URL(c.redirectsTo ?? "").href !== new URL(c.submitted ?? "").href,
    );
    // '&' cut the URL short and '+' became a space: both came from posting it unencoded.
    expect(changed.map((c) => c.input)).toEqual([
      "https://example.org/search?q=one+two",
      "https://example.com/list?a=1&b=2",
    ]);
  });

  it.each(refused)("still refuses $input", (c) => {
    expect(evaluateLink(c.input, policy).ok).toBe(false);
  });
});
