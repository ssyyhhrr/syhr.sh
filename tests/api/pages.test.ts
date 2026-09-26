/**
 * Protects everything the server renders or redirects: the page and its no-JavaScript form,
 * the 404 page, redirects, static files and the security headers. Visitors and link
 * recipients hit these directly, so status codes and headers matter as much as content.
 */
import { describe, expect, it } from "vitest";
import { testApp } from "./helpers.ts";

const form = (url: string) => ({
  method: "POST",
  headers: { "content-type": "application/x-www-form-urlencoded" },
  body: new URLSearchParams({ url }).toString(),
});

describe("the page", () => {
  it("renders the home page", async () => {
    const response = await testApp().request("/");
    expect(response.status).toBe(200);
    const body = await response.text();
    expect(body).toContain("<title>syhr.sh</title>");
    expect(body).toContain('placeholder="Paste a long link"');
  });

  it("sends strict security headers", async () => {
    const response = await testApp().request("/");
    const csp = response.headers.get("content-security-policy") ?? "";
    expect(csp).toContain("script-src 'self'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(response.headers.get("x-frame-options")).toBe("DENY");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(response.headers.get("referrer-policy")).toBe("no-referrer");
    expect(response.headers.get("strict-transport-security")).toBe("max-age=31536000");
  });

  it("doesn't promise HTTPS when served over plain HTTP", async () => {
    const response = await testApp({ publicUrl: "http://localhost:4000" }).request("/");
    expect(response.headers.get("strict-transport-security")).toBeNull();
  });
});

describe("the no-JavaScript form", () => {
  it("shows the new short link", async () => {
    const { request, store } = testApp();
    const response = await request("/", form("example.com/page"));
    expect(response.status).toBe(200);
    const [link] = store.listLinks({ limit: 1 });
    const body = await response.text();
    expect(body).toContain(`<a class="short-link" href="https://syhr.sh/${link?.slug ?? "?"}">`);
    expect(body).toContain("https://example.com/page");
  });

  it("shows why a link was refused and keeps the input, escaped", async () => {
    const { request } = testApp();
    const response = await request("/", form('https://syhr.sh/"><script>alert(1)</script>'));
    expect(response.status).toBe(422);
    const body = await response.text();
    expect(body).toContain("Links to syhr.sh can&#39;t be shortened again.");
    expect(body).toContain("&quot;&gt;&lt;script&gt;");
    expect(body).not.toContain("<script>alert(1)");
  });

  it("answers an oversized submission with the page, not JSON", async () => {
    const { request } = testApp();
    const response = await request("/", form(`https://example.com/${"a".repeat(20_000)}`));
    expect(response.status).toBe(413);
    expect(response.headers.get("content-type")).toMatch(/text\/html/);
    expect(await response.text()).toContain("That link is too long");
  });

  it("answers 429 with Retry-After when the client is over the limit", async () => {
    const { request } = testApp({ rateLimitPerMinute: 1 });
    await request("/", form("example.com/1"));
    const response = await request("/", form("example.com/2"));
    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("60");
    expect(await response.text()).toContain("Try again in 60 seconds");
  });
});

describe("redirects", () => {
  it("sends a short link to its URL, uncached, with or without a trailing slash", async () => {
    const { request, store } = testApp();
    store.addLink({ slug: "kachow", url: "https://example.com/", createdAt: 0 });
    for (const path of ["/kachow", "/kachow/"]) {
      const response = await request(path);
      expect(response.status).toBe(302);
      expect(response.headers.get("location")).toBe("https://example.com/");
      expect(response.headers.get("cache-control")).toBe("no-store");
    }
  });

  it("treats slugs as case-sensitive", async () => {
    const { request, store } = testApp();
    store.addLink({ slug: "AbCdEf", url: "https://example.com/", createdAt: 0 });
    expect((await request("/abcdef")).status).toBe(404);
  });

  it("answers HEAD like GET", async () => {
    const { request, store } = testApp();
    store.addLink({ slug: "kachow", url: "https://example.com/", createdAt: 0 });
    const response = await request("/kachow", { method: "HEAD" });
    expect(response.status).toBe(302);
  });

  it.each(["/nope12", "/has.dot", "/two/segments", "/%F0%9F%98%80"])(
    "shows the 404 page for %s",
    async (path) => {
      const response = await testApp().request(path);
      expect(response.status).toBe(404);
      expect(await response.text()).toContain("That short link doesn't exist.");
    },
  );
});

describe("other routes", () => {
  it("reports health", async () => {
    const response = await testApp().request("/healthz");
    expect(response.status).toBe(200);
    expect(await response.text()).toBe("ok");
  });

  it("serves the favicon and 404s missing assets", async () => {
    const { request } = testApp();
    const favicon = await request("/favicon.ico");
    expect(favicon.status).toBe(200);
    expect(favicon.headers.get("content-type")).toBe("image/x-icon");
    expect((await request("/assets/missing.js")).status).toBe(404);
  });

  it("logs each request without the client's IP", async () => {
    const { request, logs } = testApp();
    await request("/nope12", {}, "203.0.113.77");
    expect(logs).toContainEqual({
      level: "info",
      message: "request",
      fields: expect.objectContaining({ method: "GET", path: "/nope12", status: 404 }) as unknown,
    });
    expect(JSON.stringify(logs)).not.toContain("203.0.113.77");
  });

  it("doesn't log successful health checks, which Docker makes every 30 seconds", async () => {
    const { request, logs } = testApp();
    await request("/healthz");
    expect(logs).toEqual([]);
  });
});
