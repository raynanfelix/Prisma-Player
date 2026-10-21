import "server-only";

/**
 * "Testar conexão" - Sprint 1 Pixel Verdadeiro (docs/PIXEL_VERIFY_SPEC.md).
 *
 * Cada integração de anúncio dispara um evento de teste REAL na API oficial
 * da plataforma e devolve a resposta REAL padronizada em
 * `{ ok, platform, message, detail, receivedAt }`:
 *
 * - Meta: GET /{pixel_id} (confirma que o pixel existe e o token acessa) +
 *   POST /events com `test_event_code` quando preenchido;
 * - Google: GA4 Measurement Protocol `debug/mp/collect` (valida o payload);
 *   tags AW- (Google Ads sem G-) recebem resposta honesta de formato;
 * - TikTok: Events API `open_api/v1.3/event/track/` com header Access-Token.
 *
 * Regras do contrato: fetch com timeout de 8s e `cache: "no-store"`; tokens e
 * secrets NUNCA aparecem em mensagens, detalhes ou logs (este módulo não
 * loga - erros viram resposta honesta para a tela).
 */

export type PixelVerifyPlatform = "meta" | "google" | "tiktok";

export type PixelVerifyProvider = "meta_pixel" | "google_ads" | "tiktok";

export interface PixelVerifyResult {
  ok: boolean;
  platform: PixelVerifyPlatform;
  message: string;
  detail: string;
  /** ISO timestamp do momento da resposta da plataforma. */
  receivedAt: string;
}

const FETCH_TIMEOUT_MS = 8_000;
const VERIFY_USER_AGENT = "PrismaPlayer/1.0 (pixel-verify)";
const META_GRAPH_DEFAULT_VERSION = "v23.0";

export function isPixelVerifyProvider(value: unknown): value is PixelVerifyProvider {
  return value === "meta_pixel" || value === "google_ads" || value === "tiktok";
}

/** fetch puro com timeout de 8s e sem cache - o teste sempre fala com a plataforma. */
async function platformFetch(url: string, init: RequestInit): Promise<Response> {
  return fetch(url, { ...init, cache: "no-store", signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
}

/** Lê JSON defensivamente (5xx de gateway pode devolver HTML). */
async function readJson(response: Response): Promise<Record<string, unknown> | null> {
  try {
    const parsed = (await response.json()) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/** Um valor de config como string limpa (trim + teto de tamanho). */
function str(config: Record<string, unknown>, key: string, max: number): string {
  const value = config[key];
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

/** Remove tokens/secrets de qualquer trecho que vá para `detail`/mensagem. */
function redact(text: string, secrets: Array<string | undefined>): string {
  let out = text;
  for (const secret of secrets) {
    if (secret && secret.length >= 8) out = out.split(secret).join("***");
  }
  return out.slice(0, 300);
}

function result(ok: boolean, platform: PixelVerifyPlatform, message: string, detail: string): PixelVerifyResult {
  return { ok, platform, message, detail: detail.slice(0, 300), receivedAt: new Date().toISOString() };
}

function unreachable(platform: PixelVerifyPlatform): PixelVerifyResult {
  return result(false, platform, "A plataforma não respondeu em até 8s - tente novamente.", "timeout ou falha de rede");
}

/**
 * Evento de teste com nome próprio ("PrismaVerifyTest"): sem test_event_code o
 * evento cai como evento customizado claramente marcado, nunca como Purchase
 * de verdade - não polui a otimização da campanha do dono.
 */
function testEventId(): string {
  return `prisma-verify-${Date.now()}`;
}

// ---------------------------------------------------------------------------
// Meta - graph.facebook.com
// ---------------------------------------------------------------------------

function graphApiVersion(): string {
  const version = (process.env.META_GRAPH_API_VERSION || "").toLowerCase();
  return /^v\d{1,2}\.\d$/.test(version) ? version : META_GRAPH_DEFAULT_VERSION;
}

/** Mensagem honesta em PT-BR mantendo o motivo real no `detail`. */
function metaRefusalMessage(status: number, reason: string): string {
  const text = reason.toLowerCase();
  if (text.includes("validating access token") || text.includes("invalid oauth") || text.includes("access token")) {
    return "Access Token inválido ou expirado - gere um novo no Events Manager (API de Conversões).";
  }
  if (status === 404 || text.includes("does not exist") || text.includes("nonexist") || text.includes("unsupported get request") || text.includes("unsupported post request")) {
    return "Pixel não encontrado - confira o ID e se o token pertence à mesma conta de anúncios.";
  }
  return `Meta recusou a chamada (HTTP ${status}).`;
}

export async function verifyMeta(config: Record<string, unknown>): Promise<PixelVerifyResult> {
  const pixelId = str(config, "pixelId", 20);
  const accessToken = str(config, "accessToken", 400);
  const testEventCode = str(config, "testEventCode", 40);
  if (!pixelId || !accessToken) {
    return result(false, "meta", "Preencha o ID do Pixel e o Access Token para testar a conexão.", "campos mínimos ausentes");
  }

  const version = graphApiVersion();
  try {
    // 1) Best-effort: pegar o nome do pixel (tokens de CAPI têm permissão de
    //    ENVIO, não de leitura - GET com "Missing Permission" é NORMAL e não
    //    pode falhar o teste; o veredito é o POST /events abaixo).
    let pixelName = "";
    try {
      const check = await platformFetch(
        `https://graph.facebook.com/${version}/${encodeURIComponent(pixelId)}?fields=id%2Cname&access_token=${encodeURIComponent(accessToken)}`,
        { method: "GET" },
      );
      const checkBody = await readJson(check);
      if (check.ok && typeof checkBody?.["name"] === "string") {
        pixelName = (checkBody["name"] as string).slice(0, 60);
      }
    } catch {
      // GET é opcional - segue pro POST mesmo sem ele.
    }

    // 2) Evento de teste REAL na API de Conversões.
    const response = await platformFetch(`https://graph.facebook.com/${version}/${encodeURIComponent(pixelId)}/events`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        data: [
          {
            event_name: "PrismaVerifyTest",
            event_time: Math.floor(Date.now() / 1000),
            event_id: testEventId(),
            action_source: "website",
            user_data: { client_user_agent: VERIFY_USER_AGENT },
            custom_data: { currency: "BRL", value: 0 },
          },
        ],
        ...(testEventCode ? { test_event_code: testEventCode } : {}),
        access_token: accessToken,
      }),
    });
    const body = await readJson(response);
    if (!response.ok) {
      const error = body?.["error"] as { message?: string } | undefined;
      const reason = error?.message ?? `HTTP ${response.status}`;
      return result(false, "meta", metaRefusalMessage(response.status, reason), redact(`POST /events: ${reason}`, [accessToken]));
    }
    const received = body?.["events_received"];
    if (response.ok && typeof received === "number" && received > 0) {
      const where = pixelName ? ` no pixel “${pixelName}”` : "";
      return result(true, "meta", `Meta recebeu ${received} evento(s) de teste${where}.`, `events_received: ${received}`);
    }
    return result(false, "meta", "Meta não confirmou o recebimento do evento de teste.", redact(`POST /events: ${JSON.stringify(body ?? {})}`, [accessToken]));
  } catch {
    return unreachable("meta");
  }
}

// ---------------------------------------------------------------------------
// Google - GA4 Measurement Protocol (debug/mp/collect)
// ---------------------------------------------------------------------------

export async function verifyGoogle(config: Record<string, unknown>): Promise<PixelVerifyResult> {
  const tagId = str(config, "tagId", 40).toUpperCase();
  const apiSecret = str(config, "apiSecret", 120);
  if (!tagId) {
    return result(false, "google", "Preencha o ID da tag para testar a conexão.", "campo tagId ausente");
  }

  // AW- (Google Ads sem G-): não existe teste em tempo real para tag de
  // conversão - resposta honesta de formato, sem inventar verificação.
  if (/^AW-\d{5,20}$/.test(tagId)) {
    return result(true, "google", "Tag de conversão do Google Ads configurada - o Google Ads mostra o evento em até 3h (tags AW- não têm teste em tempo real).", `formato ${tagId} validado`);
  }
  if (!/^G-[A-Z0-9]{5,20}$/.test(tagId)) {
    return result(false, "google", "ID da tag inválido - use G-XXXXXXX (GA4) ou AW-XXXXXXX (Google Ads).", `formato rejeitado: ${tagId}`);
  }
  if (!apiSecret) {
    return result(false, "google", "Preencha o API Secret para testar a tag G- - você gera em GA4 → Admin → Data Streams → Measurement Protocol API secret.", "apiSecret ausente para tag G-");
  }

  try {
    const response = await platformFetch(
      `https://www.google-analytics.com/debug/mp/collect?measurement_id=${encodeURIComponent(tagId)}&api_secret=${encodeURIComponent(apiSecret)}`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          client_id: "prisma-player-verify",
          events: [{ name: "purchase", params: { currency: "BRL", value: 0, prisma_verify: "test" } }],
        }),
      },
    );
    const body = await readJson(response);
    if (!response.ok) {
      return result(false, "google", `Google recusou o teste (HTTP ${response.status}).`, `HTTP ${response.status}`);
    }
    const validation = body?.["validationResponse"] as { validationMessages?: Array<{ description?: string; message?: string; validationCode?: string }> } | undefined;
    if (!validation || !Array.isArray(validation.validationMessages)) {
      // O endpoint debug devolve `validationResponse` só para par
      // measurement_id + api_secret válido - resposta vazia = credenciais erradas.
      return result(false, "google", "GA4 não validou o payload - confira o ID G- e o API Secret (o Google devolveu validação vazia).", "validationResponse ausente");
    }
    const messages = validation.validationMessages;
    if (messages.length === 0) {
      return result(true, "google", "Google confirmou: payload de teste validado pelo GA4 (Measurement Protocol).", "validationMessages: 0");
    }
    const first = messages[0]?.description ?? messages[0]?.message ?? messages[0]?.validationCode ?? "motivo não informado";
    return result(false, "google", `GA4 rejeitou o payload: ${first}`, redact(messages.map((item) => item.description ?? item.message ?? item.validationCode ?? "").filter(Boolean).join(" | "), [apiSecret]));
  } catch {
    return unreachable("google");
  }
}

// ---------------------------------------------------------------------------
// TikTok - Events API (open_api/v1.3/event/track/)
// ---------------------------------------------------------------------------

export async function verifyTikTok(config: Record<string, unknown>): Promise<PixelVerifyResult> {
  const pixelId = str(config, "pixelId", 40).toUpperCase();
  const accessToken = str(config, "accessToken", 400);
  const testEventCode = str(config, "testEventCode", 40);
  if (!pixelId || !accessToken) {
    return result(false, "tiktok", "Preencha o ID do pixel e o Access Token (TikTok Events Manager → Manage API access) para testar a conexão.", "campos mínimos ausentes");
  }

  const endpoint = process.env.TIKTOK_EVENTS_API_URL || "https://business-api.tiktok.com/open_api/v1.3/event/track/";
  try {
    const response = await platformFetch(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json", "Access-Token": accessToken },
      body: JSON.stringify({
        event_source: "web",
        event_source_id: pixelId,
        data: [
          {
            event: "PrismaVerifyTest",
            event_time: Math.floor(Date.now() / 1000),
            event_id: testEventId(),
            user: { user_agent: VERIFY_USER_AGENT },
            properties: { currency: "BRL", value: 0, content_type: "product", content_id: pixelId },
            page: { url: "https://prisma.player/verify" },
            ...(testEventCode ? { test_event_code: testEventCode } : {}),
          },
        ],
      }),
    });
    const body = await readJson(response);
    const code = typeof body?.["code"] === "number" ? (body["code"] as number) : null;
    const message = typeof body?.["message"] === "string" ? (body["message"] as string) : "";
    if (code === 0) {
      return result(true, "tiktok", "TikTok confirmou: evento de teste recebido.", "code: 0 · success");
    }
    const reason = message || (code !== null ? `código ${code}` : `HTTP ${response.status}`);
    const tokenHint = /auth|token|permission|certif/i.test(message) ? "Access Token sem permissão para este pixel - " : "";
    return result(false, "tiktok", `${tokenHint}TikTok recusou: ${reason}`, redact(`code ${code ?? "?"}: ${reason}`, [accessToken]));
  } catch {
    return unreachable("tiktok");
  }
}

// ---------------------------------------------------------------------------
// Dispatcher usado pela rota /api/integrations/verify
// ---------------------------------------------------------------------------

export async function verifyPixelIntegration(provider: PixelVerifyProvider, config: Record<string, unknown>): Promise<PixelVerifyResult> {
  if (provider === "meta_pixel") return verifyMeta(config);
  if (provider === "google_ads") return verifyGoogle(config);
  return verifyTikTok(config);
}
