/**
 * Protects static file serving with the real build: every file in dist/manifest.json must be
 * served byte-for-byte, with the right type and caching. An early version served the wrong
 * bytes (a view into Node's shared buffer pool), which broke the page's script entirely while
 * every status code looked fine.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG } from "../../src/core/config.ts";
import { createApp } from "../../src/server/app.ts";
import { APP_ROOT, loadAssets, renderIcon } from "../../src/server/assets.ts";
import { Store } from "../../src/server/store.ts";

function realApp() {
  const assets = loadAssets();
  const app = createApp({
    config: DEFAULT_CONFIG,
    store: new Store(":memory:"),
    log: () => undefined,
    page: assets.page,
    files: assets.files,
  });
  return { app, assets };
}

describe("built assets", () => {
  it("serves every built file byte-for-byte, cached as immutable", async () => {
    const { app, assets } = realApp();
    const built = [...assets.files.keys()].filter((p) => p.startsWith("/assets/"));
    expect(built.length).toBeGreaterThanOrEqual(3);
    for (const urlPath of built) {
      const response = await app.request(urlPath);
      expect(response.status).toBe(200);
      const served = new Uint8Array(await response.arrayBuffer());
      expect(Buffer.compare(served, readFileSync(path.join(APP_ROOT, "dist", urlPath)))).toBe(0);
      expect(response.headers.get("cache-control")).toContain("immutable");
    }
  });

  it("serves the favicon byte-for-byte", async () => {
    const response = await realApp().app.request("/favicon.ico");
    const served = new Uint8Array(await response.arrayBuffer());
    const onDisk = readFileSync(path.join(APP_ROOT, "public/favicon.ico"));
    expect(Buffer.compare(served, onDisk)).toBe(0);
  });

  it("links the built stylesheet and script from the page", async () => {
    const { app, assets } = realApp();
    const page = await (await app.request("/")).text();
    for (const href of [...assets.page.styles, ...assets.page.scripts])
      expect(page).toContain(href);
    expect(page).toContain('<svg class="icon"');
  });

  it("types each kind of file correctly", async () => {
    const { app, assets } = realApp();
    const types = new Map<string, string | null>();
    for (const urlPath of assets.files.keys()) {
      types.set(path.extname(urlPath), (await app.request(urlPath)).headers.get("content-type"));
    }
    expect(types.get(".js")).toBe("text/javascript; charset=utf-8");
    expect(types.get(".css")).toBe("text/css; charset=utf-8");
    expect(types.get(".woff2")).toBe("font/woff2");
    expect(types.get(".ico")).toBe("image/x-icon");
  });
});

describe("renderIcon", () => {
  it("sizes the icon by its proportions and escapes its path data", () => {
    expect(renderIcon({ width: 640, height: 512, paths: ['M0 0"<'] })).toBe(
      '<svg class="icon" viewBox="0 0 640 512" width="1.2500em" height="1em" aria-hidden="true" ' +
        'focusable="false"><path d="M0 0&quot;&lt;"></path></svg>',
    );
  });
});
