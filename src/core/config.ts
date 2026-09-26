/**
 * The app's settings, read from environment variables. Parsing is pure and collects every
 * problem at once, so a bad deployment fails at start-up with one clear message instead of
 * misbehaving later.
 */

/** Everything the server needs to know about its environment. */
export interface Config {
  port: number;
  host: string;
  /** Origin short links are built on, and whose host counts as "our own domain". */
  publicUrl: string;
  /** SQLite file; created, with its directory, if missing. */
  databasePath: string;
  /** Trust `X-Forwarded-For` from a reverse proxy (see client-ip.ts). */
  trustProxy: boolean;
  rateLimitPerMinute: number;
  rateLimitPerDay: number;
}

/** Defaults: the old app's port, the real domain, and the rate limits from docs/spec.md. */
export const DEFAULT_CONFIG: Readonly<Config> = {
  port: 4000,
  host: "0.0.0.0",
  publicUrl: "https://syhr.sh",
  databasePath: "./data/syhr.db",
  trustProxy: false,
  rateLimitPerMinute: 10,
  rateLimitPerDay: 100,
};

/** Thrown by {@link parseConfig}; the message lists every problem found. */
export class ConfigError extends Error {
  override name = "ConfigError";
}

type Env = Readonly<Record<string, string | undefined>>;

/** Reads the config from `env` (normally `process.env`), filling in defaults. */
export function parseConfig(env: Env): Config {
  const problems: string[] = [];
  // Unset and empty are the same: `FOO=` in a compose file means "use the default".
  const setting = (name: string): string | undefined => {
    const value = env[name]?.trim();
    return value === "" ? undefined : value;
  };

  const positiveInt = (name: string, fallback: number, max?: number) => {
    const raw = setting(name);
    if (raw === undefined) return fallback;
    const value = Number(raw);
    if (!/^\d+$/.test(raw) || value < 1 || value > (max ?? Number.MAX_SAFE_INTEGER)) {
      const range =
        max === undefined ? "a whole number above 0" : `a whole number from 1 to ${max}`;
      problems.push(`${name} must be ${range}, got "${raw}"`);
      return fallback;
    }
    return value;
  };

  const publicUrl = (() => {
    const raw = setting("PUBLIC_URL");
    if (raw === undefined) return DEFAULT_CONFIG.publicUrl;
    try {
      const url = new URL(raw);
      const isOriginOnly = url.pathname === "/" && url.search === "" && url.hash === "";
      if ((url.protocol === "http:" || url.protocol === "https:") && isOriginOnly) {
        return url.origin;
      }
    } catch {
      // Reported below.
    }
    problems.push(`PUBLIC_URL must be an http(s) origin like https://syhr.sh, got "${raw}"`);
    return DEFAULT_CONFIG.publicUrl;
  })();

  const trustProxy = (() => {
    const raw = setting("TRUST_PROXY")?.toLowerCase();
    if (raw === undefined || raw === "0" || raw === "false") return false;
    if (raw === "1" || raw === "true") return true;
    problems.push(`TRUST_PROXY must be 1/true or 0/false, got "${raw}"`);
    return false;
  })();

  const config: Config = {
    port: positiveInt("PORT", DEFAULT_CONFIG.port, 65535),
    host: setting("HOST") ?? DEFAULT_CONFIG.host,
    publicUrl,
    databasePath: setting("DATABASE_PATH") ?? DEFAULT_CONFIG.databasePath,
    trustProxy,
    rateLimitPerMinute: positiveInt("RATE_LIMIT_PER_MINUTE", DEFAULT_CONFIG.rateLimitPerMinute),
    rateLimitPerDay: positiveInt("RATE_LIMIT_PER_DAY", DEFAULT_CONFIG.rateLimitPerDay),
  };
  if (problems.length > 0)
    throw new ConfigError(`Invalid configuration:\n- ${problems.join("\n- ")}`);
  return config;
}
