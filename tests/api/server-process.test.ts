/**
 * Starts the real server process, as Docker does, to protect start-up and shutdown: it must
 * refuse to start with bad settings (naming them), serve once started, and exit cleanly on
 * SIGTERM so `docker stop` doesn't have to kill it.
 */
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const root = path.resolve(import.meta.dirname, "../..");
const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

async function freePort(): Promise<number> {
  return new Promise((resolve) => {
    const server = createServer();
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      server.close(() => {
        resolve(typeof address === "object" && address ? address.port : 0);
      });
    });
  });
}

function startServer(env: Record<string, string>) {
  const dir = mkdtempSync(path.join(tmpdir(), "syhr-proc-"));
  dirs.push(dir);
  const child = spawn(process.execPath, ["src/server/main.ts"], {
    cwd: root,
    env: { ...process.env, DATABASE_PATH: path.join(dir, "syhr.db"), HOST: "127.0.0.1", ...env },
  });
  let output = "";
  child.stdout.on("data", (chunk: Buffer) => (output += chunk.toString()));
  child.stderr.on("data", (chunk: Buffer) => (output += chunk.toString()));
  const exited = new Promise<number | null>((resolve) => child.on("exit", resolve));
  const waitFor = async (text: string) => {
    for (let i = 0; i < 100 && !output.includes(text); i++) {
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    return output;
  };
  return { child, exited, waitFor, output: () => output };
}

describe("the server process", () => {
  it("serves, then exits cleanly on SIGTERM", async () => {
    const port = await freePort();
    const server = startServer({ PORT: String(port) });
    expect(await server.waitFor('"message":"listening"')).toContain(`"port":${port}`);
    const response = await fetch(`http://127.0.0.1:${port}/healthz`);
    expect(await response.text()).toBe("ok");
    server.child.kill("SIGTERM");
    expect(await server.exited).toBe(0);
    expect(server.output()).toContain('"message":"shutting down"');
  });

  it("exits with a logged error when its port is taken", async () => {
    const blocker = createServer();
    const port = await new Promise<number>((resolve) => {
      blocker.listen(0, "127.0.0.1", () => {
        const address = blocker.address();
        resolve(typeof address === "object" && address ? address.port : 0);
      });
    });
    try {
      const server = startServer({ PORT: String(port) });
      expect(await server.exited).toBe(1);
      expect(server.output()).toContain('"message":"failed to start"');
      expect(server.output()).toContain("EADDRINUSE");
    } finally {
      blocker.close();
    }
  });

  it("refuses to start with bad settings, naming each one", async () => {
    const server = startServer({ PORT: "nope", PUBLIC_URL: "syhr.sh" });
    expect(await server.exited).toBe(1);
    expect(server.output()).toContain("PORT must be");
    expect(server.output()).toContain("PUBLIC_URL must be");
  });
});
