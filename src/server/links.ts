/**
 * Storing links: the part of shortening that both the site (src/server/shorten.ts) and the
 * admin command (src/cli/main.ts) do, kept in one place so they can't drift apart. The rules
 * themselves are in src/core/links.ts; this applies them against the database.
 */
import type { LinkPolicy } from "../core/links.ts";
import {
  checkCustomSlug,
  generateSlug,
  pickFreeSlug,
  shortUrlFor,
  type CustomSlugProblem,
} from "../core/slugs.ts";
import type { Store } from "./store.ts";

/** The link rules for this site, with blocked domains looked up in `store`. */
export function linkPolicy(store: Store, publicUrl: string): LinkPolicy {
  return {
    ownHost: new URL(publicUrl).hostname,
    isBlocked: (host) => store.isHostBlocked(host),
  };
}

/** A stored link, as the site and the CLI report it. */
export interface SavedLink {
  kind: "created" | "existing";
  slug: string;
  shortUrl: string;
  url: string;
}

/** Why a custom slug couldn't be used. */
export type SlugProblem = CustomSlugProblem | "taken";

/** How to store a link. */
export interface SaveOptions {
  publicUrl: string;
  now: number;
  randomBytes: (count: number) => Uint8Array;
  /**
   * A slug the owner chose. Without one, a URL that's already stored gets its existing link
   * back; with one, that exact slug is created, because the owner asked for that name.
   */
  slug?: string | undefined;
}

/**
 * Stores `url`, which must already have passed `evaluateLink`, and returns its short link, or
 * the problem with the requested custom slug.
 */
export function saveLink(
  store: Store,
  url: string,
  options: SaveOptions,
): SavedLink | { kind: "slug_problem"; problem: SlugProblem } {
  const linkFor = (kind: SavedLink["kind"], slug: string): SavedLink => ({
    kind,
    slug,
    shortUrl: shortUrlFor(options.publicUrl, slug),
    url,
  });
  if (options.slug !== undefined) {
    const problem = checkCustomSlug(options.slug) ?? (store.hasSlug(options.slug) ? "taken" : null);
    if (problem) return { kind: "slug_problem", problem };
    store.addLink({ slug: options.slug, url, createdAt: options.now });
    return linkFor("created", options.slug);
  }
  const existing = store.findByUrl(url);
  if (existing) return linkFor("existing", existing.slug);
  const slug = pickFreeSlug(
    () => generateSlug(options.randomBytes),
    (candidate) => store.hasSlug(candidate),
  );
  store.addLink({ slug, url, createdAt: options.now });
  return linkFor("created", slug);
}
