/**
 * Every icon the page draws, resolved to SVG path data when the site is built, so the page
 * ships a few hundred bytes of inline SVG instead of the old 3 MB of Font Awesome webfonts.
 *
 * All but TryHackMe come from Font Awesome Free (icons CC BY 4.0,
 * https://fontawesome.com/license/free); TryHackMe comes from Simple Icons (CC0), as on sy.hr.
 */
import {
  faDiscord,
  faGithub,
  faSpotify,
  faSquareLetterboxd,
  faSteam,
  faYoutube,
} from "@fortawesome/free-brands-svg-icons";
import { faCopy, faEnvelope, faShareNodes } from "@fortawesome/free-solid-svg-icons";
import type { IconDefinition } from "@fortawesome/free-solid-svg-icons";
import { siTryhackme } from "simple-icons";
import type { IconShape } from "../src/server/assets.ts";
import type { IconName } from "../src/server/page.ts";

function fontAwesome(icon: IconDefinition): IconShape {
  const [width, height, , , path] = icon.icon;
  return { width, height, paths: typeof path === "string" ? [path] : path };
}

/** The icons, by the names the page uses. */
export const ICONS: Readonly<Record<IconName, IconShape>> = {
  discord: fontAwesome(faDiscord),
  github: fontAwesome(faGithub),
  letterboxd: fontAwesome(faSquareLetterboxd),
  spotify: fontAwesome(faSpotify),
  steam: fontAwesome(faSteam),
  tryhackme: { width: 24, height: 24, paths: [siTryhackme.path] },
  youtube: fontAwesome(faYoutube),
  email: fontAwesome(faEnvelope),
  copy: fontAwesome(faCopy),
  share: fontAwesome(faShareNodes),
};
