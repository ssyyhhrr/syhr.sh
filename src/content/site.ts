/**
 * The words and links on the page. Kept apart from the markup so wording changes don't touch
 * rendering code, and so tests can assert against the same strings.
 */

/** Page title, heading and brand name. */
export const SITE_NAME = "syhr.sh";

/** The tagline, split around the link to sy.hr, which sits in the middle of it. */
export const TAGLINE = {
  before: "A simple web tool for creating short, memorable and shareable links. Brought to you by ",
  linkText: "syhr",
  after: ".",
} as const;

/** Meta description: the tagline as one sentence. */
export const DESCRIPTION = `${TAGLINE.before}${TAGLINE.linkText}${TAGLINE.after}`;

/** The owner's site, linked from the tagline and the footer. */
export const OWNER_URL = "https://sy.hr";

/** Placeholder in the URL box. */
export const INPUT_PLACEHOLDER = "Paste a long link";

/** The footer's pointer to the owner's site, as on sy.hr ("Looking for my CV? rhysbi.shop"). */
export const MORE_LINK = { text: "Looking for more? sy.hr", href: OWNER_URL } as const;

/** The owner's email address, in the footer. */
export const EMAIL = "mail@rhysbi.shop";
