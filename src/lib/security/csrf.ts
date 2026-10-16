import "server-only";
import { NextResponse } from "next/server";
import { buildConfiguredSelfOrigins } from "@/lib/security/self-origins";

const CONFIGURED_ORIGINS = buildConfiguredSelfOrigins();

function requestOrigin(request: Request): string {
  try {
    return new URL(request.url).origin;
  } catch {
    return "";
  }
}

function isAllowed(candidate: string, selfOrigin: string): boolean {
  return candidate === selfOrigin || CONFIGURED_ORIGINS.has(candidate);
}

export function validateOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  const referer = request.headers.get("referer");
  const selfOrigin = requestOrigin(request);

  if (!origin && !referer) return false;

  if (origin) {
    try {
      if (isAllowed(new URL(origin).origin, selfOrigin)) return true;
    } catch {
      return false;
    }
  }

  if (referer) {
    try {
      if (isAllowed(new URL(referer).origin, selfOrigin)) return true;
    } catch {
      return false;
    }
  }

  return false;
}

export function csrfGuard(request: Request): NextResponse | null {
  if (request.method === "GET" || request.method === "HEAD" || request.method === "OPTIONS") return null;
  if (!validateOrigin(request)) {
    return NextResponse.json({ error: "csrf_validation_failed" }, { status: 403 });
  }
  return null;
}
