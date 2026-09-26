/**
 * Vitest global setup: builds the browser assets once before the suites run, because the
 * server-process tests start the real server, which refuses to start without them.
 */
import { buildAssets } from "../../scripts/build.ts";

export default async function setup(): Promise<void> {
  await buildAssets();
}
