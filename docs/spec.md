# syhr.sh specification

What the app does, feature by feature. This is the contract the tests check. Change it (and them)
deliberately. Why things are this way is in [decisions.md](decisions.md).

syhr.sh is a public, no-sign-up URL shortener. Anyone can paste a long link and get a short one on
the site's domain. The owner manages links with a command-line tool on the server. It runs as a
single Docker container behind a reverse proxy, with a SQLite file on a volume.

## The page (`GET /`)

- **Wording.** The title is "syhr.sh" and the tagline "A simple web tool for creating short,
  memorable and shareable links. Brought to you by syhr.", where "syhr" links to https://sy.hr.
  The box's placeholder is "Paste a long link".
- **Look.** In the same family as sy.hr: self-hosted Raleway, the gold accent `#f2d27f`, and a
  dark `#171717` background. One centred column. There's no light mode and nothing loads from a
  third party. Zooming is allowed.
- **Waves.** An animated background of layered simplex-noise bands drifting across the screen
  while the scene slowly sways (the pre-overhaul motion, with a darker palette). It pauses while
  the tab is hidden, holds one still frame under `prefers-reduced-motion`, draws at most 30
  frames a second, and caps the canvas resolution.
- **Form.** One box and a **Shorten** button. The button disables while working and shows a
  spinner if the request is slow. A missing scheme gets `https://` added.
- **Result card.** Appears below the form. What was pasted stays in the box. The card shows:
  - the short link, `https://syhr.sh/<slug>`, in monospace so similar characters are
    distinguishable, with focus moved to it;
  - where the link goes;
  - **Copy**, which briefly shows "Copied";
  - **Share**, only where the browser supports `navigator.share`;
  - a **QR code** of the short link, generated in the browser;
  - **Shorten another**.
- **Errors.** Shown inline under the box, saying why (see the messages below), with a short shake
  unless reduced motion is on. Editing the box clears the error. Network and server failures get
  their own messages.
- **Without JavaScript.** The form posts to `/` and the server renders the same page with the
  result or the error. Copy, Share and the QR code need JavaScript and aren't shown.
- **Footer.** sy.hr's profile row: Discord, GitHub, Letterboxd, Spotify, Steam, TryHackMe,
  YouTube and Email. Each is an inline SVG icon in its brand colour, linking through sy.hr's
  short links, with a tooltip showing the username on hover, keyboard focus or touch. Then
  "© syhr" linking to https://sy.hr.

## Short links

- **Slugs** are 6 random characters from `A–Z a–z 0–9`, from a cryptographic source, retried on
  collision. The owner can create custom slugs with the CLI.
- **Dedup.** Shortening a URL that's already stored returns its existing link. URLs are stored and
  compared in WHATWG-normalised form, so `example.com`, `https://EXAMPLE.com` and
  `https://example.com/` are one link. Everything else in the URL (query, `&`, `+`, fragment) is
  kept exactly.
- **Visiting** `GET /<slug>` or `GET /<slug>/` answers `302` with `Cache-Control: no-store`, to
  the stored URL. Slugs are case-sensitive.
- **Unknown slugs** get a `404` page titled "Link not found · syhr.sh". It says "That short link
  doesn't exist. It may have been mistyped, or removed." and has the form, and the notice goes
  away once the visitor submits.
- **No tracking.** No click counts are kept, and no IP addresses are stored or logged.

## What gets refused

Enforced on the server, for the site and the CLI alike. The error codes are part of the API.

| Code                 | When                                                    | Message                                                             |
| -------------------- | ------------------------------------------------------- | ------------------------------------------------------------------- |
| `empty`              | Nothing was entered                                     | Paste a link to shorten it.                                         |
| `invalid_url`        | Not a URL                                               | That isn't a valid web address.                                     |
| `unsupported_scheme` | Not `http:` or `https:`                                 | Only http:// and https:// links can be shortened.                   |
| `too_long`           | Over 2,048 characters once normalised                   | That link is too long (the limit is 2048 characters).               |
| `has_credentials`    | Contains a username or password                         | Links with a username or password in them can't be shortened.       |
| `own_domain`         | The `PUBLIC_URL` host or a subdomain of it              | Links to _host_ can't be shortened again.                           |
| `private_address`    | A private, local or reserved address (see below)        | That address only works inside a private network.                   |
| `url_shortener`      | A known public shortener (bit.ly, tinyurl.com, t.co, …) | That's already a short link. Paste the address it leads to instead. |
| `blocked_domain`     | A domain the owner blocked, or a subdomain of one       | Links to that site can't be shortened here.                         |

Private addresses cover:

- IPv4 in the loopback, private, link-local, CGNAT, documentation, benchmarking, multicast and
  reserved ranges;
- IPv6 outside global unicast, plus documentation, 6to4 and Teredo addresses;
- single-label names;
- names under `localhost`, `localdomain`, `local`, `internal`, `lan`, `home.arpa`, `home`,
  `corp`, `mail`, `invalid` and `test`.

The owner's own sy.hr and rhysbi.shop are never treated as shorteners. The target is never
fetched: there's no reachability check.

## Rate limiting

Creating links is limited per client: 10 a minute and 100 a day by default
(`RATE_LIMIT_PER_MINUTE`, `RATE_LIMIT_PER_DAY`), counted in memory.

- Only links that pass the rules count, including returns of an existing link.
- Refused attempts don't count.
- Redirects are never limited.

The client is the socket address, or the rightmost `X-Forwarded-For` entry when
`TRUST_PROXY=1`. IPv6 clients are grouped by /64. Over the limit, the answer is `429` with
`Retry-After` and the message "You've made a lot of links. Try again in _N seconds/minutes/hours_."

## HTTP interface

| Route                      | Behaviour                                                                                                                                            |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /`                    | The page                                                                                                                                             |
| `POST /`                   | The no-JavaScript form (`url=`): the page with the result (`200`), the error (`400`/`422`), `413` if over 16 KB, or `429`                            |
| `POST /api/links`          | JSON `{"url": "..."}`: `201`/`200` `{slug, shortUrl, url}`; `400`/`422` `{error, message}`; `413`; `415` if not JSON; `429` with `retryAfterSeconds` |
| `GET /:slug`, `/:slug/`    | `302` to the stored URL, or the 404 page                                                                                                             |
| `GET /healthz`             | `200 ok` (not logged when healthy)                                                                                                                   |
| `GET /assets/*`            | Built files with content-hashed names, `Cache-Control: immutable`                                                                                    |
| `GET /favicon.ico`         | The favicon                                                                                                                                          |
| anything else under `/api` | `404` JSON                                                                                                                                           |

Every response has:

- a Content-Security-Policy allowing only the site's own scripts, styles, fonts and
  connections, with `frame-ancestors 'none'`, `form-action 'self'` and `base-uri 'none'`;
- `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff` and
  `Referrer-Policy: no-referrer`;
- HSTS (`max-age=31536000`), only when `PUBLIC_URL` is https.

## Admin CLI (`syhr`)

Run on the server (`docker exec syhrsh syhr …`, or `npm run cli -- …`). It uses the same
`DATABASE_PATH` and `PUBLIC_URL` as the server, and refuses to run if the database file doesn't
exist.

| Command                                           | Effect                                                                               |
| ------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `syhr links add <url> [--slug <custom>]`          | Adds a link under the site's rules; reuses an existing link unless `--slug` is given |
| `syhr links list [--search <text>] [--limit <n>]` | Newest first, default 20; searches slugs and URLs                                    |
| `syhr links delete <slug>`                        | Deletes a link; it then shows the 404 page                                           |
| `syhr domains block <domain or URL>`              | Blocks it and its subdomains, deletes their links and lists them                     |
| `syhr domains unblock <domain>`                   | Unblocks (deleted links don't return)                                                |
| `syhr domains list`                               | Blocked domains, with dates                                                          |
| `syhr help`                                       | Usage                                                                                |

Custom slugs are 1–64 characters of `A–Z a–z 0–9 _ -`, not in use, and not one of `api`,
`assets`, `healthz`, `favicon`, `robots`, `sitemap`, `static` or `admin` (any case). Exit codes:
`0` done, `1` refused or not found, `2` bad arguments or configuration.

## Logging

One JSON object per line on stdout: `time`, `level`, `message` and fields. Every request except
successful health checks logs `method`, `path`, `status` and `ms`. Start-up, shutdown and errors
are logged the same way. Nothing includes a client IP.

## Configuration

| Variable                | Default           | Meaning                                |
| ----------------------- | ----------------- | -------------------------------------- |
| `PORT`                  | `4000`            | Port (1–65535)                         |
| `HOST`                  | `0.0.0.0`         | Address to listen on                   |
| `PUBLIC_URL`            | `https://syhr.sh` | An http(s) origin with no path         |
| `DATABASE_PATH`         | `./data/syhr.db`  | SQLite file; `/data/syhr.db` in Docker |
| `TRUST_PROXY`           | unset             | `1`/`true` to trust `X-Forwarded-For`  |
| `RATE_LIMIT_PER_MINUTE` | `10`              | Whole number above 0                   |
| `RATE_LIMIT_PER_DAY`    | `100`             | Whole number above 0                   |

Empty values mean the default. Invalid values stop start-up with a message listing each one. The
server also stops with a logged error if its port can't be used, or if the browser assets haven't
been built.

## Data

The server creates its SQLite database and schema, versioned with `PRAGMA user_version`, in WAL
mode:

- `links(slug TEXT PRIMARY KEY, url TEXT NOT NULL, created_at INTEGER NOT NULL)`, indexed on
  `url`;
- `blocked_domains(domain TEXT PRIMARY KEY, created_at INTEGER NOT NULL)`.

## Platforms

Current Chrome, Firefox and Safari on desktop, iOS Safari 17+, and Android Chrome. The end-to-end
suite runs at 1440×900 and 390×844 in Chromium, and in WebKit on CI.

## Deployment

A multi-stage image on `node:24-slim`:

- runs as the unprivileged `node` user;
- keeps the database on a `/data` volume;
- has a `HEALTHCHECK` on `/healthz` and `syhr` on the `PATH`;
- exits cleanly on `SIGTERM`.

`compose.yaml` shows the intended setup behind a reverse proxy on the same host. CI checks every
push, then builds and smoke-tests the image. On pushes to `main` it publishes
`syhr/syhrsh:latest` and `:sha-<commit>` for amd64 and arm64, once the `DOCKERHUB_USERNAME` and
`DOCKERHUB_TOKEN` secrets exist.

## Changes from the pre-overhaul app

The app before the overhaul (commit `7af3bb7`, tagged `pre-overhaul`) was an Express + EJS server
with an HTML5 UP template. What was dropped or changed, and why:

| Before                                                                                 | Now, and why                                                                                 |
| -------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Browser and server fetched the target before shortening                                | No reachability check: slow, failed on bot-blocking sites, and the server fetch allowed SSRF |
| The short link replaced what you'd pasted                                              | A result card, keeping the input (losing what was pasted was the old page's worst annoyance) |
| Only the browser refused syhr.sh links (two redirect loops existed)                    | All rules enforced on the server                                                             |
| URLs with `&` were cut short and `+` became a space (the form body was sent unencoded) | URLs are kept exactly                                                                        |
| A failed CDN script silently broke the button                                          | Everything is self-hosted, and the form works without JavaScript                             |
| Tweakpane, victor.js, chroma.js, Sass sources, HTML5 UP CSS, ~3 MB of Font Awesome     | One small stylesheet and inline SVG icons: about 115 KB in total                             |
| `data.db` committed with 5 test rows; no schema creation                               | The app creates and migrates its own database on a volume                                    |
| `POST /shorten` returning JSON inside a JSON string                                    | `POST /api/links` with proper JSON and status codes                                          |
| Unknown slugs showed the home page with `200`                                          | A `404` page                                                                                 |
| Links ended in `/`                                                                     | They don't (old ones still work)                                                             |
| Footer: five icons and "Credits: HTML5 UP"                                             | sy.hr's eight-link profile row                                                               |
| `user-scalable=no`, `console.clear()`, logs with IPs                                   | Removed                                                                                      |
| Express, EJS, node-fetch, body-parser, serve-favicon, better-sqlite3                   | Hono and Node's built-in `node:sqlite`                                                       |
| Node 25 image running as root, database inside the container                           | Node 24 LTS, non-root, database on a volume, health check                                    |
