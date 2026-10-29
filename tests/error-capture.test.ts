import { describe, expect, it } from "vitest";
import {
  sanitizeError,
  computeFingerprint,
  redactSecrets,
  truncateBytes,
} from "../src/lib/errors/sanitize";

describe("redactSecrets", () => {
  it("redacts Stripe live keys", () => {
    expect(redactSecrets("key sk_live_abc123xyz found")).toContain("[REDACTED]");
    expect(redactSecrets("key sk_live_abc123xyz found")).not.toContain("sk_live");
  });

  it("redacts Stripe test keys", () => {
    expect(redactSecrets("sk_test_abc123xyz")).toContain("[REDACTED]");
  });

  it("redacts webhook signing secrets", () => {
    expect(redactSecrets("whsec_abc123def456")).toContain("[REDACTED]");
  });

  it("redacts Bearer tokens", () => {
    expect(redactSecrets("Authorization: Bearer eyJhbGciOiJIUzI1NiJ9.test")).toContain("[REDACTED]");
  });

  it("redacts GitHub PATs", () => {
    expect(redactSecrets("ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghij")).toContain("[REDACTED]");
  });

  it("redacts Telegram bot tokens", () => {
    expect(redactSecrets("1234567890:ABCDefGhIjKlMnOpQrStUvWxYz_-token")).toContain("[REDACTED]");
  });

  it("preserves non-secret content", () => {
    const input = "User login failed for user@example.com on /dashboard";
    expect(redactSecrets(input)).toBe(input);
  });
});

describe("truncateBytes", () => {
  it("returns input unchanged when under limit", () => {
    expect(truncateBytes("short", 100)).toBe("short");
  });

  it("truncates to byte boundary with suffix", () => {
    const long = "a".repeat(3000);
    const result = truncateBytes(long, 100);
    expect(result).toContain("…[truncated]");
    expect(Buffer.byteLength(result, "utf8")).toBeLessThanOrEqual(100 + 20); // suffix overhead
  });

  it("handles multibyte characters correctly", () => {
    const emoji = "😀".repeat(100); // 4 bytes each = 400 bytes
    const result = truncateBytes(emoji, 50);
    expect(result).toContain("…[truncated]");
    // Result should be valid UTF-8 (no replacement chars from broken splits)
    expect(result).not.toContain("\uFFFD");
  });
});

describe("sanitizeError", () => {
  it("produces valid severity defaulting to medium", () => {
    const result = sanitizeError({ message: "test" });
    expect(result.severity).toBe("medium");
  });

  it("accepts valid severities", () => {
    for (const sev of ["critical", "high", "medium", "low"] as const) {
      expect(sanitizeError({ message: "test", severity: sev }).severity).toBe(sev);
    }
  });

  it("rejects invalid severity and defaults to medium", () => {
    expect(sanitizeError({ message: "test", severity: "extreme" }).severity).toBe("medium");
  });

  it("sanitizes secrets in message and stack", () => {
    const result = sanitizeError({
      message: "Failed with sk_live_abc123",
      stack: "Error: whsec_secret\n    at /src/app/route.ts:10:5",
    });
    expect(result.message).not.toContain("sk_live");
    expect(result.stack).not.toContain("whsec_");
  });

  it("truncates stack to 2KB", () => {
    const longStack = "Error\n" + "    at frame\n".repeat(500);
    const result = sanitizeError({ message: "test", stack: longStack });
    expect(result.stack).toBeTruthy();
    expect(Buffer.byteLength(result.stack!, "utf8")).toBeLessThanOrEqual(2048 + 50);
  });

  it("handles missing fields gracefully", () => {
    const result = sanitizeError({});
    expect(result.message).toBe("Unknown error");
    expect(result.stack).toBeNull();
    expect(result.route).toBeNull();
    expect(result.component).toBeNull();
  });
});

describe("computeFingerprint", () => {
  it("produces stable fingerprint for identical errors", () => {
    const a = sanitizeError({ message: "TypeError: x is null", route: "/api/test" });
    const b = sanitizeError({ message: "TypeError: x is null", route: "/api/test" });
    expect(computeFingerprint(a)).toBe(computeFingerprint(b));
  });

  it("produces different fingerprints for different messages", () => {
    const a = sanitizeError({ message: "TypeError: x is null" });
    const b = sanitizeError({ message: "RangeError: index out of bounds" });
    expect(computeFingerprint(a)).not.toBe(computeFingerprint(b));
  });

  it("produces different fingerprints for different routes", () => {
    const a = sanitizeError({ message: "fail", route: "/api/a" });
    const b = sanitizeError({ message: "fail", route: "/api/b" });
    expect(computeFingerprint(a)).not.toBe(computeFingerprint(b));
  });

  it("includes app stack frame in fingerprint when available", () => {
    const withStack = sanitizeError({
      message: "fail",
      stack: "Error: fail\n    at handler (/src/app/api/route.ts:10:5)\n    at node:internal:1:1",
    });
    const withoutStack = sanitizeError({ message: "fail" });
    expect(computeFingerprint(withStack)).not.toBe(computeFingerprint(withoutStack));
  });

  it("ignores node internal frames for fingerprint stability", () => {
    const a = sanitizeError({
      message: "fail",
      stack: "Error: fail\n    at node:internal/process:1:1\n    at node:async_hooks:2:2",
    });
    const b = sanitizeError({ message: "fail" });
    // Both should produce same fingerprint since no app frame exists
    expect(computeFingerprint(a)).toBe(computeFingerprint(b));
  });

  it("fingerprint starts with err_ prefix", () => {
    const fp = computeFingerprint(sanitizeError({ message: "test" }));
    expect(fp).toMatch(/^err_[0-9a-f]{8}$/);
  });
});