import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { rateLimit } from "@/lib/security/rate-limit";
import { db, schema } from "@/lib/db";
import { validateOrigin } from "@/lib/security/csrf";
import { originHeaderDisagrees, verifyEmbedEventTokenContext, verifyEmbedRenderCookie } from "@/lib/security/embed-origin";
import { readJsonBody } from "@/lib/api/request";
import { ANALYTICS } from "@/lib/constants";

const { abTests, abTestVariants, playerConfigs, playerEvents, videos } = schema;

const allowedEvents = new Set(["impression", "play", "progress", "complete"]);
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function POST(request: Request) {
  // The A/B player posts from the same-origin embed iframe, so this matches the
  // guard already applied to /api/analytics-events.
  if (!validateOrigin(request)) return NextResponse.json({ error: "invalid_origin" }, { status: 403 });
  const parsed = await readJsonBody<Record<string, unknown>>(request, ANALYTICS.MAX_EVENT_PAYLOAD_BYTES);
  if (!parsed.ok) return parsed.response;
  const body = parsed.body;
  const testId = typeof body?.testId === "string" ? body.testId : "";
  const variantId = typeof body?.variantId === "string" ? body.variantId : "";
  const sessionId = typeof body?.sessionId === "string" ? body.sessionId : "";
  const eventType = typeof body?.eventType === "string" ? body.eventType : "";
  const progressPercent = Number(body?.progressPercent ?? 0);
  const watchedSeconds = Math.max(0, Math.min(Number(body?.watchedSeconds ?? 0), 86400));
  if (![testId, variantId, sessionId].every((id) => uuid.test(id)) || !allowedEvents.has(eventType) || ![0, 25, 50, 75, 100].includes(progressPercent)) return NextResponse.json({ error: "invalid_event" }, { status: 400 });
  // M5 (auditoria): teto AGREGADO por IP ANTES de qualquer IO. O limite por
  // sessão abaixo continua existindo, mas a sessão é auto-declarada no corpo:
  // sem este teto, um eventToken legítimo + cookie de render permitiam
  // ingestão ilimitada rotacionando UUIDs de sessão (custo de writes no
  // Neon sem teto). O IP é lido só dos cabeçalhos que a plataforma injeta
  // (clientIp do rate-limit), nunca do cliente.
  const ipLimited = await rateLimit(request, "ab-events-ip", {
    max: ANALYTICS.INGEST_IP_RATE_LIMIT_MAX_REQUESTS,
    windowMs: ANALYTICS.INGEST_IP_RATE_LIMIT_WINDOW_MS,
  });
  if (ipLimited) return ipLimited;

  let variant: { userId: string; videoId: string } | undefined;
  try {
    [variant] = await db.select({ userId: abTestVariants.userId, videoId: abTestVariants.videoId }).from(abTestVariants).where(and(eq(abTestVariants.id, variantId), eq(abTestVariants.testId, testId))).limit(1);
  } catch {
    variant = undefined;
  }
  if (!variant) return NextResponse.json({ error: "variant_not_found" }, { status: 404 });
  // Same proof-of-embed requirement as /api/analytics-events, bound to the
  // video actually served for this variant. A sessão A/B (persistida entre
  // visitas) é intencionalmente distinta da sessão de analytics do viewer
  // (que o token carrega), por isso a sessão do CORPO não pode ser comparada
  // com a do token aqui - a comparação rejeitaria o sorteio consistente de
  // variante. O que amarramos ao token é o TETO de ingestão: o bucket abaixo
  // usa a sessão HMAC-atestada do token quando ela existe, então rotacionar
  // UUIDs de sessão no corpo não cria bucket novo (M5).
  const eventToken = typeof body?.eventToken === "string" ? body.eventToken : null;
  const verifiedEvent = verifyEmbedEventTokenContext(eventToken, { videoId: variant.videoId });
  if (!verifiedEvent) return NextResponse.json({ error: "invalid_event_token" }, { status: 403 });
  // Prova de render (mesmo cookie `pp_embed` do embed).
  if (!verifiedEvent.nonce || !verifyEmbedRenderCookie(request.headers, verifiedEvent.nonce)) return NextResponse.json({ error: "invalid_event_token" }, { status: 403 });
  // Origin presente e não-self precisa concordar com o host do token.
  if (verifiedEvent.host && originHeaderDisagrees(request.headers, verifiedEvent.host, new URL(request.url).origin)) return NextResponse.json({ error: "invalid_origin" }, { status: 403 });
  // Anti-CGNAT: o bucket é por identidade de RENDER, não por IP. Quando o
  // token carrega a sessão do viewer, ela é a identidade inescritível (o
  // corpo não consegue forjar outra); tokens legados sem o claim caem no
  // sessionId do corpo, validado como UUID no topo da rota.
  const identity = verifiedEvent.sessionId ? `t:${verifiedEvent.sessionId}` : `s:${sessionId}`;
  const limited = await rateLimit(request, `ab:${testId}:${variantId}`, { max: ANALYTICS.RATE_LIMIT_MAX_REQUESTS, windowMs: ANALYTICS.RATE_LIMIT_WINDOW_MS, identifier: identity });
  if (limited) return limited;

  let testStatus: string | undefined, videoStatus: string | undefined, playerId: string | undefined;
  try {
    const [testRows, videoRows, playerRows] = await Promise.all([
      db.select({ status: abTests.status }).from(abTests).where(and(eq(abTests.id, testId), eq(abTests.userId, variant.userId))).limit(1),
      db.select({ status: videos.status }).from(videos).where(and(eq(videos.id, variant.videoId), eq(videos.userId, variant.userId))).limit(1),
      db.select({ id: playerConfigs.id }).from(playerConfigs).where(and(eq(playerConfigs.videoId, variant.videoId), eq(playerConfigs.userId, variant.userId), eq(playerConfigs.published, true))).limit(1),
    ]);
    testStatus = testRows[0]?.status;
    videoStatus = videoRows[0]?.status;
    playerId = playerRows[0]?.id;
  } catch {
    testStatus = videoStatus = playerId = undefined;
  }
  if (testStatus !== "active" || videoStatus !== "ready" || !playerId) return NextResponse.json({ error: "test_not_active" }, { status: 409 });

  // Chave de dedupe (test_id,variant_id,session_id,event_type,
  // progress_percent => player_events_dedupe_key); DO NOTHING ignora repetidos.
  try {
    await db
      .insert(playerEvents)
      .values({
        userId: variant.userId,
        videoId: variant.videoId,
        testId,
        variantId,
        sessionId,
        eventType,
        progressPercent,
        watchedSeconds: String(watchedSeconds),
      })
      .onConflictDoNothing({ target: [playerEvents.testId, playerEvents.variantId, playerEvents.sessionId, playerEvents.eventType, playerEvents.progressPercent] });
  } catch {
    return NextResponse.json({ error: "event_failed" }, { status: 500 });
  }
  return NextResponse.json({ ok: true }, { status: 202 });
}
