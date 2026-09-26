/**
 * Protects the admin command's parsing and output. The owner types these on a server,
 * usually in a hurry (an abuse report), so a mistyped command must be rejected with a clear
 * message rather than doing something else, and the list must stay readable and copyable.
 */
import { describe, expect, it } from "vitest";
import {
  DEFAULT_LIST_LIMIT,
  formatLinkTable,
  parseCliArgs,
  type CliParse,
} from "../../src/core/cli.ts";

const command = (args: string[]) => {
  const parsed = parseCliArgs(args);
  if (!parsed.ok) throw new Error(parsed.error);
  return parsed.command;
};

const error = (args: string[]) => {
  const parsed: CliParse = parseCliArgs(args);
  return parsed.ok ? null : parsed.error;
};

describe("parseCliArgs", () => {
  it.each([[[]], [["help"]], [["--help"]], [["-h"]]])("shows help for %j", (args) => {
    expect(command(args)).toEqual({ kind: "help" });
  });

  it("parses every command", () => {
    expect(command(["links", "add", "example.com"])).toEqual({
      kind: "links-add",
      url: "example.com",
      slug: undefined,
    });
    expect(command(["links", "add", "example.com", "--slug", "kachow"])).toMatchObject({
      slug: "kachow",
    });
    expect(command(["links", "add", "--slug=kachow", "example.com"])).toMatchObject({
      url: "example.com",
      slug: "kachow",
    });
    expect(command(["links", "list"])).toEqual({
      kind: "links-list",
      search: undefined,
      limit: DEFAULT_LIST_LIMIT,
    });
    expect(command(["links", "list", "--search", "evil", "--limit", "5"])).toEqual({
      kind: "links-list",
      search: "evil",
      limit: 5,
    });
    expect(command(["links", "delete", "kachow"])).toEqual({
      kind: "links-delete",
      slug: "kachow",
    });
    expect(command(["domains", "block", "evil.example"])).toEqual({
      kind: "domains-block",
      domain: "evil.example",
    });
    expect(command(["domains", "unblock", "evil.example"])).toEqual({
      kind: "domains-unblock",
      domain: "evil.example",
    });
    expect(command(["domains", "list"])).toEqual({ kind: "domains-list" });
  });

  it("keeps '=' inside an option's value", () => {
    expect(command(["links", "list", "--search=a=b"])).toMatchObject({ search: "a=b" });
  });

  it.each<[string[], RegExp]>([
    [["links"], /Unknown command: links/],
    [["frob"], /Unknown command: frob/],
    [["links", "add"], /exactly one URL/],
    [["links", "add", "a.example", "b.example"], /exactly one URL/],
    [["links", "add", "a.example", "--slug"], /--slug needs a value/],
    [["links", "add", "a.example", "--sulg", "x"], /Unknown option --sulg/],
    [["links", "list", "--limit", "0"], /--limit/],
    [["links", "list", "--limit", "ten"], /--limit/],
    [["links", "list", "extra"], /no arguments/],
    [["links", "delete"], /exactly one slug/],
    [["domains", "block"], /exactly one domain/],
    [["domains", "list", "--all", "x"], /Unknown option --all/],
  ])("rejects %j", (args, message) => {
    expect(error(args)).toMatch(message);
  });
});

describe("formatLinkTable", () => {
  it("aligns slug and date columns and keeps URLs whole", () => {
    const table = formatLinkTable([
      { slug: "kachow", url: "https://google.com/", createdAt: Date.UTC(2026, 0, 2, 3, 4) },
      { slug: "a", url: `https://example.com/${"x".repeat(200)}`, createdAt: 0 },
    ]);
    expect(table.split("\n")).toEqual([
      "SLUG    CREATED (UTC)     URL",
      "kachow  2026-01-02 03:04  https://google.com/",
      `a       1970-01-01 00:00  https://example.com/${"x".repeat(200)}`,
    ]);
  });

  it("says when there's nothing to show", () => {
    expect(formatLinkTable([])).toBe("No links.");
  });
});
