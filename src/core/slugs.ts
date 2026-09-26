/**
 * Slugs: the part of a short link after the domain.
 *
 * Random slugs are 6 characters from A–Z, a–z and 0–9, as they always have been: 62^6 is about
 * 57 billion, so collisions stay rare for any realistic number of links. The owner can also
 * choose custom slugs (like "kachow") through the CLI.
 */

/** Characters random slugs are drawn from. */
export const SLUG_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

/** Length of random slugs. */
export const SLUG_LENGTH = 6;

/** Longest custom slug the CLI accepts. */
export const MAX_CUSTOM_SLUG_LENGTH = 64;

/** Characters a slug may contain in the path. Anything else can't be a link. */
export const SLUG_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

/**
 * Top-level paths the app serves itself, or may in future. A custom slug with one of these
 * names would be shadowed by the route, or would shadow it. Compared case-insensitively.
 */
export const RESERVED_SLUGS: readonly string[] = [
  "api",
  "assets",
  "healthz",
  "favicon",
  "robots",
  "sitemap",
  "static",
  "admin",
];

/**
 * Makes a random slug from `randomBytes`, a source of cryptographically random bytes (passed
 * in so this stays pure). Uses rejection sampling: 256 isn't a multiple of 62, so taking
 * `byte % 62` directly would make the first 8 characters slightly more likely.
 */
export function generateSlug(randomBytes: (count: number) => Uint8Array): string {
  const limit = 256 - (256 % SLUG_ALPHABET.length); // 248
  let slug = "";
  while (slug.length < SLUG_LENGTH) {
    for (const byte of randomBytes(SLUG_LENGTH * 2)) {
      if (byte >= limit) continue;
      slug += SLUG_ALPHABET.charAt(byte % SLUG_ALPHABET.length);
      if (slug.length === SLUG_LENGTH) break;
    }
  }
  return slug;
}

/**
 * Picks the first slug from `generate` that `isTaken` says is free. Gives up after
 * `maxAttempts` so a full or broken store can't hang a request; with 57 billion possibilities,
 * reaching that limit means something else is wrong.
 */
export function pickFreeSlug(
  generate: () => string,
  isTaken: (slug: string) => boolean,
  maxAttempts = 20,
): string {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const slug = generate();
    if (!isTaken(slug)) return slug;
  }
  throw new Error(`No free slug after ${maxAttempts} attempts`);
}

/** Why a custom slug was rejected. */
export type CustomSlugProblem = "invalid_characters" | "too_long" | "reserved";

/** Checks a slug the owner chose. Returns the problem, or null if it's fine. */
export function checkCustomSlug(slug: string): CustomSlugProblem | null {
  if (slug.length > MAX_CUSTOM_SLUG_LENGTH) return "too_long";
  if (!SLUG_PATTERN.test(slug)) return "invalid_characters";
  if (RESERVED_SLUGS.includes(slug.toLowerCase())) return "reserved";
  return null;
}

/** Whether a request path segment could be a slug at all (before looking it up). */
export function looksLikeSlug(segment: string): boolean {
  return SLUG_PATTERN.test(segment);
}

/** The short link for `slug`: the public origin plus the slug, with no trailing slash. */
export function shortUrlFor(publicUrl: string, slug: string): string {
  return `${new URL(publicUrl).origin}/${slug}`;
}
