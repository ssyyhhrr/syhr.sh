/**
 * Loads the files the server hands out as-is, once at start-up, so requests never touch the
 * filesystem (and no request path can reach outside these files).
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import type { StaticFile } from "./app.ts";
import type { PageAssets } from "./page.ts";

/** The repository root, where public/ and dist/ live. */
export const APP_ROOT = path.resolve(import.meta.dirname, "../..");

/** What the server serves and links from the page. */
export interface LoadedAssets {
  files: Map<string, StaticFile>;
  page: PageAssets;
}

/** Loads the favicon from public/. */
export function loadAssets(root: string = APP_ROOT): LoadedAssets {
  const files = new Map<string, StaticFile>();
  files.set("/favicon.ico", {
    body: readFileSync(path.join(root, "public/favicon.ico")),
    contentType: "image/x-icon",
    immutable: false,
  });
  return { files, page: { styles: [], scripts: [], icon: () => "" } };
}
