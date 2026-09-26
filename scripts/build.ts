/**
 * Builds the browser assets into dist/: the script and stylesheet with content-hashed names
 * (so they can be cached forever), the Raleway font files, and dist/manifest.json, which tells
 * the server what to serve and link (see src/server/assets.ts).
 *
 * Run with: npm run build. The tests and the e2e server build first, so they never run
 * against stale assets.
 */
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { build } from "esbuild";
import { APP_ROOT, type AssetManifest } from "../src/server/assets.ts";
import { ICONS } from "./icons.ts";

/** Browsers the bundle must run in: evergreen desktop, and iOS Safari 17+ (see docs/spec.md). */
const TARGETS = ["es2022", "chrome120", "firefox120", "safari17"];

/** Builds everything into `outDir` (dist/ by default) and returns the manifest written. */
export async function buildAssets(outDir = path.join(APP_ROOT, "dist")): Promise<AssetManifest> {
  rmSync(outDir, { recursive: true, force: true });
  const assetsDir = path.join(outDir, "assets");
  mkdirSync(assetsDir, { recursive: true });

  const result = await build({
    absWorkingDir: APP_ROOT,
    entryPoints: { app: "src/browser/main.ts", styles: "src/browser/styles.css" },
    outdir: assetsDir,
    entryNames: "[name]-[hash]",
    assetNames: "[name]-[hash]",
    publicPath: "/assets",
    bundle: true,
    minify: true,
    format: "esm",
    target: TARGETS,
    loader: { ".woff2": "file" },
    tsconfig: "src/browser/tsconfig.json",
    metafile: true,
    logLevel: "warning",
  });

  const files: string[] = [];
  const styles: string[] = [];
  const scripts: string[] = [];
  for (const [output, meta] of Object.entries(result.metafile.outputs)) {
    const urlPath = `/assets/${path.basename(output)}`;
    files.push(urlPath);
    if (meta.entryPoint === "src/browser/main.ts") scripts.push(urlPath);
    if (meta.entryPoint === "src/browser/styles.css") styles.push(urlPath);
  }

  const manifest: AssetManifest = { styles, scripts, files: files.sort(), icons: ICONS };
  writeFileSync(path.join(outDir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  return manifest;
}

if (import.meta.main) {
  const manifest = await buildAssets();
  console.log(`Built ${manifest.files.length} files into dist/`);
}
