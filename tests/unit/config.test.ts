/**
 * Protects start-up configuration. A mistyped variable must stop the app with a message that
 * names it, rather than silently running on the wrong domain or with no rate limit.
 */
import { describe, expect, it } from "vitest";
import { ConfigError, DEFAULT_CONFIG, parseConfig } from "../../src/core/config.ts";

describe("parseConfig", () => {
  it("uses the defaults when nothing is set", () => {
    expect(parseConfig({})).toEqual(DEFAULT_CONFIG);
  });

  it("treats empty values as unset", () => {
    expect(parseConfig({ PORT: "", PUBLIC_URL: " ", TRUST_PROXY: "" })).toEqual(DEFAULT_CONFIG);
  });

  it("reads every setting", () => {
    expect(
      parseConfig({
        PORT: "8080",
        HOST: "127.0.0.1",
        PUBLIC_URL: "https://short.example/",
        DATABASE_PATH: "/data/syhr.db",
        TRUST_PROXY: "1",
        RATE_LIMIT_PER_MINUTE: "5",
        RATE_LIMIT_PER_DAY: "50",
      }),
    ).toEqual({
      port: 8080,
      host: "127.0.0.1",
      publicUrl: "https://short.example",
      databasePath: "/data/syhr.db",
      trustProxy: true,
      rateLimitPerMinute: 5,
      rateLimitPerDay: 50,
    });
  });

  it("reports every problem at once", () => {
    const attempt = () =>
      parseConfig({
        PORT: "99999",
        PUBLIC_URL: "syhr.sh/path",
        TRUST_PROXY: "yes",
        RATE_LIMIT_PER_MINUTE: "0",
        RATE_LIMIT_PER_DAY: "1.5",
      });
    expect(attempt).toThrow(ConfigError);
    const names = [
      "PORT",
      "PUBLIC_URL",
      "TRUST_PROXY",
      "RATE_LIMIT_PER_MINUTE",
      "RATE_LIMIT_PER_DAY",
    ];
    for (const name of names) expect(attempt).toThrow(new RegExp(`^- ${name} must be`, "m"));
  });

  it("rejects a PUBLIC_URL with a path", () => {
    expect(() => parseConfig({ PUBLIC_URL: "https://syhr.sh/app" })).toThrow(/PUBLIC_URL/);
  });
});
