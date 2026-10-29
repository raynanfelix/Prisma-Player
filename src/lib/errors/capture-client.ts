"use client";

import { sanitizeError, computeFingerprint } from "./sanitize";

const INGEST_URL = "/api/errors/ingest";
const SESSION_DEDUP_CAP = 10;
const sessionFingerprints = new Set<string>();

let initialized = false;

/**
 * Sends a sanitized error to the ingest endpoint.
 * Fail-open: never throws, never blocks user interaction.
 * Deduplicates per session — same fingerprint sent at most SESSION_DEDUP_CAP times.
 */
async function sendError(input: {
  message: string;
  stack?: string | null;
  route?: string | null;
  component?: string | null;
  severity?: "critical" | "high" | "medium" | "low";
}): Promise<void> {
  try {
    const sanitized = sanitizeError(input);
    const fingerprint = computeFingerprint(sanitized);

    if (sessionFingerprints.has(fingerprint) && sessionFingerprints.size >= SESSION_DEDUP_CAP) {
      return; // Cap reached for this session
    }
    sessionFingerprints.add(fingerprint);

    // Fire-and-forget — don't await, don't block UI
    void fetch(INGEST_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        message: sanitized.message,
        stack: sanitized.stack,
        route: sanitized.route,
        component: sanitized.component,
        severity: sanitized.severity,
      }),
      keepalive: true, // Survives page unload
    }).catch(() => {
      // Silent fail — error capture must never break the app
    });
  } catch {
    // Silent fail
  }
}

/**
 * Initializes global error listeners for client-side capture.
 * Safe to call multiple times — idempotent via `initialized` flag.
 * Should be called once in AppProviders or root layout.
 */
export function initClientErrorCapture(): void {
  if (initialized) return;
  initialized = true;

  // Skip in development to avoid noise from HMR and dev tools
  if (process.env.NODE_ENV === "development") return;

  window.addEventListener("error", (event) => {
    sendError({
      message: event.message || "Uncaught error",
      stack: event.error?.stack ?? null,
      route: typeof window !== "undefined" ? window.location.pathname : null,
      severity: "high",
    });
  });

  window.addEventListener("unhandledrejection", (event) => {
    const reason = event.reason;
    const message =
      reason instanceof Error ? reason.message : String(reason ?? "Unhandled promise rejection");
    const stack = reason instanceof Error ? reason.stack : null;

    sendError({
      message,
      stack,
      route: typeof window !== "undefined" ? window.location.pathname : null,
      severity: "medium",
    });
  });
}

/**
 * Captures an error from a React Error Boundary or explicit try/catch.
 * Public API for components that need manual capture.
 */
export function captureClientError(
  error: unknown,
  options?: { component?: string; severity?: "critical" | "high" | "medium" | "low" },
): void {
  const err = error instanceof Error ? error : new Error(String(error));
  sendError({
    message: err.message,
    stack: err.stack,
    route: typeof window !== "undefined" ? window.location.pathname : null,
    component: options?.component,
    severity: options?.severity ?? "medium",
  });
}