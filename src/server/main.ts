/**
 * Starts the server: reads the config from the environment, opens the database and listens.
 * Shuts down cleanly on SIGTERM (what `docker stop` sends) and SIGINT, so the database is
 * closed properly.
 *
 * Run with: npm start
 */
import { serve } from "@hono/node-server";
import { ConfigError, parseConfig } from "../core/config.ts";
import { createApp } from "./app.ts";
import { loadAssets } from "./assets.ts";
import { createLogger, errorFields } from "./log.ts";
import { Store } from "./store.ts";

const log = createLogger();

function start(): void {
  const config = parseConfig(process.env);
  const store = new Store(config.databasePath);
  const assets = loadAssets();
  const app = createApp({ config, store, log, page: assets.page, files: assets.files });

  const server = serve({ fetch: app.fetch, port: config.port, hostname: config.host }, (info) => {
    log("info", "listening", { host: info.address, port: info.port, publicUrl: config.publicUrl });
  });
  // Listening fails asynchronously (port in use, no permission), after start() has returned,
  // so the try/catch below can't see it.
  server.once("error", (error) => {
    log("error", "failed to start", errorFields(error));
    store.close();
    process.exit(1);
  });

  const stop = (signal: string) => {
    log("info", "shutting down", { signal });
    server.close(() => {
      store.close();
      process.exit(0);
    });
    // Don't let a hung keep-alive connection block shutdown forever.
    setTimeout(() => process.exit(0), 5000).unref();
  };
  process.once("SIGTERM", () => {
    stop("SIGTERM");
  });
  process.once("SIGINT", () => {
    stop("SIGINT");
  });
}

try {
  start();
} catch (error) {
  if (error instanceof ConfigError) {
    log("error", error.message);
  } else {
    log("error", "failed to start", errorFields(error));
  }
  process.exit(1);
}
