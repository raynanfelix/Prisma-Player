import { NextResponse } from "next/server";

import { guard } from "@/lib/api/guard";
import { readJsonBody } from "@/lib/api/request";
import { csrfGuard } from "@/lib/security/csrf";
import { rateLimit } from "@/lib/security/rate-limit";
import { isPixelVerifyProvider, verifyPixelIntegration } from "@/lib/integrations/verify-pixels";

function noStore(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { "cache-control": "no-store" } });
}

/**
 * "Testar conexão" das integrações de anúncio (docs/PIXEL_VERIFY_SPEC.md).
 * Body: { provider: meta_pixel|google_ads|tiktok, instanceId?, config }.
 * Teste PURO - não salva nada: dispara um evento de teste REAL na API oficial
 * da plataforma e devolve a resposta padronizada
 * { ok, platform, message, detail, receivedAt }. Tokens nunca são logados.
 */
export async function POST(request: Request) {
  const csrf = csrfGuard(request);
  if (csrf) return csrf;
  const gate = await guard(request);
  if (!gate.ok) return gate.response;
  const ownerId = gate.account.accountOwnerId;
  const limited = await rateLimit(request, `integrations-verify:${ownerId}`, { max: 10, windowMs: 60_000, failClosed: true });
  if (limited) return limited;

  const parsed = await readJsonBody<{ provider?: unknown; instanceId?: unknown; config?: unknown }>(request);
  if (!parsed.ok) return parsed.response;
  if (!isPixelVerifyProvider(parsed.body?.provider)) return noStore({ error: "invalid_provider" }, 400);
  const rawConfig = parsed.body?.config;
  if (!rawConfig || typeof rawConfig !== "object" || Array.isArray(rawConfig)) return noStore({ error: "invalid_config" }, 400);

  // instanceId é aceito para contexto, mas o teste não persiste nada.
  const verified = await verifyPixelIntegration(parsed.body.provider, rawConfig as Record<string, unknown>);
  return noStore(verified);
}
