/**
 * The rules for what may be shortened, and the canonical form it's stored in.
 *
 * Everything the server refuses is decided here, with no I/O, so the rules can be tested
 * exhaustively and the same messages appear in the API, the no-JavaScript page and the CLI.
 */
import { enclosingDomains, isPrivateHost, isWithinDomain } from "./addresses.ts";
import { isPublicShortener } from "./shorteners.ts";

/** Longest URL accepted, after normalisation. Browsers and proxies handle this everywhere. */
export const MAX_URL_LENGTH = 2048;

/**
 * Why a link was refused. Also the `error` code in API responses, so treat these as a public
 * interface.
 */
export type Refusal =
  | "invalid_url"
  | "unsupported_scheme"
  | "too_long"
  | "has_credentials"
  | "own_domain"
  | "private_address"
  | "url_shortener"
  | "blocked_domain";

/** Words shown to people for each refusal. */
export const REFUSAL_MESSAGES: Readonly<Record<Refusal, string>> = {
  invalid_url: "That isn't a valid web address.",
  unsupported_scheme: "Only http:// and https:// links can be shortened.",
  too_long: `That link is too long (the limit is ${MAX_URL_LENGTH} characters).`,
  has_credentials: "Links with a username or password in them can't be shortened.",
  own_domain: "Links to syhr.sh can't be shortened again.",
  private_address: "That address only works inside a private network.",
  url_shortener: "That's already a short link. Paste the address it leads to instead.",
  blocked_domain: "Links to that site can't be shortened here.",
};

/** What the rules need to know about the site and its owner's choices. */
export interface LinkPolicy {
  /** The site's own hostname (from `PUBLIC_URL`); links to it or its subdomains loop. */
  ownHost: string;
  /** Domains the owner has blocked, lowercase; their subdomains are blocked too. */
  blockedDomains: ReadonlySet<string>;
}

/** Outcome of {@link evaluateLink}: the URL to store, or why not. */
export type LinkDecision = { ok: true; url: string } | { ok: false; refusal: Refusal };

/**
 * A scheme written out in full ("https://") or a known non-web scheme ("javascript:"). Anything
 * else, such as "example.com:8080/x", is a bare address that gets https:// added, as the old
 * page did.
 */
const EXPLICIT_SCHEME =
  /^[a-z][a-z0-9+.-]*:\/\/|^(?:javascript|data|vbscript|file|mailto|blob|about):/i;

/**
 * Turns what someone typed into a URL, adding `https://` when they left the scheme off.
 * Returns null when it isn't a URL at all.
 */
export function parseLinkInput(input: string): URL | null {
  const text = input.trim();
  if (text === "" || /\s/.test(text)) return null;
  const withScheme = EXPLICIT_SCHEME.test(text) ? text : `https://${text}`;
  try {
    return new URL(withScheme);
  } catch {
    return null;
  }
}

/**
 * Decides whether `input` may be shortened and, if so, the exact URL to store and redirect to.
 *
 * The stored form is the WHATWG serialisation (`URL.href`): scheme and host lowercased, default
 * port dropped, path at least "/". That is the form browsers themselves use, so it never
 * changes where a link goes, and it makes "example.com" and "https://EXAMPLE.com/" one link.
 */
export function evaluateLink(input: string, policy: LinkPolicy): LinkDecision {
  // Cheap guard before parsing: normalisation never shrinks a URL much.
  if (input.length > MAX_URL_LENGTH * 2) return { ok: false, refusal: "too_long" };
  const url = parseLinkInput(input);
  if (!url) return { ok: false, refusal: "invalid_url" };
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return { ok: false, refusal: "unsupported_scheme" };
  }
  if (url.hostname === "") return { ok: false, refusal: "invalid_url" };
  if (url.href.length > MAX_URL_LENGTH) return { ok: false, refusal: "too_long" };
  // "https://google.com@evil.example" reads as google.com but goes to evil.example.
  if (url.username !== "" || url.password !== "") {
    return { ok: false, refusal: "has_credentials" };
  }
  const host = url.hostname;
  if (isWithinDomain(host, policy.ownHost)) return { ok: false, refusal: "own_domain" };
  if (isPrivateHost(host)) return { ok: false, refusal: "private_address" };
  if (isPublicShortener(host)) return { ok: false, refusal: "url_shortener" };
  if (isBlockedHost(host, policy.blockedDomains)) {
    return { ok: false, refusal: "blocked_domain" };
  }
  return { ok: true, url: url.href };
}

/** Whether `host` is one of `blockedDomains` or under one of them. */
export function isBlockedHost(host: string, blockedDomains: ReadonlySet<string>): boolean {
  return enclosingDomains(host).some((domain) => blockedDomains.has(domain));
}

/**
 * Reads a domain the owner wants to block, from either a bare domain ("Evil.example") or a full
 * URL ("https://evil.example/path"). Returns the lowercase hostname, or null if it isn't one.
 */
export function parseDomain(input: string): string | null {
  const url = parseLinkInput(input);
  if (!url || (url.protocol !== "http:" && url.protocol !== "https:")) return null;
  const host = url.hostname.replace(/\.$/, "");
  return host.includes(".") && !host.startsWith("[") ? host : null;
}
