#!/usr/bin/env node
/**
 * `syhr`: the owner's admin command, run on the server (in Docker:
 * `docker exec syhrsh syhr links list`). Parsing and formatting are in src/core/cli.ts; this
 * file opens the same database the server uses and carries out the command.
 *
 * Exit codes: 0 done, 1 refused or not found, 2 bad arguments or configuration.
 */
import { randomBytes } from "node:crypto";
import { formatLinkTable, parseCliArgs, USAGE, type CliCommand } from "../core/cli.ts";
import { ConfigError, parseConfig, type Config } from "../core/config.ts";
import { evaluateLink, parseDomain, REFUSAL_MESSAGES } from "../core/links.ts";
import { checkCustomSlug, generateSlug, pickFreeSlug, shortUrlFor } from "../core/slugs.ts";
import { Store } from "../server/store.ts";

/** Where output goes; the tests read the real process's streams. */
interface Io {
  out: (text: string) => void;
  err: (text: string) => void;
}

const CUSTOM_SLUG_PROBLEMS = {
  invalid_characters: "Slugs may only use letters, digits, '-' and '_'.",
  too_long: "Slugs can be at most 64 characters.",
  reserved: "That slug is a path the site uses itself.",
} as const;

/** A command that needs the database (everything but help). */
type StoreCommand = Exclude<CliCommand, { kind: "help" }>;

/** Carries out one command. Returns the exit code. */
function run(command: StoreCommand, config: Config, store: Store, io: Io): number {
  const now = Date.now();
  switch (command.kind) {
    case "links-add": {
      const decision = evaluateLink(command.url, {
        ownHost: new URL(config.publicUrl).hostname,
        blockedDomains: store.blockedDomainSet(),
      });
      if (!decision.ok) {
        io.err(REFUSAL_MESSAGES[decision.refusal]);
        return 1;
      }
      if (command.slug === undefined) {
        const existing = store.findByUrl(decision.url);
        if (existing) {
          io.out(`Already shortened: ${shortUrlFor(config.publicUrl, existing.slug)}`);
          return 0;
        }
      }
      let slug: string;
      if (command.slug === undefined) {
        slug = pickFreeSlug(
          () => generateSlug(randomBytes),
          (candidate) => store.hasSlug(candidate),
        );
      } else {
        const problem = checkCustomSlug(command.slug);
        if (problem) {
          io.err(CUSTOM_SLUG_PROBLEMS[problem]);
          return 1;
        }
        if (store.hasSlug(command.slug)) {
          io.err(`The slug "${command.slug}" is already in use.`);
          return 1;
        }
        slug = command.slug;
      }
      store.addLink({ slug, url: decision.url, createdAt: now });
      io.out(`Added ${shortUrlFor(config.publicUrl, slug)} -> ${decision.url}`);
      return 0;
    }

    case "links-list":
      io.out(
        formatLinkTable(
          store.listLinks({
            limit: command.limit,
            ...(command.search === undefined ? {} : { search: command.search }),
          }),
        ),
      );
      return 0;

    case "links-delete":
      if (!store.deleteLink(command.slug)) {
        io.err(`No link with the slug "${command.slug}".`);
        return 1;
      }
      io.out(`Deleted ${shortUrlFor(config.publicUrl, command.slug)}`);
      return 0;

    case "domains-block": {
      const domain = parseDomain(command.domain);
      if (!domain) {
        io.err(`"${command.domain}" isn't a domain.`);
        return 2;
      }
      const deleted = store.blockDomain(domain, now);
      io.out(`Blocked ${domain} and its subdomains.`);
      io.out(
        deleted.length === 0
          ? "No existing links pointed there."
          : `Deleted ${deleted.length} link${deleted.length === 1 ? "" : "s"}:\n${formatLinkTable(deleted)}`,
      );
      return 0;
    }

    case "domains-unblock": {
      const domain = parseDomain(command.domain) ?? command.domain;
      if (!store.unblockDomain(domain)) {
        io.err(`${domain} wasn't blocked.`);
        return 1;
      }
      io.out(`Unblocked ${domain}. Links deleted when it was blocked don't come back.`);
      return 0;
    }

    case "domains-list": {
      const blocked = store.listBlockedDomains();
      io.out(
        blocked.length === 0
          ? "No blocked domains."
          : blocked
              .map(
                (b) => `${b.domain}  (since ${new Date(b.createdAt).toISOString().slice(0, 10)})`,
              )
              .join("\n"),
      );
      return 0;
    }
  }
}

function main(argv: readonly string[]): number {
  const io: Io = {
    out: (text) => process.stdout.write(`${text}\n`),
    err: (text) => process.stderr.write(`${text}\n`),
  };
  const parsed = parseCliArgs(argv);
  if (!parsed.ok) {
    io.err(`${parsed.error}\n\n${USAGE}`);
    return 2;
  }
  // Help needs no configuration or database, so it works anywhere.
  if (parsed.command.kind === "help") {
    io.out(USAGE);
    return 0;
  }
  let config: Config;
  try {
    config = parseConfig(process.env);
  } catch (error) {
    if (error instanceof ConfigError) {
      io.err(error.message);
      return 2;
    }
    throw error;
  }
  const store = new Store(config.databasePath);
  try {
    return run(parsed.command, config, store, io);
  } finally {
    store.close();
  }
}

process.exitCode = main(process.argv.slice(2));
