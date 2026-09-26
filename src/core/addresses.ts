/**
 * Recognises hosts that point inside a network rather than at the public internet.
 *
 * A public shortener must not hand out links to `localhost`, a router's admin page or a cloud
 * metadata address: that turns syhr.sh into a way to disguise attacks on whoever clicks. Works
 * on hostnames as the WHATWG URL parser serialises them, so exotic spellings such as
 * `http://2130706433/` or `http://0x7f.1/` have already become `127.0.0.1` by the time they
 * arrive here.
 */

/**
 * Names that never resolve on the public internet: reserved ones (RFC 2606, RFC 6761,
 * home.arpa), common private conventions (.lan, .internal, and localdomain, which many Linux
 * systems map to 127.0.0.1 in /etc/hosts), and .home, .corp and .mail, which ICANN will never
 * delegate because so many private networks already use them.
 */
const LOCAL_SUFFIXES = [
  "localhost",
  "localdomain",
  "local",
  "internal",
  "lan",
  "home.arpa",
  "home",
  "corp",
  "mail",
  "invalid",
  "test",
];

/** IPv4 ranges (RFC 6890 and friends) that are not publicly routable, as [address, prefix]. */
const NON_PUBLIC_IPV4: readonly (readonly [string, number])[] = [
  ["0.0.0.0", 8], // "this network"
  ["10.0.0.0", 8], // private
  ["100.64.0.0", 10], // carrier-grade NAT
  ["127.0.0.0", 8], // loopback
  ["169.254.0.0", 16], // link-local, including cloud metadata (169.254.169.254)
  ["172.16.0.0", 12], // private
  ["192.0.0.0", 24], // IETF protocol assignments
  ["192.0.2.0", 24], // documentation
  ["192.168.0.0", 16], // private
  ["198.18.0.0", 15], // benchmarking
  ["198.51.100.0", 24], // documentation
  ["203.0.113.0", 24], // documentation
  ["224.0.0.0", 4], // multicast
  ["240.0.0.0", 4], // reserved, including broadcast
];

const IPV4_PATTERN = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;

/** Parses a dotted-quad IPv4 address into a 32-bit number, or returns null. */
export function parseIpv4(host: string): number | null {
  const match = IPV4_PATTERN.exec(host);
  if (!match) return null;
  let value = 0;
  for (const part of match.slice(1)) {
    const octet = Number(part);
    if (octet > 255) return null;
    value = value * 256 + octet;
  }
  return value;
}

function inIpv4Range(address: number, [base, prefix]: readonly [string, number]): boolean {
  const start = parseIpv4(base) ?? 0;
  const size = 2 ** (32 - prefix);
  return address >= start && address < start + size;
}

/**
 * Parses an IPv6 address (with or without brackets) into its eight 16-bit groups, or returns
 * null. Only handles the forms the WHATWG URL serialiser produces: lowercase hex with at most
 * one `::`, never an embedded dotted IPv4 tail.
 */
export function parseIpv6(host: string): number[] | null {
  const bare = host.startsWith("[") && host.endsWith("]") ? host.slice(1, -1) : host;
  if (!bare.includes(":") || !/^[0-9a-f:]+$/i.test(bare)) return null;
  const halves = bare.split("::");
  if (halves.length > 2) return null;
  const toGroups = (text: string): number[] =>
    text === "" ? [] : text.split(":").map((group) => Number.parseInt(group, 16));
  const head = toGroups(halves[0] ?? "");
  const tail = toGroups(halves[1] ?? "");
  const missing = 8 - head.length - tail.length;
  if (halves.length === 1 ? missing !== 0 : missing < 1) return null;
  const groups = [...head, ...Array<number>(Math.max(missing, 0)).fill(0), ...tail];
  return groups.every((group) => Number.isInteger(group) && group >= 0 && group <= 0xffff)
    ? groups
    : null;
}

/**
 * Whether an IPv6 address is publicly routable. Allow-list rather than block-list: only global
 * unicast (2000::/3) is public, minus the documentation range and the two tunnelling schemes
 * (6to4 and Teredo) whose addresses embed an IPv4 address that could be private.
 */
function isPublicIpv6(groups: readonly number[]): boolean {
  const first = groups[0] ?? 0;
  const second = groups[1] ?? 0;
  if ((first & 0xe000) !== 0x2000) return false;
  if (first === 0x2001 && second === 0x0db8) return false; // documentation
  if (first === 0x2001 && second === 0x0000) return false; // Teredo
  if (first === 0x2002) return false; // 6to4
  return true;
}

/** Strips one trailing dot ("example.com." is the fully qualified form of "example.com"). */
export function withoutTrailingDot(host: string): string {
  return host.endsWith(".") ? host.slice(0, -1) : host;
}

/**
 * Whether `host` (a URL's `hostname`) points somewhere private: a non-public IP address, a
 * reserved local name, or a single-label name like `intranet` that only resolves inside a
 * network.
 */
export function isPrivateHost(host: string): boolean {
  const name = withoutTrailingDot(host.toLowerCase());
  const ipv4 = parseIpv4(name);
  if (ipv4 !== null) return NON_PUBLIC_IPV4.some((range) => inIpv4Range(ipv4, range));
  const ipv6 = parseIpv6(name);
  if (ipv6 !== null) return !isPublicIpv6(ipv6);
  if (name.startsWith("[")) return true; // An IPv6 form we can't read: assume the worst.
  if (!name.includes(".")) return true;
  return LOCAL_SUFFIXES.some((suffix) => name === suffix || name.endsWith(`.${suffix}`));
}

/** Whether `host` is `domain` itself or one of its subdomains. */
export function isWithinDomain(host: string, domain: string): boolean {
  const name = withoutTrailingDot(host.toLowerCase());
  const base = withoutTrailingDot(domain.toLowerCase());
  return name === base || name.endsWith(`.${base}`);
}

/**
 * Every domain `host` sits under, most specific first: `a.b.example.com` gives
 * `a.b.example.com`, `b.example.com`, `example.com` and `com`. Used to look a host up in a list
 * of blocked domains in one query.
 */
export function enclosingDomains(host: string): string[] {
  const labels = withoutTrailingDot(host.toLowerCase()).split(".");
  return labels.map((_, index) => labels.slice(index).join("."));
}
