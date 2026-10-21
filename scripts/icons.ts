/**
 * Every icon the page draws, resolved to SVG path data when the site is built, so the page
 * ships a few hundred bytes of inline SVG instead of the old 3 MB of Font Awesome webfonts.
 *
 * They come from Font Awesome Free (icons CC BY 4.0, https://fontawesome.com/license/free).
 */
import { faCopy, faShareNodes } from "@fortawesome/free-solid-svg-icons";
import type { IconDefinition } from "@fortawesome/free-solid-svg-icons";
import type { IconShape } from "../src/server/assets.ts";
import type { IconName } from "../src/server/page.ts";

function fontAwesome(icon: IconDefinition): IconShape {
  const [width, height, , , path] = icon.icon;
  return { width, height, paths: typeof path === "string" ? [path] : path };
}

/** The icons, by the names the page uses. */
export const ICONS: Readonly<Record<IconName, IconShape>> = {
  copy: fontAwesome(faCopy),
  share: fontAwesome(faShareNodes),
};
