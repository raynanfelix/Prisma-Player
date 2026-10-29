/**
 * Error sanitization: strips secrets, truncates payloads, and produces a
 * stable fingerprint for deduplication. Shared between client and server
 * (no "server-only" import) so the client can pre-sanitize before sending
 * to the ingest endpoint.
 */

// Regex patterns from alert-webhook.ts — proven secret detectors.
const SECRET_PATTERNS = [
  /whsec_[A-Za-z0-9]+/g,
  /sk_(live|test)_[A-Za-z0-9]+/g,
  /rk_(live|test)_[A-Za-z0-9]+/g,
  /Bearer\s+[A-Za-z0-9\-._~+/]+=*/gi,
  /xox[baprs]-[A-Za-z0-9\-]+/g,
  /ghp_[A-Za-z0-9]{36}/g,
  /AKIA[0-9A-Z]{16}/g,
  /[0-9]{8,10}:[A-Za-z0-9\-_]{20,}/g, // Telegram bot tokens (variable length)
];

const MAX_STACK_BYTES = 2048;
const MAX_CONTEXT_BYTES = 4096;

export function redactSecrets(input: string): string {
  let result = input;
  for (const pattern of SECRET_PATTERNS) {
    result = result.replace(pattern, "[REDACTED]");
  }
  return result;
}

export function truncateBytes(input: string, maxBytes: number): string {
  if (Buffer.byteLength(input, "utf8") <= maxBytes) return input;
  // Binary search for the right character length
  let lo = 0;
  let hi = input.length;
  while (lo < hi) {
    const mid = Math.floor((lo + hi + 1) / 2);
    if (Buffer.byteLength(input.slice(0, mid), "utf8") <= maxBytes) {
      lo = mid;
    } else {
      hi = mid - 1;
    }
  }
  return input.slice(0, lo) + "\n…[truncated]";
}

export interface SanitizedError {
  message: string;
  stack: string | null;
  route: string | null;
  component: string | null;
  severity: "critical" | "high" | "medium" | "low";
}

export function sanitizeError(input: {
  message?: unknown;
  stack?: unknown;
  route?: unknown;
  component?: unknown;
  severity?: unknown;
}): SanitizedError {
  const rawMessage = typeof input.message === "string" ? input.message : "Unknown error";
  const rawStack = typeof input.stack === "string" ? input.stack : null;
  const rawRoute = typeof input.route === "string" ? input.route : null;
  const rawComponent = typeof input.component === "string" ? input.component : null;
  const rawSeverity = typeof input.severity === "string" ? input.severity : "medium";

  const validSeverities = ["critical", "high", "medium", "low"] as const;
  const severity = validSeverities.includes(rawSeverity as (typeof validSeverities)[number])
    ? (rawSeverity as SanitizedError["severity"])
    : "medium";

  const message = truncateBytes(redactSecrets(rawMessage), MAX_CONTEXT_BYTES);
  const stack = rawStack ? truncateBytes(redactSecrets(rawStack), MAX_STACK_BYTES) : null;
  const route = rawRoute ? truncateBytes(redactSecrets(rawRoute), 512) : null;
  const component = rawComponent ? truncateBytes(redactSecrets(rawComponent), 256) : null;

  return { message, stack, route, component, severity };
}

/**
 * Stable fingerprint for deduplication. Uses error type + normalized message
 * + top frame of stack. Resilient to timestamps, request IDs, and other
 * variable data that appears in lower stack frames.
 */
export function computeFingerprint(error: SanitizedError): string {
  const parts: string[] = [error.severity, error.message];

  if (error.stack) {
    // Extract first meaningful frame (skip internal Node/Next frames)
    const lines = error.stack.split("\n").slice(1, 6);
    const appFrame = lines.find(
      (line) =>
        line.includes("/src/") ||
        line.includes("/app/") ||
        line.includes("/lib/") ||
        line.includes("/features/"),
    );
    if (appFrame) {
      // Normalize: strip absolute paths to just src-relative
      const normalized = appFrame
        .replace(/^.*?(\/src\/.*)$/, "$1")
        .replace(/^.*?(\/app\/.*)$/, "$1")
        .replace(/:\d+:\d+$/, "") // strip line:col
        .trim();
      parts.push(normalized);
    }
  }

  if (error.route) parts.push(error.route);

  // Simple hash — SHA-256 is overkill for dedup; djb2 is fast and sufficient
  const str = parts.join("|");
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash + str.charCodeAt(i)) >>> 0;
  }
  return `err_${hash.toString(16).padStart(8, "0")}`;
}