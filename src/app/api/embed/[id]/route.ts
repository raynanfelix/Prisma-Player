import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createBoundEmbedEventTokenSafely, domainAllowed, originHeaderDisagrees, verifyEmbedOriginToken, verifyEmbedRenderCookie } from "@/lib/security/embed-origin";
import { rateLimit } from "@/lib/security/rate-limit";
import { signR2ReadUrl } from "@/lib/storage/r2";
import { getAccountAccess } from "@/lib/access/service";
import { ownedAssetPaths } from "@/lib/player/assets";
import { envInt } from "@/lib/config/env";
import { VIDEO } from "@/lib/constants";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EMBED_CONFIG_RATE_LIMIT_MAX = envInt("EMBED_CONFIG_RATE_LIMIT_MAX", 300);
const EMBED_CONFIG_RATE_LIMIT_WINDOW_MS = envInt("EMBED_CONFIG_RATE_LIMIT_WINDOW_MS", 60_000);

function requestDevice(userAgent: string) {
  if (/ipad|tablet/i.test(userAgent)) return "tablet";
  if (/android|iphone|mobile/i.test(userAgent)) return "mobile";
  return "desktop";
}

function csvValues(value: unknown) {
  if (typeof value !== "string") return [];
  return value.split(",").map((item) => item.trim().toLowerCase()).filter(Boolean);
}

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  if (!uuid.test(id)) return NextResponse.json({ error: "player_not_found" }, { status: 404 });

  const limited = await rateLimit(request, `embed-config:${id}`, { max: EMBED_CONFIG_RATE_LIMIT_MAX, windowMs: EMBED_CONFIG_RATE_LIMIT_WINDOW_MS });
  if (limited) return limited;

  const supabase = createAdminClient();
  const fields = "id,video_id,user_id,config,allowed_domains,published";
  const byPlayerId = await supabase.from("player_configs").select(fields).eq("id", id).eq("published", true).maybeSingle();
  if (byPlayerId.error) {
    console.error("embed player lookup failed", { code: byPlayerId.error.code, message: byPlayerId.error.message });
    return NextResponse.json({ error: "player_lookup_failed" }, { status: 503 });
  }
  let playerConfig = byPlayerId.data;
  if (!playerConfig) {
    const byVideoId = await supabase.from("player_configs").select(fields).eq("video_id", id).eq("published", true).maybeSingle();
    if (byVideoId.error) {
      console.error("embed video config lookup failed", { code: byVideoId.error.code, message: byVideoId.error.message });
      return NextResponse.json({ error: "player_lookup_failed" }, { status: 503 });
    }
    playerConfig = byVideoId.data;
  }

  if (!playerConfig) return NextResponse.json({ error: "player_not_found" }, { status: 404 });

  // O embed é a entrega do produto. Sem esta verificação, cancelar a assinatura
  // não tirava nada do ar: a VSL continuava hospedada e servida indefinidamente.
  const ownerAccess = await getAccountAccess(playerConfig.user_id);
  if (!ownerAccess.hasAccess) {
    return NextResponse.json({ error: "player_unavailable" }, { status: 402, headers: { "cache-control": "private, no-store" } });
  }

  // RM-02: o header `Referer`/`Origin` nunca é autoridade aqui. Sem um token de
  // origem válido e não expirado, a requisição é rejeitada — quem não renderizou
  // a página não consegue forjar `Referer` e exfiltrar a URL assinada.
  const requestUrl = new URL(request.url);
  const originToken = requestUrl.searchParams.get("originToken");
  // RM-04: no embed A/B o token chega mintado no escopo do TESTE (playerId =
  // testId + claim `abTest`). O braço de verificação do teste usa o id de teste
  // validado como UUID no query; um token de teste não vale para consumo direto.
  const abTestIdParam = requestUrl.searchParams.get("abTestId");
  const abTestId = abTestIdParam && uuid.test(abTestIdParam) ? abTestIdParam : "";
  const verifiedOrigin = verifyEmbedOriginToken(originToken, playerConfig.id)
    || verifyEmbedOriginToken(originToken, id)
    || (abTestId ? verifyEmbedOriginToken(originToken, abTestId, { abTestPath: abTestId }) : null);
  if (!verifiedOrigin) return NextResponse.json({ error: "invalid_origin_token" }, { status: 403 });
  const host = verifiedOrigin.host;
  // O host do token é o ÚNICO host usado para domainAllowed.
  if (!host || originHeaderDisagrees(request.headers, host, requestUrl.origin)) return NextResponse.json({ error: "origin_mismatch" }, { status: 403 });
  // Prova de render: o nonce assinado no token precisa existir e estar no cookie
  // `pp_embed` que o proxy setou na resposta da página. Token sem nonce (não
  // amarrado a nenhum render) ou com nonce sem o cookie é rejeitado.
  if (!verifiedOrigin.nonce || !verifyEmbedRenderCookie(request.headers, verifiedOrigin.nonce)) return NextResponse.json({ error: "render_not_confirmed" }, { status: 403 });
  const domains = Array.isArray(playerConfig.allowed_domains) ? playerConfig.allowed_domains.map((domain) => domain.trim()).filter(Boolean) : [];
  if (domains.length > 0 && !domainAllowed(host, domains)) return NextResponse.json({ error: "domain_not_allowed" }, { status: 403 });

  const config = playerConfig.config && typeof playerConfig.config === "object" ? { ...playerConfig.config } as Record<string, unknown> : {};
  if (Boolean(config.trafficEnabled)) {
    const countryPolicy = String(config.allowedCountries || "Todos").trim().toLowerCase();
    if (countryPolicy === "nenhum") return NextResponse.json({ error: "country_not_allowed" }, { status: 403 });
    const allowedCountries = csvValues(config.allowedCountries).filter((item) => item !== "todos");
    const country = (request.headers.get("x-vercel-ip-country") || request.headers.get("cf-ipcountry") || "").toLowerCase();
    if (allowedCountries.length > 0 && (!country || !allowedCountries.includes(country))) return NextResponse.json({ error: "country_not_allowed" }, { status: 403 });

    const allowedDevices = Array.isArray(config.allowedDevices) ? config.allowedDevices.filter((item): item is string => typeof item === "string") : [];
    if (allowedDevices.length > 0 && !allowedDevices.includes(requestDevice(request.headers.get("user-agent") || ""))) return NextResponse.json({ error: "device_not_allowed" }, { status: 403 });

    const requestedLanguage = String(config.browserLanguage || "Todos").toLowerCase();
    const acceptedLanguage = (request.headers.get("accept-language") || "").toLowerCase();
    const languagePrefix = requestedLanguage === "português" ? "pt" : requestedLanguage === "inglês" ? "en" : requestedLanguage === "espanhol" ? "es" : "";
    if (languagePrefix && !acceptedLanguage.includes(languagePrefix)) return NextResponse.json({ error: "language_not_allowed" }, { status: 403 });
  }

  const { data: video } = await supabase.from("videos").select("id,title,object_path,mime_type,user_id,storage_provider").eq("id", playerConfig.video_id).eq("status", "ready").maybeSingle();
  if (!video) return NextResponse.json({ error: "video_not_found" }, { status: 404 });
  const source = video.storage_provider === "r2"
    ? await signR2ReadUrl(video.object_path, VIDEO.R2_SIGNED_URL_EXPIRY_SECONDS).catch(() => null)
    : (await supabase.storage.from("videos").createSignedUrl(video.object_path, VIDEO.SUPABASE_SIGNED_URL_EXPIRY_SECONDS)).data?.signedUrl ?? null;
  if (!source) return NextResponse.json({ error: "source_unavailable" }, { status: 503 });

  if (Number(config.radius) === 12) config.radius = 0;
  // Só assina assets do próprio dono do player: `config` é jsonb livre gravado
  // pelo usuário e antes qualquer caminho colocado ali era assinado.
  const assets = ownedAssetPaths(config.assets, video.user_id);
  const assetUrls: Record<string, string> = {};
  await Promise.all(Object.entries(assets).map(async ([kind, path]) => {
    const { data } = await supabase.storage.from("player-assets").createSignedUrl(path, VIDEO.SUPABASE_SIGNED_URL_EXPIRY_SECONDS);
    if (data?.signedUrl) assetUrls[kind] = data.signedUrl;
  }));
  config.assets = assets;
  config.assetUrls = assetUrls;

  // RM-03: o eventToken é amarrado ao host do embed e à sessão do viewer (que
  // o player envia no query do próprio request de config). O endpoint de
  // analytics rejeita evento cuja sessionId do corpo não bata com o token.
  const sessionIdParam = requestUrl.searchParams.get("sessionId");
  const eventSessionId = sessionIdParam && uuid.test(sessionIdParam) ? sessionIdParam : undefined;
  const eventToken = createBoundEmbedEventTokenSafely({ videoId: video.id, host, sessionId: eventSessionId, nonce: verifiedOrigin.nonce });

  return NextResponse.json({ id: playerConfig.id, videoId: playerConfig.video_id, title: video.title, source, type: video.mime_type, config, eventToken }, { headers: { "cache-control": "private, no-store, max-age=0", "x-robots-tag": "noindex, nofollow, noarchive", "cloudflare-cdn-cache": "no-store" } });
}
