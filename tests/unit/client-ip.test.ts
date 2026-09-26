/**
 * Protects how a visitor is identified for rate limiting. Trusting a forged X-Forwarded-For
 * lets anyone dodge the limit (or pin it on someone else); ignoring the real proxy header
 * would rate-limit every visitor as one.
 */
import { describe, expect, it } from "vitest";
import { clientIp, rateLimitKey } from "../../src/core/client-ip.ts";

describe("clientIp", () => {
  it("uses the socket address when the proxy isn't trusted", () => {
    expect(
      clientIp({ socketAddress: "203.0.113.9", forwardedFor: "1.2.3.4", trustProxy: false }),
    ).toBe("203.0.113.9");
  });

  it("uses the address the proxy appended, ignoring what the client claimed", () => {
    expect(
      clientIp({
        socketAddress: "127.0.0.1",
        forwardedFor: "6.6.6.6, 198.51.100.7",
        trustProxy: true,
      }),
    ).toBe("198.51.100.7");
  });

  it("falls back to the socket when a trusted proxy sent no header", () => {
    expect(clientIp({ socketAddress: "::1", forwardedFor: undefined, trustProxy: true })).toBe(
      "::1",
    );
  });

  it("unwraps IPv4 addresses reported by dual-stack sockets", () => {
    expect(
      clientIp({ socketAddress: "::ffff:203.0.113.9", forwardedFor: undefined, trustProxy: false }),
    ).toBe("203.0.113.9");
  });

  it("says unknown when there's nothing to go on", () => {
    expect(clientIp({ socketAddress: undefined, forwardedFor: undefined, trustProxy: false })).toBe(
      "unknown",
    );
  });
});

describe("rateLimitKey", () => {
  it("keys IPv4 by address", () => {
    expect(rateLimitKey("203.0.113.9")).toBe("203.0.113.9");
  });

  it("keys IPv6 by /64, so one subscriber can't rotate addresses to dodge the limit", () => {
    expect(rateLimitKey("2001:db8:1:2:aaaa::1")).toBe("2001:db8:1:2::/64");
    expect(rateLimitKey("2001:db8:1:2:bbbb::9")).toBe("2001:db8:1:2::/64");
  });
});
