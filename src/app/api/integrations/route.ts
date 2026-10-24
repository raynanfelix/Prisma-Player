import { NextResponse } from "next/server";
import { and, eq, inArray } from "drizzle-orm";

import { guard } from "@/lib/api/guard";
import { readJsonBody } from "@/lib/api/request";
import { csrfGuard } from "@/lib/security/csrf";
import { db, schema } from "@/lib/db";
import {
  deleteIntegration,
  isIntegrationProvider,
  listIntegrations,
  maskIntegrationConfig,
  sanitizeInstanceId,
  sanitizeIntegrationConfig,
  sanitizeInstanceName,
  sanitizeVslIds,
  upsertIntegration,
} from "@/lib/integrations/server";
import { rateLimit } from "@/lib/security/rate-limit";

const { videos } = schema;

function noStore(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { "cache-control": "no-store" } });
}

/**
 * Integrações por CONTA (App Store em /dashboard/integracoes).
 * GET: lista as integrações do dono - campos secretos (tokens, api secrets e
 * URLs de webhook) saem MASCARADOS como "" com flags hasToken/hasWebhookUrl;
 * o valor cru nunca chega ao cliente. PUT: instala/atualiza uma (provider +
 * config validado por provider + vslIds conferidos contra as VSLs do dono;
 * campo secreto vazio preserva o valor salvo). DELETE: remove uma.
 * Tokens/chaves ficam server-side (a rota é do próprio dono, mas a resposta
 * nunca circula fora daqui - no-store).
 *
 * M7 (auditoria): instalar/editar/remover integrações carrega tokens de API
 * da conta - as MESMAS barreiras do player-configs: papel "edit" na equipe e
 * acesso pago ativo (viewer/analyst e conta sem trial/assinatura levam 403).
 */
export async function GET(request: Request) {
  const gate = await guard(request, { csrf: true, role: "edit", paid: true });
  if (!gate.ok) return gate.response;
  const ownerId = gate.account.accountOwnerId;
  const limited = await rateLimit(request, `integrations:${ownerId}`, { max: 60, windowMs: 60_000 });
  if (limited) return limited;
  const items = await listIntegrations(ownerId);
  return noStore({
    integrations: items.map((item) => {
      const masked = maskIntegrationConfig(item.provider, item.config);
      return {
        provider: item.provider,
        instanceId: item.instanceId,
        name: item.name,
        config: masked.config,
        vslIds: item.vslIds,
        enabled: item.enabled,
        updatedAt: item.updatedAt.toISOString(),
        hasToken: masked.hasToken,
        hasWebhookUrl: masked.hasWebhookUrl,
      };
    }),
  });
}

export async function PUT(request: Request) {
  const csrf = csrfGuard(request);
  if (csrf) return csrf;
  const gate = await guard(request, { csrf: true, role: "edit", paid: true });
  if (!gate.ok) return gate.response;
  const ownerId = gate.account.accountOwnerId;
  const limited = await rateLimit(request, `integrations:${ownerId}`, { max: 30, windowMs: 60_000, failClosed: true });
  if (limited) return limited;

  const parsed = await readJsonBody<{ provider?: unknown; config?: unknown; vslIds?: unknown; enabled?: unknown; instanceId?: unknown; name?: unknown }>(request);
  if (!parsed.ok) return parsed.response;
  const body = parsed.body;
  if (!isIntegrationProvider(body?.provider)) return noStore({ error: "invalid_provider" }, 400);
  const provider = body.provider;
  const config = sanitizeIntegrationConfig(provider, body?.config);
  if (config === null) return noStore({ error: "invalid_config" }, 400);
  const vslIds = sanitizeVslIds(body?.vslIds);
  if (vslIds === null) return noStore({ error: "invalid_vsl_ids" }, 400);
  const enabled = body?.enabled !== false;
  if (vslIds.length > 0) {
    const owned = await db
      .select({ id: videos.id })
      .from(videos)
      .where(and(eq(videos.userId, ownerId), inArray(videos.id, vslIds)));
    if (owned.length !== vslIds.length) return noStore({ error: "vsl_not_owned" }, 403);
  }
  await upsertIntegration(ownerId, provider, {
    config,
    vslIds,
    enabled,
    instanceId: sanitizeInstanceId(body?.instanceId),
    name: sanitizeInstanceName(body?.name),
  });
  return noStore({ ok: true, provider, vslIds, enabled });
}

export async function DELETE(request: Request) {
  const csrf = csrfGuard(request);
  if (csrf) return csrf;
  const gate = await guard(request, { csrf: true, role: "edit", paid: true });
  if (!gate.ok) return gate.response;
  const ownerId = gate.account.accountOwnerId;
  const limited = await rateLimit(request, `integrations:${ownerId}`, { max: 30, windowMs: 60_000 });
  if (limited) return limited;
  const parsed = await readJsonBody<{ provider?: unknown; instanceId?: unknown }>(request);
  if (!parsed.ok) return parsed.response;
  if (!isIntegrationProvider(parsed.body?.provider)) return noStore({ error: "invalid_provider" }, 400);
  await deleteIntegration(ownerId, parsed.body.provider, sanitizeInstanceId(parsed.body?.instanceId));
  return noStore({ ok: true });
}
