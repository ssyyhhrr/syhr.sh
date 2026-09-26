/**
 * Public URL shorteners whose links syhr.sh refuses to wrap.
 *
 * Chaining shorteners is a standard way to hide a phishing destination behind a trusted-looking
 * link, and gives nothing to honest users (they can paste the final URL). The list covers
 * general-purpose services anyone can create links on; single-brand shorteners such as youtu.be
 * or amzn.to are left alone because they can only ever point at their own brand's site.
 *
 * It will never be complete. Owners can block any other domain with `syhr domains block`.
 */
import { isWithinDomain } from "./addresses.ts";

/** Domains of general-purpose public shorteners (subdomains are included automatically). */
export const PUBLIC_SHORTENERS: readonly string[] = [
  "0rz.tw",
  "adf.ly",
  "bc.vc",
  "bit.do",
  "bit.ly",
  "bitly.com",
  "bl.ink",
  "buff.ly",
  "chilp.it",
  "cli.gs",
  "clck.ru",
  "cutt.ly",
  "gg.gg",
  "goo.gl",
  "is.gd",
  "kutt.it",
  "lnkd.in",
  "ow.ly",
  "rb.gy",
  "rebrand.ly",
  "s.id",
  "short.gy",
  "short.io",
  "shorte.st",
  "shorturl.at",
  "shorturl.com",
  "snip.ly",
  "snipurl.com",
  "soo.gd",
  "t.co",
  "t.ly",
  "tiny.cc",
  "tiny.one",
  "tinyurl.com",
  "tr.im",
  "u.to",
  "urlz.fr",
  "v.gd",
  "x.co",
];

/**
 * The owner's own domains. Their short links (sy.hr/github and so on) are trusted redirects, so
 * they're always allowed even if a future list entry would match them.
 */
export const TRUSTED_DOMAINS: readonly string[] = ["sy.hr", "rhysbi.shop"];

/** Whether `host` belongs to a public shortener (and isn't one of the owner's own domains). */
export function isPublicShortener(host: string): boolean {
  if (TRUSTED_DOMAINS.some((domain) => isWithinDomain(host, domain))) return false;
  return PUBLIC_SHORTENERS.some((domain) => isWithinDomain(host, domain));
}
