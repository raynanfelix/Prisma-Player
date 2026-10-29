/**
 * Next.js Instrumentation Hook (Phase 1 — Error Capture System)
 *
 * Captures unhandled server-side errors from App Router routes,
 * Server Actions, and middleware via onRequestError.
 * Runs in Node runtime; uses dynamic import to avoid edge compatibility issues.
 * Fail-open: never throws, never blocks request processing.
 */

export async function register() {
  // No-op registration — required by Next.js but we only use onRequestError.
}

export async function onRequestError(
  error: Error | unknown,
  request: { method?: string; url?: string; route?: string },
  _context: { routerKind?: string; routeType?: string },
): Promise<void> {
  try {
    // Dynamic import to avoid importing server-only modules at build time
    const { captureServerError } = await import("@/lib/errors/capture-server");

    const route =
      request.route ??
      (request.url ? new URL(request.url, "http://localhost").pathname : null) ??
      "unknown";

    await captureServerError({
      error,
      route,
      severity: "high",
    });
  } catch {
    // Fail-open: instrumentation must never break request handling
  }
}