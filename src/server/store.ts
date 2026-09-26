/**
 * The links database: one SQLite file, through Node's built-in `node:sqlite` so the image has
 * no native module to build.
 *
 * Methods are synchronous. SQLite calls take microseconds here, and Node runs one request at a
 * time between awaits, so "find, else insert" can't interleave with another request.
 */
import { mkdirSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { enclosingDomains } from "../core/addresses.ts";
import { isBlockedHost } from "../core/links.ts";

/** Bump when the schema changes, and add a step to `#migrate`. */
const SCHEMA_VERSION = 1;

/** A stored short link. */
export interface Link {
  slug: string;
  url: string;
  /** Milliseconds since the epoch. */
  createdAt: number;
}

/** A domain the owner has blocked. */
export interface BlockedDomain {
  domain: string;
  createdAt: number;
}

interface LinkRow {
  slug: string;
  url: string;
  created_at: number;
}

const toLink = (row: LinkRow): Link => ({
  slug: row.slug,
  url: row.url,
  createdAt: row.created_at,
});

/** The app's database. Open one per process; close it on shutdown. */
export class Store {
  readonly #db: DatabaseSync;

  /** Opens (creating if needed) the database at `file`; ":memory:" for a throwaway one. */
  constructor(file: string) {
    if (file !== ":memory:") mkdirSync(path.dirname(path.resolve(file)), { recursive: true });
    this.#db = new DatabaseSync(file);
    // WAL lets the CLI write (via `docker exec`) while the server reads. busy_timeout makes a
    // writer wait briefly for the other process instead of failing at once.
    this.#db.exec("PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;");
    this.#migrate();
  }

  #migrate(): void {
    const row = this.#db.prepare("PRAGMA user_version").get() as { user_version: number };
    if (row.user_version >= SCHEMA_VERSION) return;
    this.#db.exec(`
      BEGIN;
      CREATE TABLE IF NOT EXISTS links (
        slug TEXT PRIMARY KEY,
        url TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS links_by_url ON links (url);
      CREATE TABLE IF NOT EXISTS blocked_domains (
        domain TEXT PRIMARY KEY,
        created_at INTEGER NOT NULL
      );
      PRAGMA user_version = ${SCHEMA_VERSION};
      COMMIT;
    `);
  }

  /** The link with this exact slug (slugs are case-sensitive), if any. */
  findBySlug(slug: string): Link | undefined {
    const row = this.#db
      .prepare("SELECT slug, url, created_at FROM links WHERE slug = ?")
      .get(slug);
    return row ? toLink(row as unknown as LinkRow) : undefined;
  }

  /** The oldest link to exactly this (normalised) URL, if any; used to avoid duplicates. */
  findByUrl(url: string): Link | undefined {
    const row = this.#db
      .prepare(
        "SELECT slug, url, created_at FROM links WHERE url = ? ORDER BY created_at, rowid LIMIT 1",
      )
      .get(url);
    return row ? toLink(row as unknown as LinkRow) : undefined;
  }

  /** Whether a slug is in use. */
  hasSlug(slug: string): boolean {
    return this.#db.prepare("SELECT 1 FROM links WHERE slug = ?").get(slug) !== undefined;
  }

  /** Stores a link. Throws if the slug is taken (the primary key enforces it). */
  addLink(link: Link): void {
    this.#db
      .prepare("INSERT INTO links (slug, url, created_at) VALUES (?, ?, ?)")
      .run(link.slug, link.url, link.createdAt);
  }

  /** Deletes a link. Returns whether it existed. */
  deleteLink(slug: string): boolean {
    return this.#db.prepare("DELETE FROM links WHERE slug = ?").run(slug).changes > 0;
  }

  /**
   * Links whose slug or URL contains `search` (case-insensitive), newest first. Uses instr()
   * rather than LIKE so `%` and `_` in the search are literal.
   */
  listLinks(options: { search?: string; limit: number }): Link[] {
    const search = (options.search ?? "").toLowerCase();
    const rows = this.#db
      .prepare(
        `SELECT slug, url, created_at FROM links
         WHERE ? = '' OR instr(lower(slug), ?) > 0 OR instr(lower(url), ?) > 0
         ORDER BY created_at DESC, rowid DESC LIMIT ?`,
      )
      .all(search, search, search, options.limit);
    return (rows as unknown as LinkRow[]).map(toLink);
  }

  /**
   * Whether `host`, or any domain it sits under, is blocked: one indexed lookup of its
   * enclosing domains, however many domains are blocked.
   */
  isHostBlocked(host: string): boolean {
    const domains = enclosingDomains(host);
    const placeholders = domains.map(() => "?").join(", ");
    const row = this.#db
      .prepare(`SELECT 1 FROM blocked_domains WHERE domain IN (${placeholders}) LIMIT 1`)
      .get(...domains);
    return row !== undefined;
  }

  /** Every blocked domain, alphabetically. */
  listBlockedDomains(): BlockedDomain[] {
    const rows = this.#db
      .prepare("SELECT domain, created_at FROM blocked_domains ORDER BY domain")
      .all() as unknown as { domain: string; created_at: number }[];
    return rows.map((row) => ({ domain: row.domain, createdAt: row.created_at }));
  }

  /**
   * Blocks `domain` (and its subdomains) and deletes every existing link to it, in one
   * transaction. Returns the deleted links so the owner can see what went.
   */
  blockDomain(domain: string, now: number): Link[] {
    const blocked = new Set([domain]);
    this.#db.exec("BEGIN");
    try {
      this.#db
        .prepare("INSERT OR IGNORE INTO blocked_domains (domain, created_at) VALUES (?, ?)")
        .run(domain, now);
      // Hosts live inside URLs, so match in code; this is a rare owner action.
      const rows = this.#db.prepare("SELECT slug, url, created_at FROM links").all();
      const doomed = (rows as unknown as LinkRow[])
        .map(toLink)
        .filter((link) => isBlockedHost(new URL(link.url).hostname, blocked));
      const remove = this.#db.prepare("DELETE FROM links WHERE slug = ?");
      for (const link of doomed) remove.run(link.slug);
      this.#db.exec("COMMIT");
      return doomed;
    } catch (error) {
      this.#db.exec("ROLLBACK");
      throw error;
    }
  }

  /** Unblocks a domain. Returns whether it was blocked. Deleted links don't come back. */
  unblockDomain(domain: string): boolean {
    return this.#db.prepare("DELETE FROM blocked_domains WHERE domain = ?").run(domain).changes > 0;
  }

  /** Closes the database file. */
  close(): void {
    this.#db.close();
  }
}
