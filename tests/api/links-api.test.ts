/**
 * Protects the JSON API the page uses to shorten links: status codes, response shape, dedup,
 * refusals and rate limiting. Scripts and the browser both depend on these exact responses.
 */
import { describe, expect, it } from "vitest";
import { testApp } from "./helpers.ts";

interface LinkBody {
  slug: string;
  shortUrl: string;
  url: string;
}

describe("POST /api/links", () => {
  it("creates a link and answers 201 with where it lives", async () => {
    const { shorten } = testApp();
    const response = await shorten("example.com/a?b=1&c=two+words#frag");
    expect(response.status).toBe(201);
    const body = (await response.json()) as LinkBody;
    expect(body.slug).toMatch(/^[A-Za-z0-9]{6}$/);
    expect(body.shortUrl).toBe(`https://syhr.sh/${body.slug}`);
    expect(body.url).toBe("https://example.com/a?b=1&c=two+words#frag");
  });

  it("returns the existing link (200) for a URL it has seen, however it's spelled", async () => {
    const { shorten } = testApp();
    const first = (await (await shorten("example.com")).json()) as LinkBody;
    const again = await shorten("https://EXAMPLE.com/");
    expect(again.status).toBe(200);
    expect(((await again.json()) as LinkBody).slug).toBe(first.slug);
  });

  it("builds links on PUBLIC_URL, and treats that host as its own", async () => {
    const { shorten } = testApp({ publicUrl: "https://short.example" });
    const body = (await (await shorten("example.com")).json()) as LinkBody;
    expect(body.shortUrl).toBe(`https://short.example/${body.slug}`);
    const own = await shorten("https://short.example/abc");
    expect(await own.json()).toMatchObject({
      error: "own_domain",
      message: "Links to short.example can't be shortened again.",
    });
    expect((await shorten("https://syhr.sh/abc")).status).toBe(201);
  });

  it.each([
    ["not a url", 400, "invalid_url"],
    ["ftp://example.com", 400, "unsupported_scheme"],
    ["https://syhr.sh/x", 422, "own_domain"],
    ["http://10.0.0.1/", 422, "private_address"],
    ["https://bit.ly/x", 422, "url_shortener"],
    ["https://a@example.com/", 422, "has_credentials"],
  ])("refuses %s with %i %s and a message", async (url, status, error) => {
    const response = await testApp().shorten(url);
    expect(response.status).toBe(status);
    const body = (await response.json()) as { error: string; message: string };
    expect(body.error).toBe(error);
    expect(body.message.length).toBeGreaterThan(10);
  });

  it("refuses domains the owner has blocked", async () => {
    const { shorten, store } = testApp();
    store.blockDomain("evil.example", 0);
    const response = await shorten("https://www.evil.example/login");
    expect(response.status).toBe(422);
    expect(((await response.json()) as { error: string }).error).toBe("blocked_domain");
  });

  it("insists on a JSON body with a url string", async () => {
    const { request } = testApp();
    const form = await request("/api/links", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: "url=example.com",
    });
    expect(form.status).toBe(415);
    for (const body of ["{", "[]", '{"url": 5}', "{}"]) {
      const response = await request("/api/links", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body,
      });
      expect(response.status).toBe(400);
    }
  });

  it("rejects oversized bodies before reading them", async () => {
    const response = await testApp().shorten(`https://example.com/${"a".repeat(20_000)}`);
    expect(response.status).toBe(413);
  });

  it("answers unknown API paths with JSON 404", async () => {
    const response = await testApp().request("/api/nope");
    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({ error: "not_found" });
  });
});

describe("rate limiting", () => {
  it("allows the per-minute limit, then answers 429 with Retry-After", async () => {
    const { shorten } = testApp({ rateLimitPerMinute: 3 });
    for (let i = 0; i < 3; i++) expect((await shorten(`example.com/${i}`)).status).toBe(201);
    const refused = await shorten("example.com/3");
    expect(refused.status).toBe(429);
    expect(refused.headers.get("retry-after")).toBe("60");
    expect(await refused.json()).toMatchObject({
      error: "rate_limited",
      retryAfterSeconds: 60,
      message: "You've made a lot of links. Try again in 60 seconds.",
    });
  });

  it("lets the client back in once the window passes", async () => {
    const { shorten, advance } = testApp({ rateLimitPerMinute: 1 });
    expect((await shorten("example.com/1")).status).toBe(201);
    expect((await shorten("example.com/2")).status).toBe(429);
    advance(60_001);
    expect((await shorten("example.com/2")).status).toBe(201);
  });

  it("doesn't count refused links against the limit", async () => {
    const { shorten } = testApp({ rateLimitPerMinute: 1 });
    for (let i = 0; i < 5; i++) expect((await shorten("not a url")).status).toBe(400);
    expect((await shorten("example.com")).status).toBe(201);
  });

  it("limits each client separately", async () => {
    const { shorten } = testApp({ rateLimitPerMinute: 1 });
    expect((await shorten("example.com/1", "203.0.113.1")).status).toBe(201);
    expect((await shorten("example.com/2", "203.0.113.2")).status).toBe(201);
    expect((await shorten("example.com/3", "203.0.113.1")).status).toBe(429);
  });

  it("ignores X-Forwarded-For unless told to trust the proxy", async () => {
    const forged = { "x-forwarded-for": "198.51.100.9" };
    const direct = testApp({ rateLimitPerMinute: 1 });
    expect((await direct.shorten("example.com/1", "203.0.113.1", forged)).status).toBe(201);
    // Same socket, different claimed address: still the same client.
    const other = { "x-forwarded-for": "198.51.100.10" };
    expect((await direct.shorten("example.com/2", "203.0.113.1", other)).status).toBe(429);

    const proxied = testApp({ rateLimitPerMinute: 1, trustProxy: true });
    expect((await proxied.shorten("example.com/1", "127.0.0.1", forged)).status).toBe(201);
    expect((await proxied.shorten("example.com/2", "127.0.0.1", other)).status).toBe(201);
  });
});
