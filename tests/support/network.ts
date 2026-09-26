/**
 * Keeps browser tests off the internet.
 *
 * The app under test is the only real server. For the old app, its CDN libraries are served
 * from npm (it can't wire up its form without them), and the shortening targets it pinged from
 * the browser are answered locally. For the new app, any request that leaves the site is
 * blocked and recorded, because the new page must not depend on third parties.
 */
import path from "node:path";
import type { BrowserContext, Route } from "@playwright/test";
import { legacyCdnDir } from "./legacy.ts";

/**
 * Hosts the tests shorten links to. The old app fetched each target (from the browser and the
 * server) before shortening it, so these must be real, reachable domains; example.* are
 * reserved for exactly this use.
 */
export const TEST_TARGET_HOSTS = ["example.com", "example.org", "example.net"] as const;

const cdnFiles: Record<string, string> = {
  "chroma.min.js": path.join(legacyCdnDir, "node_modules/chroma-js/chroma.min.js"),
  "simplex-noise.min.js": path.join(legacyCdnDir, "node_modules/simplex-noise/simplex-noise.js"),
};

const thirdPartyAssetHosts = [
  "cdnjs.cloudflare.com",
  "cdn.jsdelivr.net",
  "fonts.googleapis.com",
  "fonts.gstatic.com",
];

async function answerForLegacy(route: Route, url: URL): Promise<void> {
  const file = Object.entries(cdnFiles).find(([name]) => url.pathname.endsWith(name))?.[1];
  if (file) return route.fulfill({ path: file, contentType: "text/javascript" });
  if (thirdPartyAssetHosts.includes(url.hostname)) {
    // Unused (victor, tweakpane) or cosmetic (fonts, CSS reset): an empty file will do.
    const contentType = url.pathname.endsWith(".js") ? "text/javascript" : "text/css";
    return route.fulfill({ body: "", contentType });
  }
  if ((TEST_TARGET_HOSTS as readonly string[]).includes(url.hostname)) {
    return route.fulfill({ body: "ok", contentType: "text/plain" });
  }
  return route.abort("namenotresolved");
}

/**
 * Routes every request that leaves `appOrigin`. Returns the list of such requests the new app
 * made, which should stay empty.
 */
export async function isolateNetwork(
  context: BrowserContext,
  appOrigin: string,
  target: "legacy" | "new",
): Promise<string[]> {
  const external: string[] = [];
  await context.route(
    (url) => url.origin !== appOrigin,
    async (route) => {
      const url = new URL(route.request().url());
      if (target === "legacy") return answerForLegacy(route, url);
      external.push(url.href);
      return route.abort("blockedbyclient");
    },
  );
  return external;
}
