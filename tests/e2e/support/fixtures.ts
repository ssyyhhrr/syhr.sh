/**
 * The `test` every spec uses: Playwright's, with the network isolated (see
 * tests/support/network.ts) and a check that the new app never reaches off-site.
 */
import { test as base, expect } from "@playwright/test";
import { isolateNetwork } from "../../support/network.ts";
import { E2E_BASE_URL, e2eTarget, type E2eTarget } from "./target.ts";

interface Fixtures {
  /** Which app is under test. */
  target: E2eTarget;
}

export const test = base.extend<Fixtures>({
  target: [e2eTarget(), { option: true }],
  context: async ({ context }, use) => {
    const target = e2eTarget();
    const external = await isolateNetwork(context, new URL(E2E_BASE_URL).origin, target);
    await use(context);
    if (target === "new") expect(external, "requests that left the site").toEqual([]);
  },
});

export { expect };
