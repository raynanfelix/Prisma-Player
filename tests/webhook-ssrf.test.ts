import { describe, expect, it } from "vitest";
import { blockedIp } from "@/lib/webhooks/delivery";

describe("blockedIp - SSRF IPv6 (SEC-05)", () => {
  it("bloqueia loopback e unspecified IPv6", () => {
    expect(blockedIp("::1")).toBe(true);
    expect(blockedIp("::")).toBe(true);
  });

  it("bloqueia link-local fe80::/10", () => {
    for (const ip of ["fe80::1", "fe80::a", "fe90::1", "fea0::1", "febf:ffff::1"]) {
      expect(blockedIp(ip)).toBe(true);
    }
  });

  it("bloqueia unique-local fc00::/7 e multicast", () => {
    expect(blockedIp("fc00::1")).toBe(true);
    expect(blockedIp("fd00::1")).toBe(true);
    expect(blockedIp("ff02::1")).toBe(true);
  });

  it("bloqueia IPv4-mapped privado", () => {
    expect(blockedIp("::ffff:10.0.0.1")).toBe(true);
    expect(blockedIp("::ffff:192.168.1.1")).toBe(true);
    expect(blockedIp("::ffff:127.0.0.1")).toBe(true);
  });

  it("mantém IPv4 privado bloqueado e público liberado", () => {
    expect(blockedIp("10.0.0.5")).toBe(true);
    expect(blockedIp("192.168.0.1")).toBe(true);
    expect(blockedIp("8.8.8.8")).toBe(false);
    expect(blockedIp("1.1.1.1")).toBe(false);
  });

  it("libera IPv6 público global", () => {
    expect(blockedIp("2606:4700:4700::1111")).toBe(false);
    expect(blockedIp("2800:3f0:4001:809::200e")).toBe(false);
  });
});
