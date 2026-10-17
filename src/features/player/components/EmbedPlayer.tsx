"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import VideoPlayer from "./VideoPlayer";
import HeadlineBlock from "./HeadlineBlock";
import AutoplayOverlay from "./AutoplayOverlay";
import { resolveAutoplayCover } from "@/lib/player/autoplay-cover";
import { hookLiveViewersCount } from "@/lib/player/mini-hooks";
import { pixelIntegrations } from "@/lib/player/pixels";
import { createAnalyticsBatcher } from "@/lib/player/analytics-batcher";
import { getOrCreateViewerId } from "@/lib/player/viewer-id";

interface Payload { videoId: string; title: string; source: string; type: string; config: Record<string, unknown>; eventToken?: string; viewerIp?: string }

interface Tracking { testId: string; variantId: string; sessionId: string }

const EMBED_ERROR_MESSAGES: Record<string, string> = {
  domain_not_allowed: "Este vídeo não pode ser reproduzido neste domínio.",
  country_not_allowed: "Este vídeo não está disponível no seu país.",
  device_not_allowed: "Este vídeo não está disponível neste dispositivo.",
  language_not_allowed: "Este vídeo não está disponível para o idioma do seu navegador.",
  player_not_found: "Este vídeo não foi encontrado ou ainda não foi publicado.",
  video_not_found: "Este vídeo não está disponível no momento.",
  player_lookup_failed: "Não foi possível consultar este vídeo agora. Tente novamente em instantes.",
  source_unavailable: "Não foi possível carregar o vídeo agora. Tente novamente em instantes.",
  vpn_not_allowed: "Este vídeo não está disponível em conexões VPN ou proxy.",
  stream_limit: "Limite de telas simultâneas atingido neste navegador.",
  session_required: "Este vídeo exige uma sessão válida do player. Recarregue a página.",
};

const ANALYTICS_BATCH_FLUSH_MS = 5_000;
const ANALYTICS_BATCH_MAX_EVENTS = 10;

function embedErrorMessage(code: string, status: number): string {
  if (EMBED_ERROR_MESSAGES[code]) return EMBED_ERROR_MESSAGES[code];
  if (status === 403) return "Este vídeo não está disponível para este acesso.";
  if (status >= 500) return "O player está temporariamente indisponível. Tente novamente em instantes.";
  return "Este vídeo não foi encontrado ou ainda não foi publicado.";
}

export default function EmbedPlayer({ playerId, tracking, originToken }: { playerId: string; tracking?: Tracking; originToken?: string }) {
  const [payload, setPayload] = useState<Payload | null>(null);
  // Boot em duas fases (Plano A de escala): config pública + poster do
  // manifest — cacheáveis na borda — pintam o shell de apresentação antes
  // de a config dinâmica chegar. O playerId viaja junto para nunca pintar o
  // shell de um player por outro.
  const [manifestShell, setManifestShell] = useState<{ playerId: string; config: Record<string, unknown>; posterUrl: string } | null>(null);
  const [error, setError] = useState("");
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [videoRatio, setVideoRatio] = useState<number | null>(null);
  const [resumePoint, setResumePoint] = useState<number | null>(null);
  const [resumeChecked, setResumeChecked] = useState(false);
  const [autoplayActivated, setAutoplayActivated] = useState(false);
  const [startTime, setStartTime] = useState(0);
  const [restartWithSoundSignal, setRestartWithSoundSignal] = useState(0);
  const [resumePlaybackSignal, setResumePlaybackSignal] = useState(0);
  const [thumbnailOverlay, setThumbnailOverlay] = useState<"pause" | "end" | null>(null);
  const [ctaUnlocked, setCtaUnlocked] = useState(false);
  // Selo orgânico anti-download: aparece onde o visitante clica com o botão
  // direito sobre o vídeo, em TODAS as VSLs (não é opcional). Leva para a Prisma.
  const [promoSpot, setPromoSpot] = useState<{ x: number; y: number } | null>(null);
  const videoBoxRef = useRef<HTMLDivElement>(null);
  const promoTimerRef = useRef(0);
  // Marca d'água fora da tentativa de download polui a exibição: ela arma no
  // botão direito e some sozinha em 15s.
  const [watermarkArmed, setWatermarkArmed] = useState(false);
  const watermarkTimerRef = useRef(0);
  // Identidade do espectador em STATE (não ref) para o render da marca d'água:
  // ler ref durante o render é impuro (react-hooks/refs) e perde a atualização.
  const [viewerIdentity, setViewerIdentity] = useState<{ viewerId: string; session: string } | null>(null);
  const sentEvents = useRef(new Set<string>());
  const analyticsEvents = useRef(new Set<string>());
  const ctaAutoScrolled = useRef(false);
  const sessionId = useRef("");
  const viewerIdRef = useRef("");
  const liveProgress = useRef({ percent: 0, watchedSeconds: 0 });
  const isPlaying = useRef(false);
  const payloadRef = useRef(payload);
  // O `timeupdate` dispara ~4x/s; re-render do componente inteiro a cada tick
  // e escrita de localStorage a cada tick eram o gargalo do embed. Estado só
  // muda quando o segundo inteiro muda (a barra tem transition de 300ms) e a
  // escrita de retomada só acontece quando o segundo gravado muda.
  const renderedSecondRef = useRef(-1);
  const lastResumeWriteRef = useRef(-1);
  const ctaUnlockWrittenRef = useRef("");
  const analyticsBatcherRef = useRef<ReturnType<typeof createAnalyticsBatcher> | null>(null);
  const trackingTestId = tracking?.testId;
  const trackingVariantId = tracking?.variantId;
  const trackingSessionId = tracking?.sessionId;

  const publishPixelEvent = (eventType: "impression" | "play" | "progress" | "complete" | "cta_click" | "conversion", progressPercent = 0, commerce?: { value: number; currency: string; transactionId: string; advertisingConsent?: boolean }) => {
    if (!payload?.videoId) return;
    const integrations = pixelIntegrations(payload.config);
    if (integrations.length === 0) return;
    const targetOrigin = (() => { try { return new URL(document.referrer).origin; } catch { return ""; } })();
    if (!targetOrigin || window.parent === window) return;
    window.parent.postMessage({
      type: "prisma-player:pixel-event",
      playerId,
      videoId: payload.videoId,
      eventType,
      progressPercent,
      pixelName: String(payload.config.pixelName ?? ""),
      integrations,
      value: commerce?.value,
      currency: commerce?.currency,
      transactionId: commerce?.transactionId,
      consent: {
        mode: payload.config.pixelConsentMode === "external" ? "external" : "banner",
        title: String(payload.config.pixelConsentTitle ?? ""),
        description: String(payload.config.pixelConsentDescription ?? ""),
        acceptLabel: String(payload.config.pixelConsentAcceptLabel ?? ""),
        rejectLabel: String(payload.config.pixelConsentRejectLabel ?? ""),
        privacyUrl: String(payload.config.pixelPrivacyUrl ?? ""),
      },
      analyticsContext: { videoId: payload.videoId, sessionId: sessionId.current, viewerId: viewerIdRef.current || null, eventToken: payload.eventToken },
    }, targetOrigin);
  };

  const track = (eventType: "impression" | "play" | "progress" | "complete", progressPercent = 0, watchedSeconds = 0) => {
    if (!tracking || !payload?.eventToken) return;
    const key = `${eventType}:${progressPercent}`;
    if (sentEvents.current.has(key)) return;
    sentEvents.current.add(key);
    void fetch("/api/ab-events", { method: "POST", keepalive: true, headers: { "content-type": "application/json" }, body: JSON.stringify({ ...tracking, eventType, progressPercent, watchedSeconds, eventToken: payload.eventToken }) });
  };

  const trackAnalytics = (eventType: "impression" | "play" | "progress" | "complete" | "cta_click" | "conversion", progressPercent = 0, watchedSeconds = 0, commerce?: { value: number; currency: string; transactionId: string; advertisingConsent?: boolean }) => {
    if (!payload?.videoId || !sessionId.current) return;
    const key = `${eventType}:${progressPercent}`;
    if (analyticsEvents.current.has(key)) return;
    analyticsEvents.current.add(key);
    publishPixelEvent(eventType, progressPercent, commerce);
    const batcher = analyticsBatcherRef.current;
    if (!batcher) return;
    batcher.enqueue({
      eventType,
      progressPercent,
      watchedSeconds,
      transactionId: commerce?.transactionId,
      value: commerce?.value,
      currency: commerce?.currency,
      advertisingConsent: commerce?.advertisingConsent === true,
    });
    // Conversao e o unico evento que importa nao perder: envie o lote na hora.
    if (eventType === "conversion") void batcher.flushNow();
  };

  useEffect(() => {
    analyticsBatcherRef.current = createAnalyticsBatcher({
      maxEvents: ANALYTICS_BATCH_MAX_EVENTS,
      flushIntervalMs: ANALYTICS_BATCH_FLUSH_MS,
      flush: async (events) => {
        const currentPayload = payloadRef.current;
        if (!currentPayload?.videoId || !sessionId.current || events.length === 0) return true;
        try {
          const response = await fetch("/api/analytics-events", {
            method: "POST",
            keepalive: true,
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              videoId: currentPayload.videoId,
              sessionId: sessionId.current,
              viewerId: viewerIdRef.current || null,
              eventToken: currentPayload.eventToken,
              pageUrl: document.referrer || window.location.href,
              referrer: document.referrer,
              events,
            }),
          });
          return response.ok || response.status >= 400;
        } catch {
          return false;
        }
      },
    });
    const batcher = analyticsBatcherRef.current;
    const sendPending = () => void batcher?.flushNow();
    window.addEventListener("pagehide", sendPending);
    window.addEventListener("blur", sendPending);
    return () => {
      window.removeEventListener("pagehide", sendPending);
      window.removeEventListener("blur", sendPending);
      batcher?.destroy();
    };
    // Dispoe o batcher uma unica vez, junto do ciclo de vida do embed.
  }, []);

  useEffect(() => {
    // Analytics mede uma visita ao embed. Reusar um ID salvo no localStorage fazia
    // todas as visitas futuras do mesmo navegador parecerem uma unica sessao.
    // A sessao e criada UMA vez por render (antes do fetch de config) e mandada
    // junto no query para o eventToken ser emitido amarrado a ela (RM-03).
    if (!sessionId.current) sessionId.current = crypto.randomUUID();
    // O viewerId e persistente e separado da sessao: identifica o navegador entre
    // visitas (attribution) sem colapsar sessoes distintas.
    viewerIdRef.current = getOrCreateViewerId();
    // Espelho em estado para o render da marca d'água (sem ler ref no render).
    // setState direto no corpo do efeito viola react-hooks/set-state-in-effect;
    // adiado para o tick seguinte (mesmo padrão do unlock de CTA deste arquivo).
    const identityTimer = window.setTimeout(() => setViewerIdentity({ viewerId: viewerIdRef.current, session: sessionId.current }), 0);
    analyticsEvents.current.clear();
    payloadRef.current = payload;
    return () => window.clearTimeout(identityTimer);
  }, [playerId, payload]);

  useEffect(() => {
    // DRM "Exigir Token Assinado por Sessão": quando o dono ativa o toggle, a
    // config dinâmica recusa (403 session_required) chamadas sem um
    // sessionToken HMAC mintado pelo servidor. Pede um via POST
    // /api/embed/:id/session (mesmos viewerId/sessionId já gerados neste
    // render) e refaz o fetch da config UMA única vez. Players com o toggle
    // desligado nunca veem este caminho — seguem pagando 1 request como hoje.
    const requestSessionToken = async (): Promise<string> => {
      const sessionParams = new URLSearchParams();
      if (originToken) sessionParams.set("originToken", originToken);
      if (trackingTestId) sessionParams.set("abTestId", trackingTestId);
      try {
        const response = await fetch(`/api/embed/${encodeURIComponent(playerId)}/session${sessionParams.size ? `?${sessionParams.toString()}` : ""}`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ viewerId: viewerIdRef.current, sessionId: sessionId.current }),
        });
        if (!response.ok) return "";
        const data = await response.json().catch(() => null) as { sessionToken?: unknown } | null;
        return typeof data?.sessionToken === "string" && data.sessionToken ? data.sessionToken : "";
      } catch {
        return "";
      }
    };

    const fetchConfig = (sessionToken: string): Promise<Payload> => {
      const params = new URLSearchParams();
      if (originToken) params.set("originToken", originToken);
      if (sessionId.current) params.set("sessionId", sessionId.current);
      try { params.set("viewerId", getOrCreateViewerId()); } catch { /* sem viewer: limites por navegador inativos */ }
      // RM-04: no fluxo A/B o token foi mintado no escopo do TESTE (playerId =
      // testId + claim `abTest`). A API precisa do id do teste para verificar o
      // token no escopo certo — sem ele, o consumo do player variante rejeita.
      if (trackingTestId) params.set("abTestId", trackingTestId);
      if (sessionToken) params.set("sessionToken", sessionToken);
      return fetch(`/api/embed/${encodeURIComponent(playerId)}${params.size ? `?${params.toString()}` : ""}`, { cache: "no-store" })
        .then(async (response) => {
          const data = await response.json().catch(() => null) as (Payload & { error?: string }) | null;
          // Toggle DRM ativo e sem token ainda: a config só sai com sessão
          // assinada pelo servidor. Pede o token e refaz UMA vez; falha
          // repetida cai no erro amigável do mapa (session_required).
          if (response.status === 403 && data?.error === "session_required" && !sessionToken) {
            const token = await requestSessionToken();
            if (token) return fetchConfig(token);
          }
          if (!response.ok) throw new Error(embedErrorMessage(data?.error ?? "", response.status));
          if (!data) throw new Error(embedErrorMessage("", response.status));
          return data;
        });
    };

    // FAST-PATH do manifest (Plano A): busca em PARALELO à config dinâmica o
    // manifest público (cacheável na borda) que pinta o shell instantâneo.
    // O embed A/B (trackingTestId) NÃO usa manifest — o fluxo dele fica como
    // está. Sem token/sessão no query: a URL é a mesma para todos os
    // visitantes (chave única de cache na CDN). Qualquer falha (rede/4xx/5xx)
    // é engolida em silêncio — o shell é otimização, nunca dependência.
    if (!trackingTestId) {
      fetch(`/api/embed/${encodeURIComponent(playerId)}/manifest`)
        .then(async (response) => {
          if (!response.ok) return null;
          const manifest = await response.json().catch(() => null) as { config?: unknown; posterUrl?: unknown } | null;
          if (!manifest?.config || typeof manifest.config !== "object") return null;
          // posterUrl é a URL R2 assinada do thumbnailStart: a rota só emite
          // https da nossa própria assinatura; qualquer outra forma é
          // ignorada (nunca vira <img src>).
          const posterUrl = typeof manifest.posterUrl === "string" && /^https:\/\//i.test(manifest.posterUrl) ? manifest.posterUrl : "";
          return { config: manifest.config as Record<string, unknown>, posterUrl };
        })
        .then((shell) => { if (shell && !payloadRef.current) setManifestShell({ playerId, config: shell.config, posterUrl: shell.posterUrl }); })
        .catch(() => { /* fast-path falhou: segue o fluxo atual */ });
    }
    fetchConfig("")
      .then((data) => {
        const config = { ...data.config };
        const variants = Array.isArray(config.headlineVariants) ? config.headlineVariants.filter((item): item is string => typeof item === "string" && item.trim().length > 0) : [];
        if (config.headlineFormat !== "image" && variants.length > 0) {
          const choices = [String(config.headline || ""), ...variants].filter(Boolean);
          const assignmentKey = `prisma-headline:${data.videoId}`;
          const stored = Number(localStorage.getItem(assignmentKey));
          const index = Number.isInteger(stored) && stored >= 0 && stored < choices.length ? stored : Math.floor(Math.random() * choices.length);
          localStorage.setItem(assignmentKey, String(index));
          config.headline = choices[index];
          config.headlineVariantIndex = index;
        }
        if (config.turboMode === "automatic") {
          const minimum = Math.max(0.9, Math.min(1.5, Number(config.turboMin ?? 1)));
          const maximum = Math.max(minimum, Math.min(1.5, Number(config.turboMax ?? 1.2)));
          const assignmentKey = `prisma-turbo:${data.videoId}`;
          const stored = Number(localStorage.getItem(assignmentKey));
          const steps = Math.max(0, Math.round((maximum - minimum) * 10));
          const selected = Number.isFinite(stored) && stored >= minimum && stored <= maximum ? stored : Number((minimum + Math.floor(Math.random() * (steps + 1)) / 10).toFixed(1));
          localStorage.setItem(assignmentKey, String(selected));
          config.playbackRate = selected;
        }
        setPayload({ ...data, config });
      })
      .catch((reason: Error) => setError(reason.message));
  }, [originToken, playerId, trackingTestId]);

  useEffect(() => {
    if (payload) trackAnalytics("impression");
  // trackAnalytics intentionally follows payload availability once per embed session.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [payload]);

  useEffect(() => {
    if (!payload || window.parent === window) return;
    const parentOrigin = (() => { try { return new URL(document.referrer).origin; } catch { return ""; } })();
    if (!parentOrigin) return;
    const handleConversion = (event: MessageEvent) => {
      if (event.source !== window.parent || event.origin !== parentOrigin || event.data?.type !== "prisma-player:track-conversion" || event.data?.playerId !== playerId) return;
      const value = Number(event.data.value);
      const currency = String(event.data.currency || "").toUpperCase();
      const transactionId = String(event.data.transactionId || "").trim().slice(0, 120);
      if (!Number.isFinite(value) || value < 0 || !/^[A-Z]{3}$/.test(currency) || !transactionId) return;
      trackAnalytics("conversion", 0, liveProgress.current.watchedSeconds, { value, currency, transactionId, advertisingConsent: event.data.advertisingConsent === true });
    };
    window.addEventListener("message", handleConversion);
    return () => window.removeEventListener("message", handleConversion);
  // Conversion messages are intentionally bound to the active player payload.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [payload, playerId]);

  useEffect(() => {
    if (!payload?.videoId || !payload.eventToken || !sessionId.current) return;
    const heartbeat = () => {
      if (!isPlaying.current || document.visibilityState === "hidden") return;
      const { percent, watchedSeconds } = liveProgress.current;
      analyticsBatcherRef.current?.enqueue({ eventType: "heartbeat", progressPercent: percent, watchedSeconds });
    };
    const timer = window.setInterval(heartbeat, 15_000);
    return () => window.clearInterval(timer);
  }, [payload?.videoId, payload?.eventToken]);

  useEffect(() => {
    if (!payload || !Boolean(payload.config.ctaPersist)) return;
    const timer = window.setTimeout(() => {
      setCtaUnlocked(localStorage.getItem(`prisma-cta-unlocked:${payload.videoId}`) === "1");
    }, 0);
    return () => window.clearTimeout(timer);
  }, [payload]);

  useEffect(() => {
    if (!payload || !Boolean(payload.config.ctaPersist) || currentTime < Number(payload.config.ctaStart ?? 0)) return;
    // Grava o unlock uma única vez por vídeo; o efeito era re-executado a cada
    // tick do timeupdate (currentTime muda ~4x/s) reescrevendo localStorage.
    if (ctaUnlockWrittenRef.current === payload.videoId) return;
    ctaUnlockWrittenRef.current = payload.videoId;
    localStorage.setItem(`prisma-cta-unlocked:${payload.videoId}`, "1");
    const timer = window.setTimeout(() => setCtaUnlocked(true), 0);
    return () => window.clearTimeout(timer);
  }, [currentTime, payload]);

  useEffect(() => {
    if (!payload?.eventToken || !trackingTestId || !trackingVariantId || !trackingSessionId || sentEvents.current.has("impression:0")) return;
    sentEvents.current.add("impression:0");
    void fetch("/api/ab-events", { method: "POST", keepalive: true, headers: { "content-type": "application/json" }, body: JSON.stringify({ testId: trackingTestId, variantId: trackingVariantId, sessionId: trackingSessionId, eventType: "impression", progressPercent: 0, watchedSeconds: 0, eventToken: payload.eventToken }) });
  }, [payload, trackingSessionId, trackingTestId, trackingVariantId]);

  useEffect(() => {
    if (!payload) return;
    // Bloqueios de navegador são mitigação, não DRM real. Cada toggle da sub-aba
    // DRM controla o seu bloqueio; o antiDownload (sempre on) é a base comum.
    const menuBlocked = payload.config.antiDownload !== false && payload.config.disableContextMenu !== false;
    const shortcutsBlocked = payload.config.antiDownload !== false && payload.config.blockDevTools !== false;
    const blockContext = (event: MouseEvent) => event.preventDefault();
    const blockDrag = (event: DragEvent) => event.preventDefault();
    const blockShortcuts = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();
      if (event.key === "F12" || (event.ctrlKey && event.shiftKey && ["i", "j", "c"].includes(key)) || (event.ctrlKey && ["u", "s"].includes(key))) {
        event.preventDefault();
        event.stopPropagation();
      }
    };
    if (menuBlocked) {
      document.addEventListener("contextmenu", blockContext);
      document.addEventListener("dragstart", blockDrag);
    }
    if (shortcutsBlocked) document.addEventListener("keydown", blockShortcuts, true);
    return () => {
      document.removeEventListener("contextmenu", blockContext);
      document.removeEventListener("dragstart", blockDrag);
      document.removeEventListener("keydown", blockShortcuts, true);
    };
  }, [payload]);

  useEffect(() => {
    if (window.parent === window) return;
    const content = document.querySelector<HTMLElement>("main[data-prisma-embed]");
    if (!content) return;
    const targetOrigin = (() => {
      try { return document.referrer ? new URL(document.referrer).origin : ""; }
      catch { return ""; }
    })();
    if (!targetOrigin) return;
    const publishSize = () => window.parent.postMessage({ type: "prisma-player:resize", playerId, height: Math.max(1, Math.ceil(content.getBoundingClientRect().height)) }, targetOrigin);
    const observer = new ResizeObserver(publishSize);
    observer.observe(content);
    publishSize();
    return () => observer.disconnect();
  }, [playerId, payload]);

  useEffect(() => {
    document.documentElement.style.setProperty("background", "transparent", "important");
    document.body.style.setProperty("background", "transparent", "important");
  }, []);

  useEffect(() => {
    // Limpa os timers do selo orgânico e da marca d'água ao desmontar.
    return () => {
      window.clearTimeout(promoTimerRef.current);
      window.clearTimeout(watermarkTimerRef.current);
    };
  }, []);

  useEffect(() => {
    // Modos da marca d'água: estático fica sempre visível; dinâmico reaparece
    // no intervalo configurado (visível por ~1/3 do intervalo, máx. 10s). O
    // botão direito arma fora de hora em qualquer modo (handleVideoContextMenu).
    if (!payload || !Boolean(payload.config.watermarkEnabled)) return;
    if (payload.config.watermarkType === "static") {
      // Arm adiada: setState sincrono no corpo do efeito viola
      // react-hooks/set-state-in-effect (mesma regra do identityTimer).
      const armTimer = window.setTimeout(() => setWatermarkArmed(true), 0);
      return () => window.clearTimeout(armTimer);
    }
    const value = Math.max(3, Math.min(600, Number(payload.config.watermarkIntervalValue) || 10));
    const intervalMs = value * (payload.config.watermarkIntervalUnit === "minute" ? 60_000 : 1_000);
    const showMs = Math.min(10_000, Math.max(2_000, Math.round(intervalMs / 3)));
    let hideTimer = 0;
    const cycle = window.setInterval(() => {
      setWatermarkArmed(true);
      hideTimer = window.setTimeout(() => setWatermarkArmed(false), showMs);
    }, intervalMs);
    return () => {
      window.clearInterval(cycle);
      window.clearTimeout(hideTimer);
    };
  }, [payload]);

  function handleVideoContextMenu(event: React.MouseEvent) {
    // Selo orgânico em todas as VSLs: intercepta o botão direito sobre o vídeo,
    // mostra o selo exatamente onde clicou e some sozinho em 6s.
    event.preventDefault();
    event.stopPropagation();
    const box = videoBoxRef.current?.getBoundingClientRect();
    if (box) {
      const rawX = event.clientX - box.left;
      const rawY = event.clientY - box.top;
      // Prende o selo dentro do player para nunca vazar para fora.
      const x = Math.min(Math.max(rawX, 140), Math.max(140, box.width - 140));
      const y = Math.min(Math.max(rawY, 90), Math.max(90, box.height - 24));
      setPromoSpot({ x, y });
      window.clearTimeout(promoTimerRef.current);
      promoTimerRef.current = window.setTimeout(() => setPromoSpot(null), 6000);
      // Marca d'água arma na tentativa de download (botão direito). No modo
      // estático ela já está sempre visível — não agenda o sumiço.
      setWatermarkArmed(true);
      if (payload?.config.watermarkType !== "static") {
        window.clearTimeout(watermarkTimerRef.current);
        watermarkTimerRef.current = window.setTimeout(() => setWatermarkArmed(false), 15000);
      }
    }
  }

  useEffect(() => {
    if (!Boolean(payload?.config.disablePause)) return;
    // Busca o elemento de vídeo dentro do container do player para evitar conflitos
    // com outros vídeos na página. O seletor prioriza o vídeo do player por sua classe
    // e atributos data, caindo de volta ao seletor global apenas se necessário.
    const container = document.querySelector('[data-prisma-embed]');
    const media = container
      ? container.querySelector<HTMLVideoElement>("video")
      : document.querySelector<HTMLVideoElement>("video");
    if (!media) return;
    const keepPlaying = () => { if (!media.ended && media.currentTime > 0) void media.play().catch(() => undefined); };
    media.addEventListener("pause", keepPlaying);
    return () => media.removeEventListener("pause", keepPlaying);
  }, [payload]);

  useEffect(() => {
    const config = payload?.config;
    if (!config || !Boolean(config.ctaAutoScroll) || ctaAutoScrolled.current || currentTime < Number(config.ctaStart ?? 0)) return;
    const cta = document.querySelector<HTMLElement>("[data-prisma-cta]");
    if (!cta) return;
    ctaAutoScrolled.current = true;
    cta.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [currentTime, payload]);

  if (error) return <main className="grid min-h-dvh place-items-center bg-transparent p-6 text-center text-[#6e6e73]"><section role="alert" className="max-w-sm"><h1 className="mb-2 text-base font-semibold text-[#1d1d1f]">Reprodução indisponível</h1><p className="text-sm leading-6">{error}</p></section></main>;
  if (!payload) {
    const shellSource = manifestShell && manifestShell.playerId === playerId ? manifestShell : null;
    const shell = shellSource?.config ?? null;
    // Sem manifest ainda (ou de outro player): placeholder neutro de hoje.
    if (!shell) return <main className="grid min-h-dvh place-items-center bg-transparent p-4"><div className="w-full max-w-3xl"><div className="grid aspect-video w-full place-items-center overflow-hidden rounded-2xl bg-black"><span className="flex flex-col items-center gap-3"><svg width="44" height="44" viewBox="0 0 44 44" aria-hidden className="animate-pulse"><circle cx="22" cy="22" r="21" fill="rgba(255,255,255,0.08)" /><path d="M18 14.5v15l12-7.5z" fill="rgba(255,255,255,0.85)" /></svg><span className="animate-pulse text-[12px] font-semibold text-white/70">Carregando VSL…</span></span></div></div></main>;
    // SHELL do manifest (boot em duas fases): pintura instantânea de
    // apresentação com as cosmetics públicas — headline + moldura do player
    // (fundo preto como o primeiro paint real, radius e proporção 16:9) —
    // enquanto a config dinâmica chega. SEM botões, SEM CTA e SEM <video>:
    // interativos existem só no payload final (nada de listener duplicado).
    // O payload substitui este bloco inteiro; headlineVariants/turbo/A-B
    // continuam aplicando só sobre o payload dinâmico, nunca sobre o shell.
    const shellHeadlineRaw = shell.headline;
    // Gate idêntico ao player real (Boolean(c.headlineEnabled), linha do
    // payload): sem isso, player com headline preenchida mas DESATIVADA a
    // exibia no shell pela janela sub-segundo de boot.
    const shellHeadline = Boolean(shell.headlineEnabled) && typeof shellHeadlineRaw === "string" ? shellHeadlineRaw.trim() : "";
    return (
      <main data-prisma-embed className="flex min-h-0 select-none justify-center bg-transparent">
        <div className="flex w-full flex-col" style={{ width: "100%" }}>
          {shellHeadline && (
            <HeadlineBlock
              headline={shellHeadline}
              color={String(shell.headlineColor ?? "#1d1d1f")}
              background={String(shell.headlineBackground ?? "#ffffff")}
              fontSize={30}
              align={String(shell.headlineAlign ?? "center")}
              playerRadius={Number(shell.radius ?? 0)}
              format="text"
            />
          )}
          <div className="relative order-2 mx-auto grid aspect-video w-full place-items-center overflow-hidden bg-black" style={{ borderRadius: `${Number(shell.radius ?? 0)}px` }}>
            {/* Poster instantâneo (borrow do padrão Vturb): o thumbnailStart
                assinado do manifest cobre o box por baixo do spinner — o
                primeiro paint deixa de ser um retângulo preto. alt vazio +
                aria-hidden: o poster é decoração do loading; o spinner
                (role="status") continua sendo o anúncio para leitores de
                tela. O spinner ganha relative z-10 porque um elemento
                posicionado (o img) pinta acima do conteúdo in-flow mesmo
                vindo antes no DOM. */}
            {shellSource?.posterUrl && <img src={shellSource.posterUrl} alt="" aria-hidden="true" loading="eager" decoding="async" className="absolute inset-0 h-full w-full object-cover" />}
            <span role="status" aria-label="Carregando vídeo" className="relative z-10 block h-7 w-7 animate-spin rounded-full border-2 border-white/25 border-t-white motion-reduce:animate-none" />
          </div>
        </div>
      </main>
    );
  }

  const c = payload.config;
  const style = { "--player-accent": String(c.progressColor ?? c.accent ?? "#0066cc"), "--player-progress-height": `${Number(c.progressHeight ?? 6)}px` } as CSSProperties;
  const assetUrls = c.assetUrls && typeof c.assetUrls === "object" ? c.assetUrls as Record<string, string> : {};
  const actualProgress = duration > 0 ? Math.min(1, currentTime / duration) : 0;
  const smartProgress = actualProgress >= 1 ? 100 : Math.min(99.5, (1 - Math.pow(1 - actualProgress, 2.4)) * 100);
  const rawCtaUrl = String(c.ctaUrl ?? "");
  const safeCtaUrl = /^https?:\/\//i.test(rawCtaUrl) ? rawCtaUrl : "";
  const autoplayCover = resolveAutoplayCover(c);
  const resumeStorageKey = `prisma-resume:${payload.videoId}`;
  const smartAutoplay = Boolean(c.smartAutoplay);
  const resumeEnabled = Boolean(c.resumeEnabled);
  const thumbnailEnabled = Boolean(c.thumbnailEnabled);
  const playerClasses = `prisma-player--embed ${c.antiDownload === false ? "prisma-player--unprotected" : ""} ${Boolean(c.smartProgress) ? "prisma-player--smart-progress" : ""} ${c.playPause === false ? "prisma-player--play-pause-hidden" : ""} ${c.seekBackward === true ? "" : "prisma-player--seek-back-hidden"} ${c.seekForward === true ? "" : "prisma-player--seek-forward-hidden"} ${c.fullscreenDesktop === false ? "prisma-player--fullscreen-desktop-hidden" : ""} ${c.fullscreenMobile === false ? "prisma-player--fullscreen-mobile-hidden" : ""}`;

  const configuredRatio = Number(c.aspectRatio);
  const initialRatio = Number.isFinite(configuredRatio) && configuredRatio > 0 ? configuredRatio : 16 / 9;
  const responsiveStyle = { ...style, width: "100%" };
  const ctaEnd = Number(c.ctaEnd ?? 0);
  const ctaVisible = Boolean(c.ctaEnabled) && (ctaUnlocked || currentTime >= Number(c.ctaStart ?? 0)) && (ctaUnlocked || ctaEnd <= 0 || currentTime <= ctaEnd);
  const headlineVisible = currentTime >= Number(c.headlineStart ?? 0) && (Number(c.headlineDuration ?? 0) <= 0 || currentTime <= Number(c.headlineStart ?? 0) + Number(c.headlineDuration ?? 0));
  const ctaOnTop = c.ctaPosition === "top";
  const hookRemaining = Math.max(0, Math.ceil(Number(c.miniHookStart ?? 0) + Number(c.miniHookDuration ?? 6) - currentTime));
  const hookText = String(c.miniHookText || "Continue assistindo").replace("{mm:ss}", `${Math.floor(hookRemaining / 60)}:${String(hookRemaining % 60).padStart(2, "0")}`);
  const hookType = typeof c.miniHookType === "string" ? c.miniHookType : "custom";
  const hookViewers = hookType === "live_viewers" && payload?.videoId ? hookLiveViewersCount(payload.videoId) : 0;
  const autoplayAnimClass = c.autoplayAnimation === "pulse" ? "animate-pulse" : c.autoplayAnimation === "sound_bars" ? "studio-autoplay-sound" : c.autoplayAnimation === "cursor_click" ? "studio-autoplay-click" : c.autoplayAnimation === "play_glow" ? "studio-autoplay-glow" : "";

  return <main data-prisma-embed className="flex min-h-0 select-none justify-center bg-transparent" onContextMenu={(event) => { if (c.antiDownload !== false && c.disableContextMenu !== false) event.preventDefault(); }}>
    <div className="flex w-full flex-col" style={responsiveStyle}>
      {Boolean(c.headlineEnabled) && headlineVisible && (
        <HeadlineBlock
          tagBadge={typeof c.headlineTagBadge === "string" ? c.headlineTagBadge : ""}
          headline={String(c.headline ?? "")}
          color={String(c.headlineColor ?? "#1d1d1f")}
          background={String(c.headlineBackground ?? "#ffffff")}
          fontSize={Number(c.headlineSize ?? 30)}
          align={String(c.headlineAlign ?? "center")}
          playerRadius={Number(c.radius ?? 0)}
          format={typeof c.headlineFormat === "string" ? c.headlineFormat : "text"}
          desktopUrl={typeof assetUrls.headlineDesktop === "string" ? assetUrls.headlineDesktop : undefined}
          mobileUrl={typeof assetUrls.headlineMobile === "string" ? assetUrls.headlineMobile : undefined}
        />
      )}
      <div ref={videoBoxRef} className="relative order-2 mx-auto w-full overflow-hidden bg-transparent" style={{ borderRadius: `${Number(c.radius ?? 0)}px`, aspectRatio: String(videoRatio ?? initialRatio), ...(String(c.colorStyle) === "gradient" || (c.background && String(c.background).toLowerCase() !== "#000000" && String(c.background).toLowerCase() !== "#000") ? { background: String(c.colorStyle) === "gradient" ? `linear-gradient(135deg, ${String(c.background ?? "#000000")}, ${String(c.gradientEnd ?? "#2997ff")})` : String(c.background) } : {}) }} onContextMenu={handleVideoContextMenu}>
      <VideoPlayer className={playerClasses} sources={[{ src: payload.source, type: payload.type }]} poster={thumbnailEnabled && assetUrls.thumbnailStart ? assetUrls.thumbnailStart : undefined} preload="auto" textTracks={Boolean(c.captionsEnabled) && assetUrls.captions ? [{ src: assetUrls.captions, kind: "subtitles", label: String(c.captionName || "Legendas"), srclang: "pt-BR", default: true }] : []} autoplay={smartAutoplay && resumeChecked && resumePoint === null && !autoplayActivated} muted={Boolean(c.muted) || (smartAutoplay && !autoplayActivated)} loop={Boolean(c.loop)} playbackRate={Number(c.playbackRate ?? 1)} bigPlayButton={c.bigPlay !== false} pauseWhenHidden={Boolean(c.smartPause)} playbackRates={[0.75, 1, 1.25, 1.5, 2]} startTime={startTime} restartWithSoundSignal={restartWithSoundSignal} resumePlaybackSignal={resumePlaybackSignal} onPlay={() => { isPlaying.current = true; track("play", 0, currentTime); trackAnalytics("play", 0, currentTime); setThumbnailOverlay(null); }} onPause={() => { isPlaying.current = false; if (thumbnailEnabled && assetUrls.thumbnailPause && currentTime > 0 && currentTime < duration) setThumbnailOverlay("pause"); }} onEnded={() => { isPlaying.current = false; track("complete", 100, duration); trackAnalytics("complete", 100, duration); if (!Boolean(c.loop)) localStorage.removeItem(resumeStorageKey); if (thumbnailEnabled && assetUrls.thumbnailEnd) setThumbnailOverlay("end"); }} onTimeUpdate={(time) => { if (Math.floor(time) !== renderedSecondRef.current) { renderedSecondRef.current = Math.floor(time); setCurrentTime(time); } liveProgress.current = { percent: duration > 0 ? Math.min(100, Math.round(time / duration * 100)) : 0, watchedSeconds: time }; if (resumeEnabled && time > 0 && Math.floor(time) !== lastResumeWriteRef.current) { lastResumeWriteRef.current = Math.floor(time); localStorage.setItem(resumeStorageKey, String(Math.floor(time))); } if (duration > 0) [10, 25, 50, 75, 90].forEach((point) => { if (time / duration * 100 >= point) { if ([25, 50, 75].includes(point)) track("progress", point, time); trackAnalytics("progress", point, time); } }); }} onLoadedMetadata={(metadata) => { setDuration(metadata.duration); if (metadata.width > 0 && metadata.height > 0) setVideoRatio(metadata.width / metadata.height); if (resumeEnabled) { const saved = Number(localStorage.getItem(resumeStorageKey)); if (Number.isFinite(saved) && saved >= 5 && saved < metadata.duration - 5) setResumePoint(saved); } setResumeChecked(true); }} controlVisibility={{ progressControl: !Boolean(c.smartProgress) && c.progressBar !== false, currentTimeDisplay: c.time !== false, durationDisplay: c.time !== false, volumePanel: c.volume !== false, fullscreenToggle: c.fullscreen !== false, pictureInPictureToggle: c.pictureInPicture !== false, playbackRateMenuButton: c.speedControl !== false, seekBackward: c.seekBackward === true, seekForward: c.seekForward === true }} />
        {Boolean(c.watermarkEnabled) && watermarkArmed && <div className={`pointer-events-none absolute z-40 p-3 font-mono text-[11px] leading-tight select-none ${c.watermarkPosition === "top-left" ? "top-3 left-3 text-left" : c.watermarkPosition === "bottom-left" ? "bottom-3 left-3 text-left" : c.watermarkPosition === "bottom-right" ? "bottom-3 right-3 text-right" : c.watermarkPosition === "center" ? "top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-center" : "top-3 right-3 text-right"}`} style={{ color: "rgba(255,255,255,0.9)", textShadow: "0 1px 3px rgba(0,0,0,0.8)", opacity: Number(c.watermarkOpacity ?? 85) / 100 }}>
          {Boolean(c.watermarkShowUsername) && viewerIdentity?.viewerId && <div>ID: {viewerIdentity.viewerId.slice(0, 8)}</div>}
          {Boolean(c.watermarkShowIp) && (payload.viewerIp ? <div>IP: {payload.viewerIp}</div> : viewerIdentity?.session ? <div>Sessão: {viewerIdentity.session.slice(0, 8)}</div> : null)}
          {Boolean(c.watermarkShowEmail) && String(c.watermarkEmailText ?? "").trim() && <div>{String(c.watermarkEmailText)}</div>}
          {Boolean(c.watermarkShowPhone) && String(c.watermarkPhoneText ?? "").trim() && <div>{String(c.watermarkPhoneText)}</div>}
          {Boolean(c.watermarkShowDate) && <div>{new Date().toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" })}</div>}
          {Boolean(c.watermarkShowCustomText) && Boolean(c.watermarkCustomText) && <div>{String(c.watermarkCustomText)}</div>}
        </div>}
        {resumeEnabled && resumePoint !== null && <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/75 p-5 text-center text-white backdrop-blur-sm"><div><p className="mb-4 text-[16px] font-semibold">{String(c.resumeMessage || "Você já começou a assistir este vídeo")}</p><div className="flex flex-wrap justify-center gap-2"><button type="button" onClick={() => { setStartTime(resumePoint); setResumePoint(null); setAutoplayActivated(true); setResumePlaybackSignal((value) => value + 1); }} className="min-h-11 rounded-full bg-white px-5 text-[13px] font-semibold text-black">Continuar em {Math.floor(resumePoint / 60)}:{String(Math.floor(resumePoint % 60)).padStart(2, "0")}</button><button type="button" onClick={() => { localStorage.removeItem(resumeStorageKey); setStartTime(0); setResumePoint(null); setAutoplayActivated(true); setRestartWithSoundSignal((value) => value + 1); }} className="min-h-11 rounded-full border border-white/30 px-5 text-[13px] font-semibold">Assistir do início</button></div></div></div>}
        {smartAutoplay && resumeChecked && !autoplayActivated && resumePoint === null && (
          <AutoplayOverlay
            message={String(c.autoplayMessage || "Seu vídeo já começou. Clique para ouvir.")}
            textColor={String(c.autoplayTextColor ?? "#ffffff")}
            background={String(c.autoplayBackground ?? c.accent ?? "#0066cc")}
            radius={Number(c.autoplayRadius ?? 12)}
            tagBadge={typeof c.autoplayTagBadge === "string" ? c.autoplayTagBadge : ""}
            coverUrl={autoplayCover.type !== "standard" ? autoplayCover.url : null}
            overlayOpacity={Number(c.autoplayOverlayOpacity ?? 90)}
            animClass={autoplayAnimClass}
            onActivate={() => { setStartTime(0); setAutoplayActivated(true); setRestartWithSoundSignal((value) => value + 1); }}
          />
        )}
        {Boolean(c.smartProgress) && c.progressBar !== false && <div className="pointer-events-none absolute inset-x-0 bottom-0 z-30 bg-transparent" style={{ height: `${Math.max(Number(c.progressHeight ?? 6), 4)}px` }}><div className="h-full transition-[width] duration-1000 ease-linear" style={{ width: `${smartProgress}%`, backgroundColor: String(c.progressColor ?? c.accent ?? "#0066cc") }} /></div>}
        {Boolean(c.miniHooksEnabled) && currentTime >= Number(c.miniHookStart ?? 0) && currentTime < Number(c.miniHookStart ?? 0) + Number(c.miniHookDuration ?? 6) && <div className="pointer-events-none absolute inset-x-4 top-4 z-20 mx-auto max-w-[520px] px-4 py-3 font-semibold shadow-md backdrop-blur-md" style={{ color: String(c.miniHookTextColor ?? "#ffffff"), backgroundColor: `${String(c.miniHookBackground ?? "#111111")}e8`, fontSize: `${Number(c.miniHookSize ?? 16)}px`, borderRadius: `${Number(c.miniHookRadius ?? 10)}px`, textAlign: String(c.miniHookAlign ?? "center") as CSSProperties["textAlign"] }}>{hookText}{hookType === "live_viewers" && <span className="ml-1.5 font-extrabold" style={{ color: String(c.miniHookCounterColor ?? "#ff3b30") }}>{hookViewers} assistindo</span>}</div>}
        {thumbnailOverlay && <button type="button" onClick={() => { const paused = thumbnailOverlay === "pause"; setThumbnailOverlay(null); if (paused) setResumePlaybackSignal((value) => value + 1); else setRestartWithSoundSignal((value) => value + 1); }} className="absolute inset-0 z-50 bg-cover bg-center" style={{ backgroundImage: `url(${thumbnailOverlay === "pause" ? assetUrls.thumbnailPause : assetUrls.thumbnailEnd})` }} aria-label={thumbnailOverlay === "pause" ? "Continuar vídeo" : "Assistir novamente"}><span className="absolute inset-0 grid place-items-center bg-black/20"><span className="rounded-full bg-black/70 px-5 py-3 text-[13px] font-semibold text-white backdrop-blur-md">{thumbnailOverlay === "pause" ? "Continuar assistindo" : "Assistir novamente"}</span></span></button>}
        {c.ctaPosition === "middle" && ctaVisible && safeCtaUrl && (
          <div className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center p-4">
            <div className="pointer-events-auto max-w-full">
              <a data-prisma-cta href={safeCtaUrl} target={Boolean(c.ctaNewTab) ? "_blank" : undefined} rel="noopener noreferrer" onClick={() => trackAnalytics("cta_click", 0, currentTime)} className={`prisma-embed-cta mx-auto flex min-h-12 w-fit max-w-full flex-col items-center justify-center font-semibold ${Boolean(c.ctaPulse) ? "studio-cta-pulse" : ""}`} style={{ color: String(c.ctaTextColor ?? "#ffffff"), backgroundColor: String(c.ctaBackground ?? c.accent ?? "#0066cc"), fontSize: `${Number(c.ctaFontSize ?? 18)}px`, borderRadius: `${Number(c.ctaRadius ?? 12)}px`, padding: `${Number(c.ctaPaddingY ?? 12)}px ${Number(c.ctaPaddingX ?? 24)}px`, boxShadow: Boolean(c.ctaShadow) ? "0 10px 30px rgba(0,0,0,0.30)" : "none", "--cta-hover-bg": String(c.ctaHoverBackground ?? "#0055aa"), "--cta-hover-color": String(c.ctaHoverTextColor ?? "#ffffff") } as CSSProperties}><span>{String(c.ctaText ?? "Quero aproveitar agora")}</span>{Boolean(c.ctaSubtitle) && <span style={{ fontSize: "0.65em", fontWeight: 400, opacity: 0.9 }}>{String(c.ctaSubtitle)}</span>}{Boolean(c.ctaBadges) && <span style={{ fontSize: "0.6em", fontWeight: 600, opacity: 0.75 }}>{String(c.ctaBadges)}</span>}</a>
            </div>
          </div>
        )}
        {promoSpot && (
          <a
            href="https://prismaplayer.com.br"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Hospede sua VSL na Prisma Player e aumente suas vendas"
            className="absolute z-50 w-max max-w-[280px] -translate-x-1/2 -translate-y-[115%] rounded-2xl border border-white/30 bg-white/10 px-4 py-3 text-center shadow-2xl backdrop-blur-xl transition-transform hover:scale-105"
            style={{ left: promoSpot.x, top: promoSpot.y, textShadow: "0 1px 8px rgba(0,0,0,0.6)" }}
          >
            <span className="block text-[13px] font-bold leading-snug text-white">
              Hospede sua VSL e aumente suas vendas
            </span>
          </a>
        )}
      </div>
      {ctaVisible && safeCtaUrl && c.ctaPosition !== "middle" && <a data-prisma-cta href={safeCtaUrl} target={Boolean(c.ctaNewTab) ? "_blank" : undefined} rel="noopener noreferrer" onClick={() => trackAnalytics("cta_click", 0, currentTime)} className={`prisma-embed-cta mx-auto ${ctaOnTop ? "mb-4 order-1" : "mt-4 order-3"} flex min-h-12 w-fit flex-col items-center justify-center font-semibold ${Boolean(c.ctaPulse) ? "studio-cta-pulse" : ""}`} style={{ color: String(c.ctaTextColor ?? "#ffffff"), backgroundColor: String(c.ctaBackground ?? c.accent ?? "#0066cc"), fontSize: `${Number(c.ctaFontSize ?? 18)}px`, borderRadius: `${Number(c.ctaRadius ?? 12)}px`, padding: `${Number(c.ctaPaddingY ?? 12)}px ${Number(c.ctaPaddingX ?? 24)}px`, boxShadow: Boolean(c.ctaShadow) ? "0 10px 30px rgba(0,0,0,0.30)" : "none", "--cta-hover-bg": String(c.ctaHoverBackground ?? "#0055aa"), "--cta-hover-color": String(c.ctaHoverTextColor ?? "#ffffff") } as CSSProperties}><span>{String(c.ctaText ?? "Quero aproveitar agora")}</span>{Boolean(c.ctaSubtitle) && <span style={{ fontSize: "0.65em", fontWeight: 400, opacity: 0.9 }}>{String(c.ctaSubtitle)}</span>}{Boolean(c.ctaBadges) && <span style={{ fontSize: "0.6em", fontWeight: 600, opacity: 0.75 }}>{String(c.ctaBadges)}</span>}</a>}
    </div>
  </main>;
}
