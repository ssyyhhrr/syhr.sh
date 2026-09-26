/**
 * Smoke-tests a built Docker image the way it's deployed: starts it with a data volume, then
 * checks the health check, shortening, redirects, the admin command over `docker exec`, that
 * it runs unprivileged, that links survive a restart, and that `docker stop` is clean.
 *
 * Run with: node scripts/docker-smoke.ts [image]   (default syhrsh:local)
 * CI runs it on every push against the image it just built.
 */
import { execFileSync } from "node:child_process";
import assert from "node:assert/strict";

const image = process.argv[2] ?? "syhrsh:local";
const id = `syhrsh-smoke-${process.pid}`;

function docker(...args: string[]): string {
  return execFileSync("docker", args, { encoding: "utf8" }).trim();
}

async function waitFor<T>(
  what: string,
  attempt: () => Promise<T | undefined> | T | undefined,
  seconds = 60,
): Promise<T> {
  for (let i = 0; i < seconds * 4; i++) {
    const value = await Promise.resolve()
      .then(attempt)
      .catch(() => undefined);
    if (value !== undefined) return value;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Timed out waiting for ${what}`);
}

function step(message: string): void {
  console.log(`✓ ${message}`);
}

try {
  docker("volume", "create", id);
  docker(
    "run",
    "-d",
    "--name",
    id,
    "-p",
    "127.0.0.1::4000",
    "-v",
    `${id}:/data`,
    "-e",
    "PUBLIC_URL=https://syhr.sh",
    // Check health every second here, so the smoke test doesn't wait the default 30s.
    "--health-interval",
    "1s",
    "--health-start-period",
    "1s",
    image,
  );
  // The host port is ephemeral, and Docker picks a new one on restart.
  const baseUrl = () =>
    `http://127.0.0.1:${docker("port", id, "4000/tcp").split(":").at(-1) ?? ""}`;
  let base = baseUrl();

  await waitFor("the server", async () => ((await fetch(`${base}/healthz`)).ok ? true : undefined));
  step("serves /healthz");
  await waitFor("Docker's health check", () =>
    docker("inspect", "-f", "{{.State.Health.Status}}", id) === "healthy" ? true : undefined,
  );
  step("Docker reports the container healthy");

  assert.notEqual(docker("exec", id, "id", "-u"), "0", "must not run as root");
  step("runs as an unprivileged user");

  const page = await fetch(`${base}/`);
  assert.equal(page.status, 200);
  const html = await page.text();
  const script = /<script type="module" src="([^"]+)"/.exec(html)?.[1] ?? "";
  assert.equal((await fetch(`${base}${script}`)).status, 200);
  step("renders the page and serves its built script");

  const created = await fetch(`${base}/api/links`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ url: "https://example.com/smoke?a=1&b=2" }),
  });
  assert.equal(created.status, 201);
  const { slug } = (await created.json()) as { slug: string };
  const redirect = await fetch(`${base}/${slug}`, { redirect: "manual" });
  assert.equal(redirect.status, 302);
  assert.equal(redirect.headers.get("location"), "https://example.com/smoke?a=1&b=2");
  step(`shortens and redirects (/${slug})`);

  assert.match(
    docker("exec", id, "syhr", "links", "add", "google.com", "--slug", "kachow"),
    /Added/,
  );
  assert.match(docker("exec", id, "syhr", "links", "list"), new RegExp(slug));
  assert.equal((await fetch(`${base}/kachow`, { redirect: "manual" })).status, 302);
  step("the syhr admin command works over docker exec");

  docker("restart", id);
  base = baseUrl();
  await waitFor("the server after restart", async () =>
    (await fetch(`${base}/healthz`)).ok ? true : undefined,
  );
  assert.equal((await fetch(`${base}/${slug}`, { redirect: "manual" })).status, 302);
  step("links survive a restart (stored on the volume)");

  const started = Date.now();
  docker("stop", id);
  const exitCode = docker("inspect", "-f", "{{.State.ExitCode}}", id);
  assert.equal(exitCode, "0", "docker stop should end the server cleanly");
  assert.ok(Date.now() - started < 8000, "docker stop shouldn't need to kill the server");
  step("docker stop shuts it down cleanly");

  console.log(`\nSmoke test passed for ${image}.`);
} catch (error) {
  console.error(docker("logs", "--tail", "50", id));
  throw error;
} finally {
  execFileSync("docker", ["rm", "-f", id], { stdio: "ignore" });
  execFileSync("docker", ["volume", "rm", "-f", id], { stdio: "ignore" });
}
