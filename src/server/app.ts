/**
 * The HTTP interface: routes, security headers and request logging, wired to the store and the
 * pure rules in src/core. Everything the app needs is passed in, so tests can build an app over
 * a temporary database and call it in-process with `app.request()`.
 */
import { Hono, type Context } from "hono";
import { bodyLimit } from "hono/body-limit";
import { secureHeaders } from "hono/secure-headers";
import { clientIp, rateLimitKey } from "../core/client-ip.ts";
import type { Config } from "../core/config.ts";
import { REFUSAL_MESSAGES, type Refusal } from "../core/links.ts";
import { looksLikeSlug } from "../core/slugs.ts";
import { errorFields, type Logger } from "./log.ts";
import { renderPage, type PageAssets, type PageState } from "./page.ts";
import { RateLimiter } from "./rate-limiter.ts";
import { shortenLink, type ShortenContext, type ShortenResult } from "./shorten.ts";
import type { Store } from "./store.ts";

/** A file served as-is: the favicon, and the built CSS and JS. */
export interface StaticFile {
  /**
   * The exact bytes, in a buffer of their own. Never pass a Node Buffer's `.buffer`: small
   * Buffers are views into a shared pool, and `.buffer` is the whole pool.
   */
  body: Uint8Array<ArrayBuffer>;
  contentType: string;
  /** Content-hashed names never change content, so browsers may cache them for good. */
  immutable: boolean;
}

/** Everything the app depends on. */
export interface AppDependencies {
  config: Config;
  store: Store;
  log: Logger;
  /** Built assets for the page (stylesheets, scripts, icons). */
  page: PageAssets;
  /** Static files by URL path, e.g. "/favicon.ico" or "/assets/app-3f2a.js". */
  files: ReadonlyMap<string, StaticFile>;
  now?: () => number;
  randomBytes?: (count: number) => Uint8Array;
}

/** What Node's adapter puts in `c.env`; absent when a test calls `app.request()` without it. */
interface Bindings {
  incoming?: { socket?: { remoteAddress?: string } };
}

type AppContext = Context<{ Bindings: Bindings }>;

/** Largest request body accepted. A URL is at most a few KB; anything bigger is abuse. */
const MAX_BODY_BYTES = 16 * 1024;

/**
 * Content-Security-Policy: everything comes from the site itself, nothing may frame it, and
 * forms only post back here. The page has no inline scripts or styles, so none are allowed.
 */
const CONTENT_SECURITY_POLICY = {
  defaultSrc: ["'self'"],
  scriptSrc: ["'self'"],
  styleSrc: ["'self'"],
  imgSrc: ["'self'", "data:"],
  fontSrc: ["'self'"],
  connectSrc: ["'self'"],
  objectSrc: ["'none'"],
  baseUri: ["'none'"],
  formAction: ["'self'"],
  frameAncestors: ["'none'"],
};

/** HTTP status for each refusal: malformed input is 400, input we won't accept is 422. */
const REFUSAL_STATUS: Readonly<Record<Refusal, 400 | 422>> = {
  empty: 400,
  invalid_url: 400,
  unsupported_scheme: 400,
  too_long: 400,
  has_credentials: 422,
  own_domain: 422,
  private_address: 422,
  url_shortener: 422,
  blocked_domain: 422,
};

/** Builds the app. */
export function createApp(deps: AppDependencies): Hono<{ Bindings: Bindings }> {
  const { config, store, log } = deps;
  const limiter = new RateLimiter([
    { max: config.rateLimitPerMinute, windowMs: 60_000 },
    { max: config.rateLimitPerDay, windowMs: 24 * 60 * 60_000 },
  ]);
  const shortenContext: ShortenContext = {
    store,
    limiter,
    publicUrl: config.publicUrl,
    now: deps.now ?? Date.now,
    randomBytes: deps.randomBytes ?? ((count) => crypto.getRandomValues(new Uint8Array(count))),
  };

  const clientKey = (c: AppContext): string =>
    rateLimitKey(
      clientIp({
        // Hono types env as always present, but it's undefined under app.request().
        socketAddress: (c.env as Bindings | undefined)?.incoming?.socket?.remoteAddress,
        forwardedFor: c.req.header("x-forwarded-for"),
        trustProxy: config.trustProxy,
      }),
    );

  const page = (c: AppContext, state: PageState, status: 200 | 400 | 404 | 422 | 429 = 200) =>
    c.html(renderPage(state, deps.page), status);

  const limitBody = bodyLimit({
    maxSize: MAX_BODY_BYTES,
    onError: (c) => c.json({ error: "too_large", message: "That request is too large." }, 413),
  });

  // `strict: false` makes /Ab3dE9/ match the same route as /Ab3dE9, so the old
  // trailing-slash links keep working.
  const app = new Hono<{ Bindings: Bindings }>({ strict: false });

  app.use(async (c, next) => {
    const started = performance.now();
    await next();
    log("info", "request", {
      method: c.req.method,
      path: c.req.path,
      status: c.res.status,
      ms: Math.round(performance.now() - started),
    });
  });

  app.use(
    secureHeaders({
      contentSecurityPolicy: CONTENT_SECURITY_POLICY,
      xFrameOptions: "DENY",
      // Only promise HTTPS when the site is served over it; no includeSubDomains, because this
      // app can't speak for every subdomain of its domain.
      strictTransportSecurity: config.publicUrl.startsWith("https:") ? "max-age=31536000" : false,
    }),
  );

  app.get("/healthz", (c) => {
    c.header("Cache-Control", "no-store");
    return c.text("ok");
  });

  app.get("/", (c) => page(c, { variant: "home" }));

  // The no-JavaScript path: the form posts here and gets the page back with the outcome.
  app.post("/", limitBody, async (c) => {
    const form = await c.req.parseBody();
    const input = typeof form["url"] === "string" ? form["url"] : "";
    const outcome = shortenLink(shortenContext, input, clientKey(c));
    switch (outcome.kind) {
      case "created":
      case "existing":
        return page(c, {
          variant: "home",
          input,
          result: { shortUrl: outcome.shortUrl, url: outcome.url },
        });
      case "refused":
        return page(
          c,
          { variant: "home", input, error: REFUSAL_MESSAGES[outcome.refusal] },
          REFUSAL_STATUS[outcome.refusal],
        );
      case "rate_limited":
        c.header("Retry-After", String(Math.ceil(outcome.retryAfterMs / 1000)));
        return page(c, { variant: "home", input, error: outcome.message }, 429);
    }
  });

  app.post("/api/links", limitBody, async (c) => {
    if (!c.req.header("content-type")?.toLowerCase().startsWith("application/json")) {
      return c.json({ error: "unsupported_media_type", message: "Send JSON." }, 415);
    }
    const body: unknown = await c.req.json().catch(() => null);
    const url = typeof body === "object" && body !== null && "url" in body ? body.url : undefined;
    if (typeof url !== "string") {
      return c.json({ error: "invalid_request", message: 'Send {"url": "..."}.' }, 400);
    }
    return apiResponse(c, shortenLink(shortenContext, url, clientKey(c)));
  });

  app.get("/favicon.ico", (c) => serveFile(c, deps.files.get("/favicon.ico")));
  app.get("/assets/*", (c) => serveFile(c, deps.files.get(c.req.path)));

  app.get("/:slug", (c) => {
    const slug = c.req.param("slug");
    const link = looksLikeSlug(slug) ? store.findBySlug(slug) : undefined;
    if (!link) return page(c, { variant: "notFound" }, 404);
    // Not cached, so a deleted link stops working at once.
    c.header("Cache-Control", "no-store");
    return c.redirect(link.url, 302);
  });

  app.notFound((c) =>
    c.req.path.startsWith("/api/")
      ? c.json({ error: "not_found", message: "No such endpoint." }, 404)
      : page(c, { variant: "notFound" }, 404),
  );

  app.onError((error, c) => {
    log("error", "unhandled error", { path: c.req.path, ...errorFields(error) });
    return c.text("Something went wrong.", 500);
  });

  return app;
}

function apiResponse(c: AppContext, outcome: ShortenResult): Response {
  switch (outcome.kind) {
    case "created":
    case "existing":
      return c.json(
        { slug: outcome.slug, shortUrl: outcome.shortUrl, url: outcome.url },
        outcome.kind === "created" ? 201 : 200,
      );
    case "refused":
      return c.json(
        { error: outcome.refusal, message: REFUSAL_MESSAGES[outcome.refusal] },
        REFUSAL_STATUS[outcome.refusal],
      );
    case "rate_limited": {
      const retryAfterSeconds = Math.ceil(outcome.retryAfterMs / 1000);
      c.header("Retry-After", String(retryAfterSeconds));
      return c.json({ error: "rate_limited", message: outcome.message, retryAfterSeconds }, 429);
    }
  }
}

function serveFile(c: AppContext, file: StaticFile | undefined): Response {
  if (!file) return c.notFound() as Response;
  c.header("Content-Type", file.contentType);
  c.header(
    "Cache-Control",
    file.immutable ? "public, max-age=31536000, immutable" : "public, max-age=86400",
  );
  return c.body(file.body);
}
