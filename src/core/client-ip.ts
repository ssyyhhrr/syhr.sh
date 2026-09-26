/**
 * Works out who a request is from, for rate limiting.
 *
 * In production syhr.sh sits behind a reverse proxy on the same host, so every request's socket
 * address is the proxy's. The proxy appends the real client address to `X-Forwarded-For`; the
 * rightmost entry is the one it added, and anything to its left came from the client and can
 * be forged. The header is only trusted when `TRUST_PROXY` is set, so running the app without
 * a proxy can't be tricked into rate-limiting by a made-up address.
 */
import { parseIpv6 } from "./addresses.ts";

/** Where a request came from, as the server sees it. */
export interface RequestOrigin {
  /** The TCP peer address, if known. */
  socketAddress: string | undefined;
  /** The raw `X-Forwarded-For` header, if any. */
  forwardedFor: string | undefined;
  trustProxy: boolean;
}

/** The client's IP address, or "unknown" when there's nothing to go on. */
export function clientIp(origin: RequestOrigin): string {
  if (origin.trustProxy && origin.forwardedFor) {
    const hops = origin.forwardedFor.split(",").map((hop) => hop.trim());
    const nearest = hops.at(-1);
    if (nearest) return unmapIpv4(nearest);
  }
  return origin.socketAddress ? unmapIpv4(origin.socketAddress) : "unknown";
}

/** "::ffff:203.0.113.9" (how dual-stack sockets report IPv4) becomes "203.0.113.9". */
function unmapIpv4(address: string): string {
  return address.toLowerCase().startsWith("::ffff:") && address.includes(".")
    ? address.slice("::ffff:".length)
    : address;
}

/**
 * The key a client is rate-limited under. IPv4 addresses are used as they are. For IPv6, one
 * subscriber normally gets a whole /64 and can use any address in it, so limiting per address
 * would be trivial to dodge; the /64 prefix is the key instead.
 */
export function rateLimitKey(ip: string): string {
  const groups = parseIpv6(ip);
  if (!groups) return ip;
  return `${groups
    .slice(0, 4)
    .map((group) => group.toString(16))
    .join(":")}::/64`;
}
