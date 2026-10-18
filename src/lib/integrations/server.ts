import "server-only";

import { and, eq } from "drizzle-orm";

import { db, schema } from "@/lib/db";

const { accountIntegrations } = schema;

/**
 * Integrações por CONTA (App Store de integrações). Fonte única de verdade:
 * tokens/chaves ficam aqui (server-side) — o client só vê status e eventos.
 * MÚLTIPLAS INSTÂNCIAS por provider: o dono pode cadastrar 5 domínios, 5
 * webhooks de Discord, N pixels — cada instância tem `instanceId` + `name`.
 * Vínculo pixel ↔ VSLs: `vslIds` (array de IDs de VSL) por instância —
 * 1 pixel em N VSLs, N pixels em 1 VSL, combinações livres.
 */

export const INTEGRATION_PROVIDERS = ["meta_pixel", "google_ads", "tiktok", "utmify", "discord", "telegram"] as const;
export type IntegrationProvider = (typeof INTEGRATION_PROVIDERS)[number];

export type IntegrationRow = {
  id: string;
  accountOwnerId: string;
  provider: IntegrationProvider;
  instanceId: string;
  name: string;
  config: Record<string, unknown>;
  vslIds: string[];
  enabled: boolean;
  updatedAt: Date;
};

export function isIntegrationProvider(value: unknown): value is IntegrationProvider {
  return typeof value === "string" && (INTEGRATION_PROVIDERS as readonly string[]).includes(value);
}

/** Validação/sanitização do config por provider. Retorna null se inválido. */
export function sanitizeIntegrationConfig(provider: IntegrationProvider, raw: unknown): Record<string, unknown> | null {
  const input = (raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {}) as Record<string, unknown>;
  const str = (key: string, max: number) => {
    const value = input[key];
    return typeof value === "string" ? value.trim().slice(0, max) : "";
  };
  const META_PIXEL_ID = /^\d{5,20}$/;
  const GOOGLE_TAG_ID = /^(?:G-[A-Z0-9]{5,20}|AW-\d{5,20})$/i;
  const GOOGLE_DESTINATION = /^AW-\d{5,20}\/[A-Za-z0-9_-]{2,100}$/;
  const TIKTOK_PIXEL_ID = /^[A-Z0-9]{10,30}$/i;
  const HTTPS_URL = /^https:\/\/[^\s]+$/i;

  if (provider === "meta_pixel") {
    const pixelId = str("pixelId", 20);
    const accessToken = str("accessToken", 400);
    const testEventCode = str("testEventCode", 40);
    if (pixelId && !META_PIXEL_ID.test(pixelId)) return null;
    if (accessToken && accessToken.length < 16) return null;
    return withVerifyMeta({ pixelId, accessToken, ...(testEventCode ? { testEventCode } : {}) }, input);
  }
  if (provider === "google_ads") {
    const tagId = str("tagId", 40).toUpperCase();
    const conversionDestination = str("conversionDestination", 120);
    const apiSecret = str("apiSecret", 120);
    if (tagId && !GOOGLE_TAG_ID.test(tagId)) return null;
    if (conversionDestination && !GOOGLE_DESTINATION.test(conversionDestination)) return null;
    if (apiSecret && !/^[A-Za-z0-9_-]{20,120}$/.test(apiSecret)) return null;
    return withVerifyMeta({ tagId, conversionDestination, ...(apiSecret ? { apiSecret } : {}) }, input);
  }
  if (provider === "tiktok") {
    const pixelId = str("pixelId", 40).toUpperCase();
    const accessToken = str("accessToken", 400);
    const testEventCode = str("testEventCode", 40);
    if (pixelId && !TIKTOK_PIXEL_ID.test(pixelId)) return null;
    if (accessToken && accessToken.length < 16) return null;
    return withVerifyMeta({ pixelId, ...(accessToken ? { accessToken } : {}), ...(testEventCode ? { testEventCode } : {}) }, input);
  }
  if (provider === "discord" || provider === "telegram") {
    if (provider === "telegram") {
      const botToken = str("botToken", 100);
      const botName = str("botName", 120);
      const botUsername = str("botUsername", 100);
      const chatId = str("chatId", 30);
      const webhookUrl = str("webhookUrl", 500);
      if (botToken && !/^\d{6,12}:[A-Za-z0-9_-]{30,60}$/.test(botToken)) return null;
      if (webhookUrl && !HTTPS_URL.test(webhookUrl)) return null;
      const events = sanitizeEvents(input["events"]);
      return { botToken, botName, botUsername, chatId, ...(webhookUrl ? { webhookUrl } : {}), ...(events ? { events } : {}) };
    }
    const webhookUrl = str("webhookUrl", 500);
    if (webhookUrl && !HTTPS_URL.test(webhookUrl)) return null;
    const events = sanitizeEvents(input["events"]);
    return { webhookUrl, ...(events ? { events } : {}) };
  }
  return {};
}

/** Eventos selecionáveis: { play: true, progress: false, … } — só chaves conhecidas. */
function sanitizeEvents(raw: unknown): Record<string, boolean> | null {
  if (raw === undefined || raw === null) return null;
  if (typeof raw !== "object" || Array.isArray(raw)) return null;
  const allowed = ["play", "progress", "cta_click", "conversion", "complete"];
  const output: Record<string, boolean> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (allowed.includes(key) && typeof value === "boolean") output[key] = value;
  }
  return Object.keys(output).length > 0 ? output : null;
}

/**
 * Metadados do "Testar conexão" (Sprint 1 Pixel Verdadeiro): quando o dono
 * testa uma instância salva, o PUT normal chega com
 * config.lastVerifiedAt (ISO) + config.lastVerifyOk — preservados aqui para
 * o badge "Verificada" da lista e da vitrine. Um re-save sem testar de novo
 * mantém os metadados anteriores (o dono continua vendo a última verificação).
 */
function withVerifyMeta(config: Record<string, unknown>, input: Record<string, unknown>): Record<string, unknown> {
  const lastVerifiedAt = input["lastVerifiedAt"];
  if (typeof lastVerifiedAt === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/.test(lastVerifiedAt.trim().slice(0, 40))) {
    config.lastVerifiedAt = lastVerifiedAt.trim().slice(0, 40);
  }
  const lastVerifyOk = input["lastVerifyOk"];
  if (typeof lastVerifyOk === "boolean") config.lastVerifyOk = lastVerifyOk;
  return config;
}

/** Nome de instância válido: 1–80 caracteres visíveis. */
export function sanitizeInstanceName(raw: unknown): string {
  if (typeof raw !== "string") return "Principal";
  const clean = raw.trim().slice(0, 80);
  return clean || "Principal";
}

/** instanceId válido: slug curto gerado pelo client ou "default". */
export function sanitizeInstanceId(raw: unknown): string {
  if (typeof raw !== "string") return "default";
  const clean = raw.trim().toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, 40);
  return clean || "default";
}

/** vslIds válidos: array de strings sem duplicatas (o dono só vincula VSLs dele — a rota confere posse). */
export function sanitizeVslIds(raw: unknown): string[] | null {
  if (!Array.isArray(raw)) return null;
  const ids = raw.filter((item): item is string => typeof item === "string" && /^[0-9a-f-]{10,64}$/i.test(item.trim())).map((item) => item.trim());
  return ids.length === raw.length ? Array.from(new Set(ids)) : null;
}

function toRow(row: typeof accountIntegrations.$inferSelect): IntegrationRow {
  return {
    id: row.id,
    accountOwnerId: row.accountOwnerId,
    provider: row.provider as IntegrationProvider,
    instanceId: row.instanceId ?? "default",
    name: row.name ?? "Principal",
    config: (row.config && typeof row.config === "object" ? row.config : {}) as Record<string, unknown>,
    vslIds: Array.isArray(row.vslIds) ? (row.vslIds as string[]) : [],
    enabled: row.enabled,
    updatedAt: row.updatedAt,
  };
}

/** Lista TODAS as instâncias de todas as integrações da conta. */
export async function listIntegrations(ownerId: string): Promise<IntegrationRow[]> {
  const rows = await db
    .select()
    .from(accountIntegrations)
    .where(eq(accountIntegrations.accountOwnerId, ownerId))
    .limit(200);
  return rows.map(toRow);
}

/** Instâncias de UM provider (ex.: todos os webhooks de Discord do dono). */
export async function listProviderInstances(ownerId: string, provider: IntegrationProvider): Promise<IntegrationRow[]> {
  const rows = await db
    .select()
    .from(accountIntegrations)
    .where(and(eq(accountIntegrations.accountOwnerId, ownerId), eq(accountIntegrations.provider, provider)));
  return rows.map(toRow);
}

/** Primeira instância de um provider (compat com telas antigas). */
export async function getIntegration(ownerId: string, provider: IntegrationProvider): Promise<IntegrationRow | null> {
  const [row] = await db
    .select()
    .from(accountIntegrations)
    .where(and(eq(accountIntegrations.accountOwnerId, ownerId), eq(accountIntegrations.provider, provider)))
    .limit(1);
  return row ? toRow(row) : null;
}

/**
 * Cria/atualiza UMA instância. `instanceId` distingue múltiplas integrações do
 * mesmo provider (5 domínios, 5 Discords…). Conflito só na tríade
 * (owner, provider, instanceId).
 */
export async function upsertIntegration(
  ownerId: string,
  provider: IntegrationProvider,
  input: { config: Record<string, unknown>; vslIds: string[]; enabled: boolean; instanceId?: string; name?: string },
): Promise<void> {
  const instanceId = input.instanceId ?? "default";
  await db
    .insert(accountIntegrations)
    .values({
      accountOwnerId: ownerId,
      provider,
      instanceId,
      name: input.name ?? "Principal",
      config: input.config,
      vslIds: input.vslIds,
      enabled: input.enabled,
    })
    .onConflictDoUpdate({
      target: [accountIntegrations.accountOwnerId, accountIntegrations.provider, accountIntegrations.instanceId],
      set: {
        name: input.name ?? "Principal",
        config: input.config,
        vslIds: input.vslIds,
        enabled: input.enabled,
        updatedAt: new Date(),
      },
    });
}

/** Remove uma instância específica (ou todas do provider quando sem instanceId). */
export async function deleteIntegration(ownerId: string, provider: IntegrationProvider, instanceId?: string): Promise<void> {
  if (instanceId) {
    await db
      .delete(accountIntegrations)
      .where(and(eq(accountIntegrations.accountOwnerId, ownerId), eq(accountIntegrations.provider, provider), eq(accountIntegrations.instanceId, instanceId)));
    return;
  }
  await db.delete(accountIntegrations).where(and(eq(accountIntegrations.accountOwnerId, ownerId), eq(accountIntegrations.provider, provider)));
}

/**
 * Resolução para o EMBED: as integrações ATIVAS de uma VSL (vsl_ids contém o
 * id da VSL), de QUALQUER instância — todas as fatias de pixel/webhook ativas
 * para o vídeo.
 */
export async function resolveIntegrationsForVideo(ownerId: string, videoId: string): Promise<IntegrationRow[]> {
  const rows = await db
    .select()
    .from(accountIntegrations)
    .where(and(eq(accountIntegrations.accountOwnerId, ownerId), eq(accountIntegrations.enabled, true)));
  return rows
    .filter((row) => Array.isArray(row.vslIds) && (row.vslIds as string[]).includes(videoId))
    .map(toRow);
}
