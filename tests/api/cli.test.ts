/**
 * Runs the real `syhr` admin command against a real database file, the way the owner uses it
 * on the server, and checks the server sees the result. This is the owner's only tool for
 * custom slugs and abuse reports, so it must do exactly what it says, and nothing else.
 */
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_CONFIG } from "../../src/core/config.ts";
import { createApp } from "../../src/server/app.ts";
import { Store } from "../../src/server/store.ts";

const root = path.resolve(import.meta.dirname, "../..");
let dir = "";
let database = "";

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), "syhr-cli-"));
  database = path.join(dir, "syhr.db");
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

/** Runs `syhr ...args`, returning its exit code and output. */
function syhr(...args: string[]) {
  const result = spawnSync(process.execPath, ["src/cli/main.ts", ...args], {
    cwd: root,
    encoding: "utf8",
    env: { ...process.env, DATABASE_PATH: database, PUBLIC_URL: "https://syhr.sh" },
  });
  return { code: result.status, out: result.stdout.trim(), err: result.stderr.trim() };
}

/** The server, over the same database file, as a visitor would reach it. */
async function visit(urlPath: string) {
  const store = new Store(database);
  const app = createApp({
    config: DEFAULT_CONFIG,
    store,
    log: () => undefined,
    page: { styles: [], scripts: [], icon: () => "" },
    files: new Map(),
  });
  try {
    return await app.request(urlPath);
  } finally {
    store.close();
  }
}

describe("syhr links", () => {
  it("adds a link with a custom slug that the server then redirects", async () => {
    expect(syhr("links", "add", "google.com", "--slug", "kachow")).toEqual({
      code: 0,
      out: "Added https://syhr.sh/kachow -> https://google.com/",
      err: "",
    });
    const response = await visit("/kachow");
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("https://google.com/");
  });

  it("adds a random slug, reusing an existing link for the same URL", () => {
    const added = syhr("links", "add", "example.com");
    expect(added.out).toMatch(
      /^Added https:\/\/syhr\.sh\/[A-Za-z0-9]{6} -> https:\/\/example\.com\/$/,
    );
    const slug = /sh\/(\w+)/.exec(added.out)?.[1] ?? "";
    expect(syhr("links", "add", "https://EXAMPLE.com/").out).toBe(
      `Already shortened: https://syhr.sh/${slug}`,
    );
  });

  it("refuses bad custom slugs and slugs in use", () => {
    syhr("links", "add", "example.com", "--slug", "taken");
    expect(syhr("links", "add", "example.org", "--slug", "taken")).toMatchObject({
      code: 1,
      err: 'The slug "taken" is already in use.',
    });
    expect(syhr("links", "add", "example.org", "--slug", "api").err).toMatch(/path the site uses/);
    expect(syhr("links", "add", "example.org", "--slug", "a b").err).toMatch(/letters, digits/);
  });

  it("applies the same rules as the site", () => {
    expect(syhr("links", "add", "https://syhr.sh/x")).toMatchObject({
      code: 1,
      err: "Links to syhr.sh can't be shortened again.",
    });
    expect(syhr("links", "add", "localhost").code).toBe(1);
  });

  it("lists and searches links, newest first", () => {
    syhr("links", "add", "a.example", "--slug", "first");
    syhr("links", "add", "b.example", "--slug", "second");
    const listed = syhr("links", "list").out.split("\n");
    expect(listed[0]).toMatch(/^SLUG/);
    expect(listed.slice(1).map((line) => line.split(/\s+/)[0])).toEqual(["second", "first"]);
    expect(syhr("links", "list", "--search", "a.example").out).toContain("first");
    expect(syhr("links", "list", "--search", "a.example").out).not.toContain("second");
    expect(syhr("links", "list", "--limit", "1").out.split("\n")).toHaveLength(2);
  });

  it("deletes a link, after which the server shows the 404 page", async () => {
    syhr("links", "add", "example.com", "--slug", "gone");
    expect(syhr("links", "delete", "gone")).toMatchObject({
      code: 0,
      out: "Deleted https://syhr.sh/gone",
    });
    expect((await visit("/gone")).status).toBe(404);
    expect(syhr("links", "delete", "gone")).toMatchObject({ code: 1 });
  });
});

describe("syhr domains", () => {
  it("blocks a domain: deletes its links and the site refuses new ones", async () => {
    syhr("links", "add", "https://evil.example/a", "--slug", "evil1");
    syhr("links", "add", "https://login.evil.example/", "--slug", "evil2");
    syhr("links", "add", "https://example.com/", "--slug", "fine");
    const blocked = syhr("domains", "block", "Evil.Example");
    expect(blocked.code).toBe(0);
    expect(blocked.out).toContain("Blocked evil.example and its subdomains.");
    expect(blocked.out).toContain("Deleted 2 links:");
    expect((await visit("/evil1")).status).toBe(404);
    expect((await visit("/fine")).status).toBe(302);
    expect(syhr("links", "add", "https://www.evil.example/").err).toBe(
      "Links to that site can't be shortened here.",
    );
    expect(syhr("domains", "list").out).toMatch(/^evil\.example {2}\(since \d{4}-\d{2}-\d{2}\)$/);
  });

  it("unblocks a domain", () => {
    syhr("domains", "block", "evil.example");
    expect(syhr("domains", "unblock", "evil.example").code).toBe(0);
    expect(syhr("domains", "list").out).toBe("No blocked domains.");
    expect(syhr("domains", "unblock", "evil.example").code).toBe(1);
    expect(syhr("links", "add", "https://evil.example/").code).toBe(0);
  });

  it("rejects something that isn't a domain", () => {
    expect(syhr("domains", "block", "localhost")).toMatchObject({ code: 2 });
  });
});

describe("syhr itself", () => {
  it("prints help without needing a database or config", () => {
    const output = execFileSync(process.execPath, ["src/cli/main.ts", "help"], {
      cwd: root,
      encoding: "utf8",
      env: { ...process.env, PORT: "not a port" },
    });
    expect(output).toContain("syhr links add <url>");
  });

  it("rejects unknown commands with usage and exit code 2", () => {
    const result = syhr("links", "frob");
    expect(result.code).toBe(2);
    expect(result.err).toContain("Unknown command: links frob");
    expect(result.err).toContain("Usage:");
  });
});
