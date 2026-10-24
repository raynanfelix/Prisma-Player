import "server-only";
import type { PixelIntegration, PixelProvider } from "@/lib/player/pixels";

interface ServerEventInput {
  integrations: PixelIntegration[];
  eventId: string;
  eventName: "Purchase";
  eventSourceUrl?: string | null;
  value: number;
  currency: string;
  clientUserAgent: string;
  clientIp?: string | null;
}

export interface ServerDeliveryResult {
  provider: PixelProvider;
  delivered: boolean;
  status?: number;
  reason?: "not_configured" | "request_failed";
}

type Fetcher = typeof fetch;

function tokenMap(name: "META_CAPI_TOKENS_JSON" | "TIKTOK_EVENTS_TOKENS_JSON") {
  try {
    const parsed = JSON.parse(process.env[name] || "{}") as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {} as Record<string, string>;
    return Object.fromEntries(Object.entries(parsed).filter((entry): entry is [string, string] => typeof entry[1] === "string" && entry[1].length >= 16));
  } catch {
    return {} as Record<string, string>;
  }
}

export function serverConnectionAvailable(provider: PixelProvider, pixelId: string, capiToken?: string) {
  if (provider === "google") return false;
  // Token por player (config do studio) tem prioridade sobre o env global.
  if (provider === "meta" && capiToken && capiToken.trim().length >= 16) return true;
  const tokens = tokenMap(provider === "meta" ? "META_CAPI_TOKENS_JSON" : "TIKTOK_EVENTS_TOKENS_JSON");
  return Boolean(tokens[pixelId]);
}

function safeIp(value?: string | null) {
  const first = value?.split(",")[0]?.trim() ?? "";
  return /^[0-9a-f:.]{3,64}$/i.test(first) ? first : undefined;
}

/** Token efetivo do pixel Meta: token por player (config do studio) tem prioridade sobre o env global. */
function metaTokenFor(integration: PixelIntegration): string {
  return (integration.capiToken && integration.capiToken.trim().length >= 16 ? integration.capiToken.trim() : "") || tokenMap("META_CAPI_TOKENS_JSON")[integration.id];
}

async function sendMeta(integration: PixelIntegration, input: ServerEventInput, fetcher: Fetcher): Promise<ServerDeliveryResult> {
  const token = metaTokenFor(integration);
  if (!token) return { provider: "meta", delivered: false, reason: "not_configured" };
  const version = /^v\d{1,2}\.\d$/i.test(process.env.META_GRAPH_API_VERSION || "") ? process.env.META_GRAPH_API_VERSION : "v23.0";
  const userData: Record<string, string> = { client_user_agent: input.clientUserAgent };
  const ip = safeIp(input.clientIp);
  if (ip) userData.client_ip_address = ip;
  try {
    const response = await fetcher(`https://graph.facebook.com/${version}/${encodeURIComponent(integration.id)}/events`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ access_token: token, data: [{ event_name: input.eventName, event_time: Math.floor(Date.now() / 1000), event_id: input.eventId, action_source: "website", event_source_url: input.eventSourceUrl || undefined, user_data: userData, custom_data: { value: input.value, currency: input.currency, content_type: "product", content_ids: [integration.id] } }] }),
      signal: AbortSignal.timeout(5_000),
    });
    return { provider: "meta", delivered: response.ok, status: response.status, ...(!response.ok ? { reason: "request_failed" as const } : {}) };
  } catch {
    return { provider: "meta", delivered: false, reason: "request_failed" };
  }
}

export interface ServerMetaEventInput {
  integration: PixelIntegration;
  eventName: string;
  eventId?: string;
  eventSourceUrl?: string | null;
  clientUserAgent: string;
  clientIp?: string | null;
}

/**
 * CAPI Meta de evento genérico (ViewContent, PrismaVideoPlay, Lead...) para o
 * endpoint /api/embed/:id/capi. Mesmo endpoint/timeout do Purchase, sem
 * custom_data de valor (eventos de topo de funil não carregam moeda). O token
 * vive no integration que o CHAMADOR montou a partir do config do banco -
 * este módulo nunca recebe segredo do request.
 */
export async function deliverServerMetaEvent(input: ServerMetaEventInput, fetcher: Fetcher = fetch): Promise<ServerDeliveryResult> {
  const token = metaTokenFor(input.integration);
  if (!token) return { provider: "meta", delivered: false, reason: "not_configured" };
  const version = /^v\d{1,2}\.\d$/i.test(process.env.META_GRAPH_API_VERSION || "") ? process.env.META_GRAPH_API_VERSION : "v23.0";
  const userData: Record<string, string> = { client_user_agent: input.clientUserAgent };
  const ip = safeIp(input.clientIp);
  if (ip) userData.client_ip_address = ip;
  try {
    const response = await fetcher(`https://graph.facebook.com/${version}/${encodeURIComponent(input.integration.id)}/events`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ access_token: token, data: [{ event_name: input.eventName, event_time: Math.floor(Date.now() / 1000), event_id: input.eventId || undefined, action_source: "website", event_source_url: input.eventSourceUrl || undefined, user_data: userData }] }),
      signal: AbortSignal.timeout(5_000),
    });
    return { provider: "meta", delivered: response.ok, status: response.status, ...(!response.ok ? { reason: "request_failed" as const } : {}) };
  } catch {
    return { provider: "meta", delivered: false, reason: "request_failed" };
  }
}

async function sendTikTok(integration: PixelIntegration, input: ServerEventInput, fetcher: Fetcher): Promise<ServerDeliveryResult> {
  const token = tokenMap("TIKTOK_EVENTS_TOKENS_JSON")[integration.id];
  if (!token) return { provider: "tiktok", delivered: false, reason: "not_configured" };
  const endpoint = process.env.TIKTOK_EVENTS_API_URL || "https://business-api.tiktok.com/open_api/v1.3/event/track/";
  const user: Record<string, string> = { user_agent: input.clientUserAgent };
  const ip = safeIp(input.clientIp);
  if (ip) user.ip = ip;
  try {
    const response = await fetcher(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json", "Access-Token": token },
      body: JSON.stringify({ event_source: "web", event_source_id: integration.id, data: [{ event: input.eventName, event_time: Math.floor(Date.now() / 1000), event_id: input.eventId, user, properties: { value: input.value, currency: input.currency, content_type: "product", content_id: integration.id }, page: { url: input.eventSourceUrl || undefined } }] }),
      signal: AbortSignal.timeout(5_000),
    });
    return { provider: "tiktok", delivered: response.ok, status: response.status, ...(!response.ok ? { reason: "request_failed" as const } : {}) };
  } catch {
    return { provider: "tiktok", delivered: false, reason: "request_failed" };
  }
}

export async function deliverServerPurchase(input: ServerEventInput, fetcher: Fetcher = fetch) {
  return Promise.all(input.integrations.filter((item) => item.provider !== "google").map((integration) => integration.provider === "meta" ? sendMeta(integration, input, fetcher) : sendTikTok(integration, input, fetcher)));
}
