# Decisions

Choices made during the 2026 overhaul, each with the reason. The spec ([spec.md](spec.md))
records what the app does; this records why it does it that way. Before "fixing" something that
looks odd, check here.

## Link rules

- **URLs with a username or password are refused.** `https://google.com@evil.example` reads as
  Google but goes to `evil.example`: a standard phishing trick. Honest links almost never need
  it.
- **Public IP literals are allowed; only non-public ones are refused.** The rule is about private
  and local addresses, and `http://8.8.8.8/` is neither. The old app allowed it too.
- **For IPv6, "public" is an allow-list:** global unicast (2000::/3) minus documentation, 6to4
  and Teredo, whose addresses can embed a private IPv4. A block-list would miss ranges.
- **Never-public names are refused:** `.localdomain` (many Linux hosts map
  `localhost.localdomain` to 127.0.0.1), and `.home`, `.corp` and `.mail`, which ICANN will
  never delegate. `.localdomain` was added after the code review found it slipped through.
- **The 2,048-character limit applies to the normalised URL.** Input over 4,096 characters is
  refused before parsing, so huge inputs cost nothing.
- **A bare `host:port` counts as having no scheme.** `example.com:8080/x` gets `https://` added
  instead of being read as the scheme `example.com:`. Explicit non-web schemes (`javascript:`,
  `data:`, `mailto:`, …) are recognised and refused.
- **Empty input has its own refusal (`empty`),** so the browser's check and the no-JS path give
  the same message.
- **The own-domain message names the `PUBLIC_URL` host,** so a copy hosted elsewhere doesn't
  talk about syhr.sh.
- **Blocked domains are checked last, with one indexed query** over the host's enclosing domains.
  Every cheap rule runs first, and the cost doesn't grow with the size of the blocklist.

## Slugs

- **Random slugs come from `crypto` with rejection sampling,** not `Math.random`, so all 62
  characters are equally likely and links are harder to enumerate.
- **Reserved names can't be custom slugs:** `api`, `assets`, `healthz`, `favicon`, `robots`,
  `sitemap`, `static` and `admin`, compared case-insensitively. This leaves room for routes the
  app may add.
- **Custom slugs always create that slug, even for a URL that already has one.** That name was asked for
  explicitly. Without `--slug`, the CLI reuses the existing link, like the site.

## HTTP

- **Refusals use two status codes:** `400` for input that isn't a usable URL, `422` for a valid
  URL we won't accept. Clients can tell "fix your typo" from "not allowed".
- **Only links that pass the rules count towards the rate limit,** including returns of an
  existing link. A typo shouldn't use up someone's allowance, and counting existing links bounds
  how fast one client can probe what's stored.
- **Rate limits apply per /64 for IPv6,** because one subscriber can use any address in it.
- **Behind a proxy, the client is the rightmost `X-Forwarded-For` entry:** the one the reverse
  proxy on the same host appended. Entries to its left come from the client and can be forged.
- **`Referrer-Policy: no-referrer`,** so link targets don't learn the visitor came through
  syhr.sh. The old app sent the browser default. It fits "no tracking".
- **HSTS only when `PUBLIC_URL` is https, and without `includeSubDomains`,** because the app
  can't speak for every subdomain of its domain.
- **Redirects are `302` with `Cache-Control: no-store`,** so a link deleted with the CLI stops
  working at once. A `301` would be cached by browsers indefinitely.
- **The API only takes `application/json` (`415` otherwise), and bodies are capped at 16 KB.**
  The no-JS form posts to `/` and gets HTML back, including for an oversized body, since a
  person is looking at it.
- **Successful health checks aren't logged,** because Docker probes every 30 seconds.
- **The server reads the favicon and built assets into memory at start-up,** so no request
  touches the filesystem or can reach outside those files. It refuses to start without a build,
  and logs and exits if its port can't be used.

## Front end

- **Layout: one centred column,** with text left-aligned inside it. The ".sh" in the title is
  gold, echoing sy.hr.
- **The short link is monospace,** because slugs mix `0`/`O` and `l`/`I`/`1`, which Raleway
  draws almost identically. People read these aloud and type them from screenshots.
- **The waves' palette is darker (#383838 to #1a1a1a), with a vignette behind the text,** so
  white and gold text stay readable. The old grain texture overlay is gone.
- **Wave performance:** at most 30 fps, at most 1.5 device pixels per CSS pixel and 2.5 MP in
  total, and a seeded noise field so the picture is the same on every visit. Rates are per
  second (the old code's per-frame steps ran twice as fast on 120 Hz screens), a pause resumes
  where it left off, and a band's overshoot at restart is kept so the spacing never drifts.
- **Only Latin Raleway woff2 files ship (weights 500 to 800).** Every supported browser reads
  woff2, and the page is Latin-only.
- **The pasted URL stays in the box after success, and focus moves to the short link,** for
  keyboard and screen-reader users.
- **The QR code, Copy and Share need JavaScript.** The spec has the QR code generated in the
  browser.
- **The spinner waits 150 ms before appearing,** so fast responses don't flicker.
- **Copy falls back to `document.execCommand("copy")`** where the async clipboard API is missing
  or refused.
- **The 404 notice disappears once the visitor submits the form.**
- **Tooltips at the ends of the footer row anchor inwards, and the body clips horizontal
  overflow.** The email tooltip poked 27px past a phone's edge and widened the whole layout
  viewport.

## Admin CLI

- **It never creates a database.** With a wrong `DATABASE_PATH`, or run from another directory
  with the relative default, it would otherwise edit a new, empty database the server never
  reads, and report success.
- **It applies the site's rules with no override flag.** The owner can unblock a domain first.
- **Blocking accepts a domain or a URL.** Unblocking doesn't restore deleted links, and says so.
- **Exit codes:** `0` done, `1` refused or not found, `2` bad arguments or configuration. `help`
  needs no configuration or database.
- **The site and the CLI share one "save a link" function** (`src/server/links.ts`), so dedup and
  slug handling can't drift apart.

## Tooling and testing

- **TypeScript is pinned to 6.0.** TypeScript 7 is out, but typescript-eslint 8.70 supports only
  versions below 6.1, and strict type-aware linting matters more. Upgrade both together.
- **esbuild's postinstall is denied (`allowScripts`).** npm 11 blocks install scripts by default,
  and esbuild works without its postinstall (the binary comes from an optional platform package).
- **Three tsconfigs** (Node, browser, e2e), so server code can't use DOM globals and browser code
  can't use Node's.
- **The pre-overhaul app stays testable from git history.** `npm run test:e2e:legacy` extracts
  commit `7af3bb7` (pinned by hash, not tag), installs it and runs the same e2e specs against it.
  Its CDN libraries are served from npm and its browser pings answered locally, so only the old
  server's own fetch of `example.*` needs the network. Tests for changed behaviour skip on
  legacy with the reason. Known old bugs are `test.fail` there, which proves the tests detect
  them. It isn't in CI, because the old app never changes.
- **`tests/fixtures/legacy-shorten.json` is recorded from the old app in a real browser**
  (`npm run fixtures:legacy`). Recording it found the second old bug: `+` stored as a space.
- **API tests use real SQLite files,** one per test, removed afterwards. That exercises WAL and
  schema creation the way production does.
- **WebKit runs in CI only.** It can't be downloaded in every development environment (some
  sandboxed containers block it).
- **The no-JS e2e test follows a link with Enter, not a click.** With JavaScript disabled,
  Playwright's click stability check never settles on an element that ran a CSS animation.
- **Screenshots are reproducible.** `npm run screenshots` pre-creates the example link under a
  fixed slug and emulates reduced motion, so the images only change when the page does.

## Deployment

- **Publishing is a job in the CI workflow,** after the checks and a smoke test of the image, so
  only green commits publish. Without the Docker Hub secrets it logs why and skips; it doesn't
  fail.
- **The Dockerfile takes a `NODE_IMAGE` build argument** (default `node:24-slim`) to pin a
  digest, or to use a base that trusts an intercepting proxy's CA (needed where a proxy re-signs
  TLS).
- **The runtime image holds only `src/core`, `src/content`, `src/server`, `src/cli`, `public/`,
  `dist/` and production dependencies.**
- **`syhr` is on the image's `PATH`, and the example container is named `syhrsh`,** so the admin
  command is `docker exec syhrsh syhr …`.
