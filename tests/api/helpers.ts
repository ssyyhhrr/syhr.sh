/**
 * Builds the app over a throwaway in-memory database for API tests, with a controllable clock
 * and a record of everything it logs.
 */
import { DEFAULT_CONFIG, type Config } from "../../src/core/config.ts";
import { createApp, type StaticFile } from "../../src/server/app.ts";
import type { LogFields, LogLevel } from "../../src/server/log.ts";
import { Store } from "../../src/server/store.ts";

/** One captured log entry. */
export interface LogEntry {
  level: LogLevel;
  message: string;
  fields: LogFields;
}

/** An app under test and the things around it the test can inspect or move. */
export interface TestApp {
  app: ReturnType<typeof createApp>;
  store: Store;
  logs: LogEntry[];
  /** Moves the app's clock forward. */
  advance: (ms: number) => void;
  /** Calls the app as if from `ip` (the TCP peer address). */
  request: (path: string, init?: RequestInit, ip?: string) => Promise<Response>;
  /** POSTs JSON to /api/links. */
  shorten: (url: string, ip?: string, headers?: Record<string, string>) => Promise<Response>;
}

const favicon: StaticFile = {
  body: new Uint8Array([0, 0, 1, 0]),
  contentType: "image/x-icon",
  immutable: false,
};

/** A fresh app. `config` overrides the defaults (production domain, 10/min, 100/day). */
export function testApp(config: Partial<Config> = {}): TestApp {
  const store = new Store(":memory:");
  const logs: LogEntry[] = [];
  let now = Date.UTC(2026, 0, 1);
  const app = createApp({
    config: { ...DEFAULT_CONFIG, ...config },
    store,
    log: (level, message, fields = {}) => logs.push({ level, message, fields }),
    page: { styles: [], scripts: [], icon: () => "" },
    files: new Map([["/favicon.ico", favicon]]),
    now: () => now,
  });
  const request = async (path: string, init: RequestInit = {}, ip = "203.0.113.1") =>
    app.request(path, init, { incoming: { socket: { remoteAddress: ip } } });
  return {
    app,
    store,
    logs,
    advance: (ms) => {
      now += ms;
    },
    request,
    shorten: (url, ip, headers = {}) =>
      request(
        "/api/links",
        {
          method: "POST",
          headers: { "content-type": "application/json", ...headers },
          body: JSON.stringify({ url }),
        },
        ip,
      ),
  };
}
