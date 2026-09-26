/**
 * Loads the files the server hands out as-is, once at start-up, so requests never touch the
 * filesystem (and no request path can reach outside these files): the favicon from public/,
 * and the built script, stylesheet and fonts listed in dist/manifest.json (see
 * scripts/build.ts).
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import type { StaticFile } from "./app.ts";
import type { IconName, PageAssets } from "./page.ts";

/** The repository root, where public/ and dist/ live. */
export const APP_ROOT = path.resolve(import.meta.dirname, "../..");

/** An icon as SVG path data. */
export interface IconShape {
  width: number;
  height: number;
  paths: readonly string[];
}

/** What the build writes to dist/manifest.json. */
export interface AssetManifest {
  /** URL paths of stylesheets and scripts to link from the page. */
  styles: string[];
  scripts: string[];
  /** URL paths of every built file, each under /assets/. */
  files: string[];
  icons: Record<IconName, IconShape>;
}

/** What the server serves and links from the page. */
export interface LoadedAssets {
  files: Map<string, StaticFile>;
  page: PageAssets;
}

const CONTENT_TYPES: Readonly<Record<string, string>> = {
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".woff2": "font/woff2",
};

/**
 * Renders an icon as inline SVG, 1em tall with its width from its own proportions. The width
 * is explicit because Safari doesn't size inline SVG from its viewBox alone, and it's an
 * attribute rather than a style because the CSP forbids inline styles.
 */
export function renderIcon(shape: IconShape): string {
  const width = (shape.width / shape.height).toFixed(4);
  const paths = shape.paths.map((d) => `<path d="${escapeAttribute(d)}"></path>`).join("");
  return (
    `<svg class="icon" viewBox="0 0 ${shape.width} ${shape.height}" width="${width}em" ` +
    `height="1em" aria-hidden="true" focusable="false">${paths}</svg>`
  );
}

/**
 * Copies file contents into their own buffer. `readFileSync` may return a view into Node's
 * shared allocation pool, and serving that pool's backing ArrayBuffer sent visitors the bytes
 * of unrelated files (it happened: the page's script came back as server source code).
 */
function ownBytes(buffer: Buffer): Uint8Array<ArrayBuffer> {
  return new Uint8Array(buffer);
}

/** Escapes text for a double-quoted HTML attribute. */
function escapeAttribute(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;");
}

/**
 * Loads the favicon and the built assets. Throws if the build is missing, so a deployment
 * without `npm run build` fails at start-up rather than serving an unstyled page.
 */
export function loadAssets(root: string = APP_ROOT): LoadedAssets {
  const manifestPath = path.join(root, "dist/manifest.json");
  if (!existsSync(manifestPath)) {
    throw new Error(`Built assets not found at ${manifestPath}. Run "npm run build" first.`);
  }
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as AssetManifest;

  const files = new Map<string, StaticFile>();
  files.set("/favicon.ico", {
    body: ownBytes(readFileSync(path.join(root, "public/favicon.ico"))),
    contentType: "image/x-icon",
    immutable: false,
  });
  for (const urlPath of manifest.files) {
    files.set(urlPath, {
      body: ownBytes(readFileSync(path.join(root, "dist", urlPath))),
      contentType: CONTENT_TYPES[path.extname(urlPath)] ?? "application/octet-stream",
      immutable: true,
    });
  }

  const icons = new Map(
    Object.entries(manifest.icons).map(([name, shape]) => [name, renderIcon(shape)]),
  );
  return {
    files,
    page: {
      styles: manifest.styles,
      scripts: manifest.scripts,
      icon: (name) => icons.get(name) ?? "",
    },
  };
}
