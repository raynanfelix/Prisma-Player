import { NextResponse } from "next/server";

/**
 * Origens fixas derivadas do ambiente. Calculadas uma vez e nunca mutadas.
 *
 * A versão anterior fazia `cache.add(origemDaRequisicao)` a cada chamada, ou
 * seja, guardava estado de requisição num Set de módulo. Em serverless, com a
 * instância reaproveitada, o conjunto crescia com todo host que já tinha
 * respondido (incluindo previews) e virava um vazamento lento de memória.
 */
function buildConfiguredOrigins(): ReadonlySet<string> {
  const origins = new Set<string>();
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "");
  if (siteUrl) {
    try { origins.add(new URL(siteUrl).origin); } catch {}
  }
  if (process.env.VERCEL_URL) {
    try { origins.add(new URL(`https://${process.env.VERCEL_URL}`).origin); } catch {}
  }
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) {
    try { origins.add(new URL(`https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`).origin); } catch {}
  }
  if (process.env.NODE_ENV !== "production") origins.add("http://localhost:3000");
  return origins;
}

const CONFIGURED_ORIGINS = buildConfiguredOrigins();

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
