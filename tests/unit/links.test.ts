/**
 * Protects the rules for what can be shortened and the exact URL that's stored. These decide
 * where every link goes, so a mistake either sends people to the wrong place or lets abuse
 * through (loops back to syhr.sh, disguised credentials, chained shorteners, blocked sites).
 */
import { describe, expect, it } from "vitest";
import {
  evaluateLink,
  MAX_URL_LENGTH,
  parseDomain,
  parseLinkInput,
  REFUSAL_MESSAGES,
  type LinkPolicy,
  type Refusal,
} from "../../src/core/links.ts";

const policy: LinkPolicy = { ownHost: "syhr.sh", blockedDomains: new Set(["evil.example"]) };

const accepted = (input: string) => {
  const decision = evaluateLink(input, policy);
  if (!decision.ok) throw new Error(`"${input}" was refused: ${decision.refusal}`);
  return decision.url;
};

const refusal = (input: string): Refusal | null => {
  const decision = evaluateLink(input, policy);
  return decision.ok ? null : decision.refusal;
};

describe("normalisation", () => {
  it.each([
    ["example.com", "https://example.com/"],
    ["  example.com  ", "https://example.com/"],
    ["EXAMPLE.com/Path", "https://example.com/Path"],
    ["https://example.com:443/x", "https://example.com/x"],
    ["http://example.com:8080/x", "http://example.com:8080/x"],
    ["example.com:8080/x", "https://example.com:8080/x"],
    ["https://example.com/list?a=1&b=2", "https://example.com/list?a=1&b=2"],
    ["https://example.com/?q=one+two", "https://example.com/?q=one+two"],
    ["https://example.com/page#section", "https://example.com/page#section"],
    ["https://bücher.example/", "https://xn--bcher-kva.example/"],
  ])("stores %s as %s", (input, stored) => {
    expect(accepted(input)).toBe(stored);
  });

  it("treats spellings of the same address as one URL", () => {
    expect(accepted("example.com")).toBe(accepted("https://EXAMPLE.com/"));
  });
});

describe("refusals", () => {
  it.each<[string, Refusal]>([
    ["", "empty"],
    ["   ", "empty"],
    ["not a url", "invalid_url"],
    ["https://", "invalid_url"],
    ["ftp://example.com/file", "unsupported_scheme"],
    ["javascript:alert(1)", "unsupported_scheme"],
    ["JavaScript:alert(1)", "unsupported_scheme"],
    ["data:text/html,hi", "unsupported_scheme"],
    ["mailto:someone@example.com", "unsupported_scheme"],
    ["https://google.com@evil.example.org/", "has_credentials"],
    ["https://user:pass@example.com/", "has_credentials"],
    ["syhr.sh", "own_domain"],
    ["https://syhr.sh/kachow", "own_domain"],
    ["http://WWW.SYHR.SH/", "own_domain"],
    ["localhost:4000", "private_address"],
    ["http://192.168.0.1/admin", "private_address"],
    ["https://bit.ly/abc", "url_shortener"],
    ["https://www.tinyurl.com/abc", "url_shortener"],
    ["https://evil.example/", "blocked_domain"],
    ["https://login.evil.example/", "blocked_domain"],
  ])("refuses %s as %s", (input, expected) => {
    expect(refusal(input)).toBe(expected);
  });

  it("allows the owner's own domains even though they are short-link hosts", () => {
    expect(accepted("https://sy.hr/github")).toBe("https://sy.hr/github");
    expect(accepted("rhysbi.shop/linkedin")).toBe("https://rhysbi.shop/linkedin");
  });

  it("allows URLs up to the length limit, and no longer", () => {
    const base = "https://example.com/";
    expect(accepted(base + "a".repeat(MAX_URL_LENGTH - base.length))).toHaveLength(MAX_URL_LENGTH);
    expect(refusal(base + "a".repeat(MAX_URL_LENGTH - base.length + 1))).toBe("too_long");
    expect(refusal("x".repeat(100_000))).toBe("too_long");
  });

  it("has a message for every refusal", () => {
    for (const message of Object.values(REFUSAL_MESSAGES)) expect(message).toMatch(/\.$/);
  });
});

describe("parseLinkInput", () => {
  it("adds https:// only when no scheme was written", () => {
    expect(parseLinkInput("example.com")?.protocol).toBe("https:");
    expect(parseLinkInput("http://example.com")?.protocol).toBe("http:");
    expect(parseLinkInput("javascript:x")?.protocol).toBe("javascript:");
  });
});

describe("parseDomain", () => {
  it.each([
    ["Evil.Example", "evil.example"],
    ["https://evil.example/some/path", "evil.example"],
    ["evil.example.", "evil.example"],
  ])("reads %s as %s", (input, domain) => {
    expect(parseDomain(input)).toBe(domain);
  });

  it.each(["", "localhost", "ftp://evil.example", "not a domain"])("rejects %s", (input) => {
    expect(parseDomain(input)).toBeNull();
  });
});
