/**
 * The admin command line (`syhr`): what the owner can type, and how results are shown. Pure,
 * so every command's parsing and output is unit-tested; src/cli/main.ts only wires it to the
 * database and the terminal.
 */

/** A parsed command, ready to run. */
export type CliCommand =
  | { kind: "help" }
  | { kind: "links-add"; url: string; slug: string | undefined }
  | { kind: "links-list"; search: string | undefined; limit: number }
  | { kind: "links-delete"; slug: string }
  | { kind: "domains-block"; domain: string }
  | { kind: "domains-unblock"; domain: string }
  | { kind: "domains-list" };

/** How many links `links list` shows unless told otherwise. */
export const DEFAULT_LIST_LIMIT = 20;

/** What `syhr help` prints. */
export const USAGE = `Manage syhr.sh's links and blocked domains.

Usage:
  syhr links add <url> [--slug <custom>]   Add a link (optionally with your own slug)
  syhr links list [--search <text>] [--limit <n>]
                                           List links, newest first (default ${DEFAULT_LIST_LIMIT})
  syhr links delete <slug>                 Delete a link; it will show the 404 page
  syhr domains block <domain>              Refuse a domain (and subdomains) and delete its links
  syhr domains unblock <domain>            Allow a blocked domain again
  syhr domains list                        Show blocked domains
  syhr help                                Show this

Reads DATABASE_PATH and PUBLIC_URL like the server does.`;

/** Parsing result: a command, or what's wrong with the arguments. */
export type CliParse = { ok: true; command: CliCommand } | { ok: false; error: string };

interface SplitArgs {
  positional: string[];
  options: Map<string, string>;
}

/** Splits `--name value` and `--name=value` options from positional arguments. */
function splitArgs(args: readonly string[]): SplitArgs | string {
  const positional: string[] = [];
  const options = new Map<string, string>();
  for (let i = 0; i < args.length; i++) {
    const arg = args[i] ?? "";
    if (!arg.startsWith("--")) {
      positional.push(arg);
      continue;
    }
    const [name, inline] = arg.slice(2).split(/=(.*)/s, 2) as [string, string | undefined];
    const value = inline ?? args[++i];
    if (value === undefined) return `--${name} needs a value`;
    options.set(name, value);
  }
  return { positional, options };
}

function unexpected(options: Map<string, string>, allowed: readonly string[]): string | null {
  const extra = [...options.keys()].find((name) => !allowed.includes(name));
  return extra === undefined ? null : `Unknown option --${extra}`;
}

/** Parses the arguments after `syhr`. */
export function parseCliArgs(args: readonly string[]): CliParse {
  const [first] = args;
  if (first === undefined || ["help", "--help", "-h"].includes(first)) {
    return { ok: true, command: { kind: "help" } };
  }
  const split = splitArgs(args);
  if (typeof split === "string") return { ok: false, error: split };
  const [group, action, ...rest] = split.positional;
  const { options } = split;
  const fail = (error: string): CliParse => ({ ok: false, error });
  const one = (what: string): string | CliParse =>
    rest.length === 1 && rest[0] ? rest[0] : fail(`Expected exactly one ${what}`);

  if (group === "links" && action === "add") {
    const problem = unexpected(options, ["slug"]);
    if (problem) return fail(problem);
    const url = one("URL");
    if (typeof url !== "string") return url;
    return { ok: true, command: { kind: "links-add", url, slug: options.get("slug") } };
  }
  if (group === "links" && action === "list") {
    const problem =
      unexpected(options, ["search", "limit"]) ??
      (rest.length > 0 ? "list takes no arguments" : null);
    if (problem) return fail(problem);
    const rawLimit = options.get("limit");
    const limit = rawLimit === undefined ? DEFAULT_LIST_LIMIT : Number(rawLimit);
    if (!Number.isInteger(limit) || limit < 1)
      return fail("--limit must be a whole number above 0");
    return { ok: true, command: { kind: "links-list", search: options.get("search"), limit } };
  }
  if (group === "links" && action === "delete") {
    const problem = unexpected(options, []);
    if (problem) return fail(problem);
    const slug = one("slug");
    return typeof slug === "string" ? { ok: true, command: { kind: "links-delete", slug } } : slug;
  }
  if (group === "domains" && (action === "block" || action === "unblock")) {
    const problem = unexpected(options, []);
    if (problem) return fail(problem);
    const domain = one("domain");
    if (typeof domain !== "string") return domain;
    return {
      ok: true,
      command: { kind: action === "block" ? "domains-block" : "domains-unblock", domain },
    };
  }
  if (group === "domains" && action === "list") {
    const problem = unexpected(options, []) ?? (rest.length > 0 ? "list takes no arguments" : null);
    return problem ? fail(problem) : { ok: true, command: { kind: "domains-list" } };
  }
  return fail(`Unknown command: ${[group, action].filter(Boolean).join(" ")}`);
}

/** A link as the list shows it. */
export interface ListedLink {
  slug: string;
  url: string;
  createdAt: number;
}

/**
 * Formats links as aligned columns: slug, creation date (UTC), URL. The URL comes last and is
 * never truncated, so it can be copied whole from the terminal.
 */
export function formatLinkTable(links: readonly ListedLink[]): string {
  if (links.length === 0) return "No links.";
  const width = Math.max(4, ...links.map((link) => link.slug.length));
  const rows = links.map(
    (link) =>
      `${link.slug.padEnd(width)}  ${new Date(link.createdAt).toISOString().slice(0, 16).replace("T", " ")}  ${link.url}`,
  );
  return [`${"SLUG".padEnd(width)}  CREATED (UTC)     URL`, ...rows].join("\n");
}
