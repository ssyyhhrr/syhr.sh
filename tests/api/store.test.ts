/**
 * Protects the database layer: schema creation on a fresh file, reopening an existing one,
 * slug uniqueness, search, and blocking a domain. Losing or corrupting links is the worst thing
 * this app can do.
 */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { Store } from "../../src/server/store.ts";

const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function tempFile(): string {
  const dir = mkdtempSync(path.join(tmpdir(), "syhr-store-"));
  dirs.push(dir);
  return path.join(dir, "nested", "syhr.db");
}

describe("Store", () => {
  it("creates the file, its directory and schema, and keeps data across reopening", () => {
    const file = tempFile();
    const first = new Store(file);
    first.addLink({ slug: "kachow", url: "https://example.com/", createdAt: 1 });
    first.close();
    const second = new Store(file);
    expect(second.findBySlug("kachow")).toEqual({
      slug: "kachow",
      url: "https://example.com/",
      createdAt: 1,
    });
    second.close();
  });

  it("refuses a duplicate slug", () => {
    const store = new Store(":memory:");
    store.addLink({ slug: "same", url: "https://a.example/", createdAt: 1 });
    expect(() => {
      store.addLink({ slug: "same", url: "https://b.example/", createdAt: 2 });
    }).toThrow();
  });

  it("finds the oldest link for a URL", () => {
    const store = new Store(":memory:");
    store.addLink({ slug: "newer", url: "https://a.example/", createdAt: 5 });
    store.addLink({ slug: "older", url: "https://a.example/", createdAt: 1 });
    expect(store.findByUrl("https://a.example/")?.slug).toBe("older");
  });

  it("searches slugs and URLs, newest first, treating % and _ literally", () => {
    const store = new Store(":memory:");
    store.addLink({ slug: "one", url: "https://a.example/100%", createdAt: 1 });
    store.addLink({ slug: "two", url: "https://b.example/x_y", createdAt: 2 });
    store.addLink({ slug: "KaChow", url: "https://c.example/", createdAt: 3 });
    expect(store.listLinks({ limit: 10 }).map((l) => l.slug)).toEqual(["KaChow", "two", "one"]);
    expect(store.listLinks({ search: "kachow", limit: 10 }).map((l) => l.slug)).toEqual(["KaChow"]);
    expect(store.listLinks({ search: "%", limit: 10 }).map((l) => l.slug)).toEqual(["one"]);
    expect(store.listLinks({ search: "_", limit: 10 }).map((l) => l.slug)).toEqual(["two"]);
    expect(store.listLinks({ limit: 1 })).toHaveLength(1);
  });

  it("deletes links", () => {
    const store = new Store(":memory:");
    store.addLink({ slug: "gone", url: "https://a.example/", createdAt: 1 });
    expect(store.deleteLink("gone")).toBe(true);
    expect(store.deleteLink("gone")).toBe(false);
    expect(store.hasSlug("gone")).toBe(false);
  });

  it("blocks a domain, deleting its links and its subdomains' links only", () => {
    const store = new Store(":memory:");
    store.addLink({ slug: "a", url: "https://evil.example/x", createdAt: 1 });
    store.addLink({ slug: "b", url: "https://login.evil.example/", createdAt: 2 });
    store.addLink({ slug: "c", url: "https://notevil.example/", createdAt: 3 });
    const deleted = store.blockDomain("evil.example", 10);
    expect(deleted.map((l) => l.slug).sort()).toEqual(["a", "b"]);
    expect(store.hasSlug("c")).toBe(true);
    expect(store.isHostBlocked("evil.example")).toBe(true);
    expect(store.isHostBlocked("a.b.evil.example.")).toBe(true);
    expect(store.isHostBlocked("notevil.example")).toBe(false);
    expect(store.listBlockedDomains()).toEqual([{ domain: "evil.example", createdAt: 10 }]);
    // Blocking again is harmless.
    expect(store.blockDomain("evil.example", 11)).toEqual([]);
    expect(store.unblockDomain("evil.example")).toBe(true);
    expect(store.unblockDomain("evil.example")).toBe(false);
  });
});
