/**
 * Renders the one page the site has, in each of its states: fresh, showing a new short link,
 * showing why a link was refused, and as the "link not found" page.
 *
 * The server renders every state, so the form works with no JavaScript at all (it posts to `/`
 * and gets this page back). The browser script (src/browser) enhances the same markup in
 * place. Interpolated values go through Hono's `html` tag, which escapes them.
 */
import { html, raw } from "hono/html";
import type { HtmlEscapedString } from "hono/utils/html";
import {
  DESCRIPTION,
  EMAIL,
  INPUT_PLACEHOLDER,
  MORE_LINK,
  OWNER_URL,
  SITE_NAME,
  TAGLINE,
} from "../content/site.ts";

/** Every icon the page draws: the result card's actions. */
export type IconName = "copy" | "share";

/** The built browser files to include (see server/assets.ts). */
export interface PageAssets {
  styles: readonly string[];
  scripts: readonly string[];
  /** Renders an icon as inline SVG markup; returns "" if icons aren't available. */
  icon: (name: IconName) => string;
}

/** Everything that varies between renders of the page. */
export interface PageState {
  /** "notFound" adds the missing-link notice and a different title. */
  variant: "home" | "notFound";
  /** What's in the box: echoed back so it can be corrected or reused. */
  input?: string;
  /** Set after a successful shorten. */
  result?: { shortUrl: string; url: string };
  /** Set after a refusal: the message to show under the box. */
  error?: string;
}

type Html = HtmlEscapedString | Promise<HtmlEscapedString>;

/**
 * The up-right arrow after the outbound footer link, as on sy.hr. Drawn with strokes, unlike the
 * filled icons from scripts/icons.ts, so it's written out here. Decorative: the link text says
 * where it goes.
 */
const ARROW = raw(
  '<svg class="arrow" width="14" height="14" viewBox="0 0 24 24" fill="none" ' +
    'stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" ' +
    'aria-hidden="true" focusable="false"><path d="M7 17L17 7"></path><path d="M8 7h9v9"></path></svg>',
);

/** sy.hr's footer: the copyright, a pointer to sy.hr and the email address. */
function footer(): Html {
  return html`<footer class="footer">
    <span>&copy; syhr</span>
    <a class="arrow-link" href="${MORE_LINK.href}" target="_blank" rel="noopener"
      >${MORE_LINK.text} ${ARROW}</a
    >
    <a href="mailto:${EMAIL}">${EMAIL}</a>
  </footer>`;
}

function result(state: PageState, assets: PageAssets): Html {
  const shown = state.result;
  return html`<section class="result" aria-labelledby="result-title" ${shown ? "" : raw("hidden")}>
    <h2 class="result-title" id="result-title">Your short link</h2>
    <p class="short-link-row">
      <a class="short-link" href="${shown?.shortUrl ?? ""}">${shown?.shortUrl ?? ""}</a>
    </p>
    <p class="result-target">Goes to <span class="result-url">${shown?.url ?? ""}</span></p>
    <div class="result-actions">
      <button type="button" class="action needs-js" data-action="copy">
        ${raw(assets.icon("copy"))}<span class="action-label">Copy</span>
      </button>
      <button type="button" class="action needs-js" data-action="share" hidden>
        ${raw(assets.icon("share"))}<span class="action-label">Share</span>
      </button>
      <a class="action action-secondary" href="/" data-action="again">Shorten another</a>
    </div>
    <div class="qr needs-js" role="img" aria-label="QR code for the short link"></div>
  </section>`;
}

/** The complete HTML document for `state`. */
export function renderPage(state: PageState, assets: PageAssets): Html {
  const title = state.variant === "notFound" ? `Link not found · ${SITE_NAME}` : SITE_NAME;
  const error = state.error ?? "";
  return html`<!doctype html>
    <html lang="en" class="no-js">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>${title}</title>
        <meta name="description" content="${DESCRIPTION}" />
        <meta name="theme-color" content="#121110" />
        <link rel="icon" href="/favicon.ico" sizes="any" />
        ${assets.styles.map((href) => html`<link rel="stylesheet" href="${href}" />`)}
        ${assets.scripts.map((src) => html`<script type="module" src="${src}"></script>`)}
      </head>
      <body>
        <canvas class="waves" aria-hidden="true"></canvas>
        <main class="shell">
          <header class="intro">
            <h1 class="title">
              ${SITE_NAME.replace(/\.sh$/, "")}<span class="tld name-grow">.sh</span>
            </h1>
            <p class="tagline">
              ${TAGLINE.before}<a href="${OWNER_URL}">${TAGLINE.linkText}</a>${TAGLINE.after}
            </p>
          </header>
          ${
            state.variant === "notFound"
              ? html`<p class="notice">
                  That short link doesn't exist. It may have been mistyped, or removed.
                </p>`
              : ""
          }
          <form class="shorten" method="post" action="/" novalidate>
            <label class="visually-hidden" for="url">Long link</label>
            <div class="field">
              <input
                id="url"
                name="url"
                type="text"
                inputmode="url"
                autocomplete="off"
                autocapitalize="off"
                spellcheck="false"
                placeholder="${INPUT_PLACEHOLDER}"
                value="${state.input ?? ""}"
                aria-describedby="form-error"
                ${error ? raw('aria-invalid="true"') : ""}
              />
              <button type="submit" class="submit">
                <span class="submit-label">Shorten</span>
                <span class="spinner" aria-hidden="true"></span>
              </button>
            </div>
            <p class="form-error" id="form-error" role="alert">${error}</p>
          </form>
          ${result(state, assets)}
        </main>
        ${footer()}
      </body>
    </html>`;
}
