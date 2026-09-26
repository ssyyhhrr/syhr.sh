/**
 * Runs the pre-overhaul app (Express + EJS + better-sqlite3) straight from git history, so the
 * safety-net tests can prove they describe the old behaviour before the rewrite replaces it.
 *
 * The old app is extracted from the pinned commit into .cache/legacy/<commit>, installed with
 * its own lockfile, and started from that directory: it opens `data.db`, `views/` and `assets/`
 * relative to its working directory and always listens on port 4000.
 */
import { execFileSync, spawn, type ChildProcess } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

/** The commit tagged `pre-overhaul`. Pinned by hash so a moved or missing tag can't change it. */
export const LEGACY_COMMIT = "7af3bb7250d712c55243ae9da3548da258e652fa";

/** The old app hard-codes its port. */
export const LEGACY_PORT = 4000;

/**
 * Library versions the old page loaded from cdnjs. Tests serve these from npm instead, because
 * CDNs are not reachable from every environment the suite runs in; the old page cannot register
 * its click handler without them.
 */
export const LEGACY_CDN_PACKAGES = { "chroma-js": "2.1.0", "simplex-noise": "2.4.0" } as const;

const repoRoot = path.resolve(import.meta.dirname, "../..");

/** Where the old app is extracted. */
export const legacyDir = path.join(repoRoot, ".cache", "legacy", LEGACY_COMMIT);

/** Where the CDN libraries are installed (kept apart so they can't affect the old app). */
export const legacyCdnDir = path.join(legacyDir, ".cdn");

const npm = process.platform === "win32" ? "npm.cmd" : "npm";

/**
 * Extracts and installs the old app, once per commit. Safe to call repeatedly: a marker file
 * records a finished install, so an interrupted one is redone rather than half-used.
 */
export function prepareLegacyApp(): string {
  const marker = path.join(legacyDir, ".ready");
  if (existsSync(marker)) return legacyDir;

  rmSync(legacyDir, { recursive: true, force: true });
  mkdirSync(legacyDir, { recursive: true });
  const archive = path.join(legacyDir, "..", `${LEGACY_COMMIT}.tar`);
  execFileSync("git", ["archive", "--format=tar", "-o", archive, LEGACY_COMMIT], {
    cwd: repoRoot,
  });
  execFileSync("tar", ["-xf", archive, "-C", legacyDir]);
  rmSync(archive);

  // The committed database is the old app's starting state; keep a pristine copy so every run
  // starts from it.
  copyFileSync(path.join(legacyDir, "data.db"), path.join(legacyDir, "data.db.pristine"));

  const quiet = ["--no-audit", "--no-fund", "--loglevel=error"];
  execFileSync(npm, ["ci", "--omit=dev", ...quiet], {
    cwd: legacyDir,
    stdio: "inherit",
    shell: process.platform === "win32",
  });
  const cdnPackages = Object.entries(LEGACY_CDN_PACKAGES).map(([name, v]) => `${name}@${v}`);
  mkdirSync(legacyCdnDir, { recursive: true });
  writeFileSync(path.join(legacyCdnDir, "package.json"), '{ "private": true }\n');
  execFileSync(npm, ["install", ...quiet, ...cdnPackages], {
    cwd: legacyCdnDir,
    stdio: "inherit",
    shell: process.platform === "win32",
  });

  writeFileSync(marker, new Date().toISOString());
  return legacyDir;
}

/**
 * Starts the old app on port 4000 with a fresh copy of its original database. The caller owns
 * the returned process and must kill it.
 */
export function startLegacyApp(): ChildProcess {
  const dir = prepareLegacyApp();
  copyFileSync(path.join(dir, "data.db.pristine"), path.join(dir, "data.db"));
  return spawn(process.execPath, ["app.js"], { cwd: dir, stdio: "inherit" });
}
