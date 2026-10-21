import "server-only";

import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { domainAllowed, normalizeHost } from "@/lib/security/embed-origin";
import { deliverWebhook } from "@/lib/webhooks/delivery";
import { getAccountPlan, getMonthPlaysUsed } from "@/lib/access/service";
import { pixelIntegrations } from "@/lib/player/pixels";
import { deliverServerPurchase } from "@/services/ads/server-events";
import type { NormalizedAnalyticsEvent } from "@/lib/player/analytics-batch";
import { isValidViewerId } from "@/lib/player/viewer-id";

const { videos, playerConfigs, videoEvents, videoLiveSessions, intelligenceControls } = schema;

export type IngestClientContext = { device: string; os: string; browser: string; ua: string };

export type IngestPageContext = { pageUrl: string | null; params: URLSearchParams; source: string };

export type AnalyticsIngestCommand = {
  videoId: string;
  sessionId: string;
  events: NormalizedAnalyticsEvent[];
  firstPartyOrigin: boolean;
  originHeader: string;
  userAgent: string;
  countryHeader: string | null;
  peerIpCandidate: string | null;
  pageUrlValue: unknown;
  viewerIdValue: unknown;
};

export type AnalyticsIngestOutcome =
  | { kind: "video_not_found" }
  | { kind: "player_not_published" }
  | { kind: "invalid_origin" }
  | { kind: "live_session_write_failed" }
  | { kind: "no_content" }
  | { kind: "event_write_failed" }
  | { kind: "ingested"; quotaHeaders: Record<string, string>; runSideEffects: () => Promise<void> };

type ReadyIngestTarget = { video: { id: string; userId: string; title: string }; allowedDomains: string[]; config: Record<string, unknown> };

type IngestTarget =
  | { kind: "video_not_found" }
  | { kind: "player_not_published" }
  | ({ kind: "ready" } & ReadyIngestTarget);

type DeliveryControls = { outgoingWebhooksEnabled: boolean; webhookUrl: string | null; webhookEvents: string[] };

type DerivedIngestContext = { client: IngestClientContext; countryCode: string; page: IngestPageContext; viewerId: string | undefined };

/**
 * Ingestão de um lote de eventos de analytics já validado: carrega vídeo e
 * player publicados, checa permissão de origem, grava a sessão live e os
 * eventos (idempotente por dedupe) e devolve os efeitos laterais (webhooks +
 * CAPI) para o after() da rota.
 */
export async function ingestAnalyticsEvents(command: AnalyticsIngestCommand): Promise<AnalyticsIngestOutcome> {
  const target = await findIngestTarget(command.videoId);
  if (target.kind !== "ready") return target;
  if (!command.firstPartyOrigin && !originHostAllowed(target.allowedDomains, command.originHeader)) {
    return { kind: "invalid_origin" };
  }
  const context = buildIngestContext(command);
  const lastEvent = command.events[command.events.length - 1];
  const sessionWritten = await upsertLiveSession(target.video, command.sessionId, { lastEvent, viewerId: context.viewerId, countryCode: context.countryCode, deviceType: context.client.device });
  if (!sessionWritten) return { kind: "live_session_write_failed" };
  const actionable = command.events.filter((event) => event.eventType !== "heartbeat");
  if (actionable.length === 0) return { kind: "no_content" };
  return await persistIngestedBatch(target, command, context, actionable);
}

function buildIngestContext(command: AnalyticsIngestCommand): DerivedIngestContext {
  return {
    client: clientContextFrom(command.userAgent),
    countryCode: normalizedCountry(command.countryHeader),
    page: pageContextFrom(command.pageUrlValue),
    // Viewer ID persistente entre visitas. Nunca persistimos um valor invalido:
    // sem viewerId valido o campo fica de fora (undefined => default/null na tabela).
    viewerId: normalizedViewerId(command.viewerIdValue),
  };
}

async function persistIngestedBatch(target: ReadyIngestTarget, command: AnalyticsIngestCommand, context: DerivedIngestContext, actionable: NormalizedAnalyticsEvent[]): Promise<AnalyticsIngestOutcome> {
  const quotaHeaders = await quotaHeadersOf(target.video.userId);
  const eventContext: EventRowContext = { videoId: target.video.id, userId: target.video.userId, sessionId: command.sessionId, client: context.client, page: context.page, countryCode: context.countryCode, viewerId: context.viewerId };
  const writtenRows = await persistEventRows(actionable.map((event) => buildEventRow(eventContext, event)));
  if (!writtenRows) return { kind: "event_write_failed" };
  const input = sideEffectsInput(command, context, target, actionable, writtenRows);
  return { kind: "ingested", quotaHeaders, runSideEffects: () => deliverIngestSideEffects(input) };
}

function sideEffectsInput(command: AnalyticsIngestCommand, context: DerivedIngestContext, target: ReadyIngestTarget, actionable: NormalizedAnalyticsEvent[], writtenRows: Array<{ eventType: string; progressPercent: number }>): IngestSideEffectsInput {
  return {
    firstPartyOrigin: command.firstPartyOrigin,
    sessionId: command.sessionId,
    countryCode: context.countryCode,
    client: context.client,
    pageUrl: context.page.pageUrl,
    peerIp: trustedPeerIp(command.peerIpCandidate),
    video: { id: target.video.id, user_id: target.video.userId, title: target.video.title },
    playerConfig: target.config,
    events: actionable,
    persistedKeys: persistedEventKeys(writtenRows),
  };
}

function clientContextFrom(ua: string): IngestClientContext {
  const device = /ipad|tablet/i.test(ua) ? "tablet" : /mobi|iphone|android/i.test(ua) ? "mobile" : ua ? "desktop" : "other";
  const os = /windows/i.test(ua) ? "Windows" : /iphone|ipad|ios/i.test(ua) ? "iOS" : /android/i.test(ua) ? "Android" : /mac os|macintosh/i.test(ua) ? "macOS" : /linux/i.test(ua) ? "Linux" : "Other";
  const browser = /edg\//i.test(ua) ? "Edge" : /firefox\//i.test(ua) ? "Firefox" : /chrome\//i.test(ua) ? "Chrome" : /safari\//i.test(ua) ? "Safari" : "Other";
  return { device, os, browser, ua };
}

function pageContextFrom(value: unknown): IngestPageContext {
  if (typeof value !== "string" || value.length > 2048) return { pageUrl: null, params: new URLSearchParams(), source: "Direto" };
  try {
    const url = new URL(value);
    if (!/^https?:$/.test(url.protocol)) throw new Error();
    url.hash = "";
    return { pageUrl: url.toString().slice(0, 1000), params: url.searchParams, source: url.hostname.replace(/^www\./, "").slice(0, 120) || "Direto" };
  } catch { return { pageUrl: null, params: new URLSearchParams(), source: "Direto" }; }
}

function first(params: URLSearchParams, names: string[]) {
  for (const name of names) { const value = params.get(name)?.trim(); if (value) return value.slice(0, 160); }
  return null;
}

function riskReasonsFor(ua: string, event: NormalizedAnalyticsEvent): string[] {
  const reasons: string[] = [];
  if (!ua) reasons.push("missing_user_agent");
  if (/bot|crawler|spider|headless|curl|wget|python|scrapy|phantom/i.test(ua)) reasons.push("automation_user_agent");
  if (event.eventType === "complete" && event.watchedSeconds < 3) reasons.push("impossible_completion");
  return reasons;
}

function normalizedCountry(header: string | null): string {
  const country = (header ?? "XX").toUpperCase().slice(0, 2);
  return country.length === 2 ? country : "XX";
}

function normalizedViewerId(value: unknown): string | undefined {
  return typeof value === "string" && value.length <= 64 && isValidViewerId(value) ? value : undefined;
}

/**
 * IP de peer da plataforma para o CAPI. `x-forwarded-for` é controlável pelo
 * cliente (RM-03 item 2): não o repassamos para o payload do Meta/TikTok.
 * Preferimos os headers que a própria plataforma sobrescreve (Vercel/real-ip) e
 * omitimos o campo quando não há um valor confiável.
 */
function trustedPeerIp(candidate: string | null): string {
  const first = candidate?.split(",")[0]?.trim();
  return first && first !== "unknown" && first !== "::1" ? first : "";
}

function originHostAllowed(allowedDomains: string[], originHeader: string): boolean {
  const originHost = normalizeHost(originHeader);
  return Boolean(originHost) && domainAllowed(originHost, allowedDomains);
}

async function findIngestTarget(videoId: string): Promise<IngestTarget> {
  let video: { id: string; userId: string; status: string; title: string } | undefined;
  let player: { id: string; allowedDomains: string[]; config: unknown } | undefined;
  try {
    [video] = await db.select({ id: videos.id, userId: videos.userId, status: videos.status, title: videos.title }).from(videos).where(eq(videos.id, videoId)).limit(1);
  } catch {
    video = undefined;
  }
  try {
    [player] = await db.select({ id: playerConfigs.id, allowedDomains: playerConfigs.allowedDomains, config: playerConfigs.config }).from(playerConfigs).where(and(eq(playerConfigs.videoId, videoId), eq(playerConfigs.published, true))).limit(1);
  } catch {
    player = undefined;
  }
  if (!video || video.status !== "ready") return { kind: "video_not_found" };
  if (!player) return { kind: "player_not_published" };
  const allowedDomains = Array.isArray(player.allowedDomains) ? player.allowedDomains.filter((item): item is string => typeof item === "string") : [];
  const config = (player.config && typeof player.config === "object" ? player.config : {}) as Record<string, unknown>;
  return { kind: "ready", video: { id: video.id, userId: video.userId, title: video.title }, allowedDomains, config };
}

type LiveSessionInput = { lastEvent: NormalizedAnalyticsEvent; viewerId: string | undefined; countryCode: string; deviceType: string };

async function upsertLiveSession(video: { id: string; userId: string }, sessionId: string, input: LiveSessionInput): Promise<boolean> {
  const lastSeenAt = new Date();
  try {
    // Upsert com a MESMA chave de antes (video_id, session_id - PK composta de
    // video_live_sessions). viewer_id entra no update apenas quando presente -
    // sem viewer, o valor anterior permanece (mesma semântica de omitir o campo
    // no payload do upsert anterior).
    const liveUpsert = {
      userId: video.userId,
      countryCode: input.countryCode,
      deviceType: input.deviceType,
      progressPercent: input.lastEvent.progressPercent,
      lastSeenAt,
      ...(input.viewerId ? { viewerId: input.viewerId } : {}),
    };
    await db
      .insert(videoLiveSessions)
      .values({ videoId: video.id, sessionId, ...liveUpsert })
      .onConflictDoUpdate({ target: [videoLiveSessions.videoId, videoLiveSessions.sessionId], set: liveUpsert });
    return true;
  } catch {
    return false;
  }
}

async function quotaHeadersOf(userId: string): Promise<Record<string, string>> {
  // Medição de plays do mês para observabilidade de overage. included_plays é
  // cota com cobrança por excedente, não bloqueio - eventos legítimos nunca são
  // negados aqui. O consumo real é exposto em /api/account/overview.
  let quotaHeaders: Record<string, string> = {};
  try {
    const [plan, monthPlays] = await Promise.all([getAccountPlan(userId), getMonthPlaysUsed(userId)]);
    const limit = plan.quotas.includedPlays;
    if (limit !== null && limit !== undefined) {
      quotaHeaders = {
        "x-plays-used": String(monthPlays),
        "x-plays-limit": String(limit),
        ...(monthPlays > limit ? { "x-plays-overage": String(monthPlays - limit) } : {}),
      };
    }
  } catch {
    quotaHeaders = {};
  }
  return quotaHeaders;
}

type EventRowContext = {
  videoId: string;
  userId: string;
  sessionId: string;
  client: IngestClientContext;
  page: IngestPageContext;
  countryCode: string;
  viewerId: string | undefined;
};

function buildEventRow(ctx: EventRowContext, event: NormalizedAnalyticsEvent) {
  const riskReasons = riskReasonsFor(ctx.client.ua, event);
  const riskScore = Math.min(100, riskReasons.reduce((score, reason) => score + (reason === "missing_user_agent" ? 25 : 50), 0));
  return {
    userId: ctx.userId, videoId: ctx.videoId, sessionId: ctx.sessionId, eventType: event.eventType, progressPercent: event.progressPercent, watchedSeconds: String(event.watchedSeconds),
    countryCode: ctx.countryCode, deviceType: ctx.client.device, osName: ctx.client.os, browserName: ctx.client.browser, trafficSource: ctx.page.source,
    pageUrl: ctx.page.pageUrl, campaignId: first(ctx.page.params, ["campaign_id", "fb_campaign_id", "utm_campaign"]), creativeId: first(ctx.page.params, ["creative_id", "adset_id", "utm_content"]),
    adId: first(ctx.page.params, ["ad_id", "fb_ad_id"]), utmSource: first(ctx.page.params, ["utm_source"]), utmMedium: first(ctx.page.params, ["utm_medium"]), utmCampaign: first(ctx.page.params, ["utm_campaign"]), riskScore, riskReasons,
    transactionId: event.transactionId, conversionValue: event.value === null ? null : String(event.value), currency: event.currency, advertisingConsent: event.advertisingConsent,
    ...(ctx.viewerId ? { viewerId: ctx.viewerId } : {}),
  };
}

async function persistEventRows(rows: Array<ReturnType<typeof buildEventRow>>): Promise<Array<{ eventType: string; progressPercent: number }> | null> {
  // Chave de dedupe (video_id,session_id,event_type,
  // progress_percent => video_events_session_event_key). DO NOTHING absorve
  // duplicatas - inclusive dentro do mesmo lote - e `.returning()` devolve só
  // as linhas realmente persistidas, que é o que o after() usa.
  try {
    return await db
      .insert(videoEvents)
      .values(rows)
      .onConflictDoNothing({ target: [videoEvents.videoId, videoEvents.sessionId, videoEvents.eventType, videoEvents.progressPercent] })
      .returning({ eventType: videoEvents.eventType, progressPercent: videoEvents.progressPercent });
  } catch {
    return null;
  }
}

/**
 * Apenas o evento realmente persistido dispara efeitos laterais. O upsert com
 * `.onConflictDoNothing().returning()` devolve só as linhas novas (duplicatas
 * de dedupe não voltam); comparamos as chaves com os eventos da requisição
 * para nunca reenviar um webhook duplicado.
 */
function persistedEventKeys(writtenRows: Array<{ eventType: string; progressPercent: number }>) {
  return new Set(writtenRows.map((row) => `${row.eventType}:${row.progressPercent}`));
}

type IngestSideEffectsInput = {
  firstPartyOrigin: boolean;
  sessionId: string;
  countryCode: string;
  client: IngestClientContext;
  pageUrl: string | null;
  peerIp: string;
  video: { id: string; user_id: string; title: string };
  playerConfig: Record<string, unknown>;
  events: NormalizedAnalyticsEvent[];
  persistedKeys: Set<string>;
};

async function deliverIngestSideEffects(input: IngestSideEffectsInput): Promise<void> {
  for (const event of input.events) {
    if (!input.persistedKeys.has(`${event.eventType}:${event.progressPercent}`)) continue;
    // RM-03 item 2: requisição não-first-party (só pode ser conversões) não
    // dispara efeitos laterais pagos (webhook + CAPI). O atacante que forja
    // Origin batendo com o host do token ainda falha aqui.
    if (!input.firstPartyOrigin) continue;
    const delivery = await loadDeliveryControls(input.video.user_id);
    if (!delivery) continue;
    if (event.eventType === "conversion" && event.advertisingConsent) {
      await deliverPurchaseEvent(input, event);
    }
    // Webhook de saída é recurso de plano superior: a checagem existia apenas na
    // tela, então quem tivesse ativado a chave uma vez continuava recebendo.
    if (!delivery.plan.capabilities.outgoing_webhooks) continue;
    await deliverOutgoingWebhook(input, delivery.controls, event);
  }
}

async function deliverPurchaseEvent(input: IngestSideEffectsInput, event: NormalizedAnalyticsEvent): Promise<void> {
  await deliverServerPurchase({
    integrations: pixelIntegrations(input.playerConfig),
    eventId: event.transactionId ?? "",
    eventName: "Purchase",
    eventSourceUrl: input.pageUrl,
    value: event.value ?? 0,
    currency: event.currency ?? "",
    clientUserAgent: input.client.ua,
    clientIp: input.peerIp || undefined,
  }).catch(() => undefined);
}

async function loadDeliveryControls(userId: string): Promise<{ controls: DeliveryControls | undefined; plan: Awaited<ReturnType<typeof getAccountPlan>> } | null> {
  try {
    const [controlRows, planResult] = await Promise.all([
      db.select({ outgoingWebhooksEnabled: intelligenceControls.outgoingWebhooksEnabled, webhookUrl: intelligenceControls.webhookUrl, webhookEvents: intelligenceControls.webhookEvents }).from(intelligenceControls).where(eq(intelligenceControls.userId, userId)).limit(1),
      getAccountPlan(userId),
    ]);
    return { controls: controlRows[0], plan: planResult };
  } catch {
    return null;
  }
}

async function deliverOutgoingWebhook(input: IngestSideEffectsInput, controls: DeliveryControls | undefined, event: NormalizedAnalyticsEvent): Promise<void> {
  if (!controls?.outgoingWebhooksEnabled || !controls.webhookUrl || !Array.isArray(controls.webhookEvents) || !controls.webhookEvents.includes(event.eventType)) return;
  await deliverWebhook(controls.webhookUrl, { id: randomUUID(), event: `vsl.${event.eventType}`, timestamp: new Date().toISOString(), data: { video_id: input.video.id, video_title: input.video.title, session_id: input.sessionId, progress_percent: event.progressPercent, watched_seconds: event.watchedSeconds, country_code: input.countryCode, device_type: input.client.device } }).catch(() => undefined);
}
