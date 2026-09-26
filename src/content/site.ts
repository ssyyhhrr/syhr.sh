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

/** Services with an icon in the footer (see src/content/icons.ts). */
export type ProfileService =
  "discord" | "github" | "letterboxd" | "spotify" | "steam" | "tryhackme" | "youtube" | "email";

/** One profile link in the footer. */
export interface ProfileLink {
  service: ProfileService;
  /** The service's name, for the accessible label ("GitHub: syhr"). */
  label: string;
  /** Short links resolve through redirects on sy.hr's web server, not this app. */
  href: string;
  /** Shown in the tooltip. */
  username: string;
}

/** sy.hr's profile row, in the same order, with the same links and usernames. */
export const PROFILE_LINKS: readonly ProfileLink[] = [
  { service: "discord", label: "Discord", href: "https://sy.hr/discord", username: "sy.hr" },
  { service: "github", label: "GitHub", href: "https://sy.hr/github", username: "syhr" },
  {
    service: "letterboxd",
    label: "Letterboxd",
    href: "https://sy.hr/letterboxd",
    username: "sy_hr",
  },
  { service: "spotify", label: "Spotify", href: "https://sy.hr/spotify", username: "syhr" },
  { service: "steam", label: "Steam", href: "https://sy.hr/steam", username: "syhr" },
  { service: "tryhackme", label: "TryHackMe", href: "https://sy.hr/tryhackme", username: "sy.hr" },
  { service: "youtube", label: "YouTube", href: "https://sy.hr/youtube", username: "syhr" },
  {
    service: "email",
    label: "Email",
    href: "mailto:mail@rhysbi.shop",
    username: "mail@rhysbi.shop",
  },
];
