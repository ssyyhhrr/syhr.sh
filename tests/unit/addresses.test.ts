/**
 * Protects the private-address filter. If it lets an internal address through, syhr.sh becomes
 * a way to disguise links to routers, cloud metadata endpoints or a visitor's own machine; if
 * it blocks public addresses, legitimate links break.
 */
import { describe, expect, it } from "vitest";
import {
  enclosingDomains,
  isPrivateHost,
  isWithinDomain,
  parseIpv4,
  parseIpv6,
} from "../../src/core/addresses.ts";

/** The hostname a browser would actually connect to for `url`. */
const hostOf = (url: string) => new URL(url).hostname;

describe("isPrivateHost", () => {
  it.each([
    "http://localhost/",
    "http://localhost.localdomain/",
    "http://nas.localdomain/",
    "http://printer.home/",
    "http://wiki.corp/",
    "http://LOCALHOST./",
    "http://app.localhost/",
    "http://printer.local/",
    "http://db.internal/",
    "http://nas.lan/",
    "http://router.home.arpa/",
    "http://intranet/",
    "http://127.0.0.1/",
    "http://127.255.255.254/",
    "http://10.1.2.3/",
    "http://172.16.0.1/",
    "http://172.31.255.255/",
    "http://192.168.1.1/",
    "http://169.254.169.254/latest/meta-data/",
    "http://100.64.0.1/",
    "http://0.0.0.0/",
    "http://224.0.0.1/",
    "http://255.255.255.255/",
    // Alternative spellings the URL parser turns into 127.0.0.1.
    "http://2130706433/",
    "http://0x7f.1/",
    "http://0177.0.0.1/",
    "http://[::1]/",
    "http://[::]/",
    "http://[::ffff:127.0.0.1]/",
    "http://[fe80::1]/",
    "http://[fd00::1]/",
    "http://[ff02::1]/",
    "http://[2001:db8::1]/",
    "http://[2002:7f00:1::]/",
  ])("refuses %s", (url) => {
    expect(isPrivateHost(hostOf(url))).toBe(true);
  });

  it.each([
    "https://example.com/",
    "https://sub.domain.example.co.uk/",
    "https://xn--caf-dma.example/",
    "http://8.8.8.8/",
    "http://172.32.0.1/",
    "http://192.169.0.1/",
    "http://[2606:4700:4700::1111]/",
  ])("allows %s", (url) => {
    expect(isPrivateHost(hostOf(url))).toBe(false);
  });
});

describe("IP parsing", () => {
  it("reads dotted IPv4 and rejects anything else", () => {
    expect(parseIpv4("1.2.3.4")).toBe(0x01020304);
    expect(parseIpv4("256.0.0.1")).toBeNull();
    expect(parseIpv4("example.com")).toBeNull();
  });

  it("expands compressed IPv6", () => {
    expect(parseIpv6("[2001:db8::1]")).toEqual([0x2001, 0xdb8, 0, 0, 0, 0, 0, 1]);
    expect(parseIpv6("::")).toEqual([0, 0, 0, 0, 0, 0, 0, 0]);
    expect(parseIpv6("1:2:3:4:5:6:7:8")).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(parseIpv6("1::2::3")).toBeNull();
    expect(parseIpv6("1:2:3")).toBeNull();
    expect(parseIpv6("example.com")).toBeNull();
  });
});

describe("domains", () => {
  it("matches a domain and its subdomains, not look-alikes", () => {
    expect(isWithinDomain("syhr.sh", "syhr.sh")).toBe(true);
    expect(isWithinDomain("WWW.syhr.sh.", "syhr.sh")).toBe(true);
    expect(isWithinDomain("notsyhr.sh", "syhr.sh")).toBe(false);
    expect(isWithinDomain("syhr.sh.evil.example", "syhr.sh")).toBe(false);
  });

  it("lists every enclosing domain, most specific first", () => {
    expect(enclosingDomains("a.b.Example.com.")).toEqual([
      "a.b.example.com",
      "b.example.com",
      "example.com",
      "com",
    ]);
  });
});
