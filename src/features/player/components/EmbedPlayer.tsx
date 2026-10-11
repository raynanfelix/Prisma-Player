"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import VideoPlayer from "./VideoPlayer";
import { pixelIntegrations } from "@/lib/player/pixels";
import { createAnalyticsBatcher } from "@/lib/player/analytics-batcher";
import { getOrCreateViewerId } from "@/lib/player/viewer-id";

interface Payload { videoId: string; title: string; source: string; type: string; config: Record<string, unknown>; eventToken?: string }

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
    analyticsEvents.current.clear();
    payloadRef.current = payload;
  }, [playerId, payload]);

  useEffect(() => {
    const params = new URLSearchParams();
    if (originToken) params.set("originToken", originToken);
    if (sessionId.current) params.set("sessionId", sessionId.current);
    // RM-04: no fluxo A/B o token foi mintado no escopo do TESTE (playerId =
    // testId + claim `abTest`). A API precisa do id do teste para verificar o
    // token no escopo certo — sem ele, o consumo do player variante rejeita.
    if (trackingTestId) params.set("abTestId", trackingTestId);
    fetch(`/api/embed/${encodeURIComponent(playerId)}${params.size ? `?${params.toString()}` : ""}`, { cache: "no-store" })
      .then(async (response) => {
        const data = await response.json().catch(() => null) as (Payload & { error?: string }) | null;
        if (!response.ok) throw new Error(embedErrorMessage(data?.error ?? "", response.status));
        if (!data) throw new Error(embedErrorMessage("", response.status));
        return data;
      })
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
    if (!payload || payload.config.antiDownload === false) return;
    const blockContext = (event: MouseEvent) => event.preventDefault();
    const blockDrag = (event: DragEvent) => event.preventDefault();
    const blockShortcuts = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();
      if (event.key === "F12" || (event.ctrlKey && event.shiftKey && ["i", "j", "c"].includes(key)) || (event.ctrlKey && ["u", "s"].includes(key))) {
        event.preventDefault();
        event.stopPropagation();
      }
    };
    document.addEventListener("contextmenu", blockContext);
    document.addEventListener("dragstart", blockDrag);
    document.addEventListener("keydown", blockShortcuts, true);
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
    if (!Boolean(payload?.config.disablePause)) return;
    const media = document.querySelector<HTMLVideoElement>("video");
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
  if (!payload) return <main className="grid min-h-dvh place-items-center bg-transparent text-[#7a7a7a]"><span className="animate-pulse">Carregando player…</span></main>;

  const c = payload.config;
  const style = { "--player-accent": String(c.progressColor ?? c.accent ?? "#0066cc"), "--player-progress-height": `${Number(c.progressHeight ?? 6)}px` } as CSSProperties;
  const assetUrls = c.assetUrls && typeof c.assetUrls === "object" ? c.assetUrls as Record<string, string> : {};
  const actualProgress = duration > 0 ? Math.min(1, currentTime / duration) : 0;
  const smartProgress = actualProgress >= 1 ? 100 : Math.min(99.5, (1 - Math.pow(1 - actualProgress, 2.4)) * 100);
  const rawCtaUrl = String(c.ctaUrl ?? "");
  const safeCtaUrl = /^https?:\/\//i.test(rawCtaUrl) ? rawCtaUrl : "";
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
  const hookRemaining = Math.max(0, Math.ceil(Number(c.miniHookStart ?? 0) + Number(c.miniHookDuration ?? 6) - currentTime));
  const hookText = String(c.miniHookText || "Continue assistindo").replace("{mm:ss}", `${Math.floor(hookRemaining / 60)}:${String(hookRemaining % 60).padStart(2, "0")}`);

  return <main data-prisma-embed className="flex min-h-0 select-none justify-center bg-transparent" onContextMenu={(event) => { if (c.antiDownload !== false) event.preventDefault(); }}>
    <div className="w-full" style={responsiveStyle}>
      {Boolean(c.headlineEnabled) && (c.headlineFormat === "image" && (assetUrls.headlineDesktop || assetUrls.headlineMobile) ? <picture className="mb-4 block w-full"><source media="(max-width: 767px)" srcSet={assetUrls.headlineMobile || assetUrls.headlineDesktop} /><img src={assetUrls.headlineDesktop || assetUrls.headlineMobile} alt="" draggable={false} className="block h-auto w-full object-contain" /></picture> : <h1 className="mb-4 px-4 py-3 font-semibold leading-tight" style={{ color: String(c.headlineColor ?? "#1d1d1f"), backgroundColor: String(c.headlineBackground ?? "#ffffff"), fontSize: `clamp(16px,4vw,${Number(c.headlineSize ?? 30)}px)`, textAlign: String(c.headlineAlign ?? "center") as CSSProperties["textAlign"], borderRadius: `${Math.min(Number(c.radius ?? 0), 16)}px` }}>{String(c.headline ?? "")}</h1>)}
      <div className="relative w-full overflow-hidden bg-transparent" style={{ borderRadius: `${Number(c.radius ?? 0)}px`, aspectRatio: String(videoRatio ?? initialRatio) }}>
      <VideoPlayer className={playerClasses} sources={[{ src: payload.source, type: payload.type }]} poster={thumbnailEnabled && !smartAutoplay ? assetUrls.thumbnailStart : undefined} textTracks={Boolean(c.captionsEnabled) && assetUrls.captions ? [{ src: assetUrls.captions, kind: "subtitles", label: String(c.captionName || "Legendas"), srclang: "pt-BR", default: true }] : []} autoplay={smartAutoplay && resumeChecked && resumePoint === null && !autoplayActivated} muted={Boolean(c.muted) || (smartAutoplay && !autoplayActivated)} loop={Boolean(c.loop)} playbackRate={Number(c.playbackRate ?? 1)} bigPlayButton={c.bigPlay !== false} pauseWhenHidden={Boolean(c.smartPause)} startTime={startTime} restartWithSoundSignal={restartWithSoundSignal} resumePlaybackSignal={resumePlaybackSignal} onPlay={() => { isPlaying.current = true; track("play", 0, currentTime); trackAnalytics("play", 0, currentTime); setThumbnailOverlay(null); }} onPause={() => { isPlaying.current = false; if (thumbnailEnabled && assetUrls.thumbnailPause && currentTime > 0 && currentTime < duration) setThumbnailOverlay("pause"); }} onEnded={() => { isPlaying.current = false; track("complete", 100, duration); trackAnalytics("complete", 100, duration); if (!Boolean(c.loop)) localStorage.removeItem(resumeStorageKey); if (thumbnailEnabled && assetUrls.thumbnailEnd) setThumbnailOverlay("end"); }} onTimeUpdate={(time) => { if (Math.floor(time) !== renderedSecondRef.current) { renderedSecondRef.current = Math.floor(time); setCurrentTime(time); } liveProgress.current = { percent: duration > 0 ? Math.min(100, Math.round(time / duration * 100)) : 0, watchedSeconds: time }; if (resumeEnabled && time > 0 && Math.floor(time) !== lastResumeWriteRef.current) { lastResumeWriteRef.current = Math.floor(time); localStorage.setItem(resumeStorageKey, String(Math.floor(time))); } if (duration > 0) [10, 25, 50, 75, 90].forEach((point) => { if (time / duration * 100 >= point) { if ([25, 50, 75].includes(point)) track("progress", point, time); trackAnalytics("progress", point, time); } }); }} onLoadedMetadata={(metadata) => { setDuration(metadata.duration); if (metadata.width > 0 && metadata.height > 0) setVideoRatio(metadata.width / metadata.height); if (resumeEnabled) { const saved = Number(localStorage.getItem(resumeStorageKey)); if (Number.isFinite(saved) && saved >= 5 && saved < metadata.duration - 5) setResumePoint(saved); } setResumeChecked(true); }} controlVisibility={{ progressControl: !Boolean(c.smartProgress) && c.progressBar !== false, currentTimeDisplay: c.time !== false, durationDisplay: c.time !== false, volumePanel: c.volume !== false, fullscreenToggle: c.fullscreen !== false, pictureInPictureToggle: c.pictureInPicture !== false, playbackRateMenuButton: c.speedControl !== false }} />
        {Boolean(c.watermarkEnabled) && <div className={`pointer-events-none absolute z-40 p-3 font-mono text-[11px] leading-tight select-none ${c.watermarkPosition === "top-left" ? "top-3 left-3 text-left" : c.watermarkPosition === "bottom-left" ? "bottom-3 left-3 text-left" : c.watermarkPosition === "bottom-right" ? "bottom-3 right-3 text-right" : c.watermarkPosition === "center" ? "top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-center" : "top-3 right-3 text-right"}`} style={{ color: "rgba(255,255,255,0.9)", textShadow: "0 1px 3px rgba(0,0,0,0.8)", opacity: Number(c.watermarkOpacity ?? 85) / 100 }}>
          {Boolean(c.watermarkShowEmail) && <div>john.doe@example.com</div>}
          {Boolean(c.watermarkShowPhone) && <div>+1-128-456-789</div>}
          {Boolean(c.watermarkShowIp) && <div>192.168.1.101</div>}
          {Boolean(c.watermarkShowUsername) && <div>John Doe</div>}
          {Boolean(c.watermarkShowDate) && <div>{new Date().toLocaleDateString("en-US", { month: "short", day: "2-digit", year: "numeric" })}</div>}
          {Boolean(c.watermarkShowCustomText) && Boolean(c.watermarkCustomText) && <div>{String(c.watermarkCustomText)}</div>}
        </div>}
        {resumePoint !== null && <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/75 p-5 text-center text-white backdrop-blur-sm"><div><p className="mb-4 text-[16px] font-semibold">{String(c.resumeMessage || "Você já começou a assistir este vídeo")}</p><div className="flex flex-wrap justify-center gap-2"><button type="button" onClick={() => { setStartTime(resumePoint); setResumePoint(null); setAutoplayActivated(true); setResumePlaybackSignal((value) => value + 1); }} className="min-h-11 rounded-full bg-white px-5 text-[13px] font-semibold text-black">Continuar em {Math.floor(resumePoint / 60)}:{String(Math.floor(resumePoint % 60)).padStart(2, "0")}</button><button type="button" onClick={() => { localStorage.removeItem(resumeStorageKey); setStartTime(0); setResumePoint(null); setAutoplayActivated(true); setRestartWithSoundSignal((value) => value + 1); }} className="min-h-11 rounded-full border border-white/30 px-5 text-[13px] font-semibold">Assistir do início</button></div></div></div>}
        {smartAutoplay && resumeChecked && !autoplayActivated && resumePoint === null && <button type="button" onClick={() => { setStartTime(0); setAutoplayActivated(true); setRestartWithSoundSignal((value) => value + 1); }} className="absolute left-1/2 top-1/2 z-30 w-[min(240px,80%)] -translate-x-1/2 -translate-y-1/2 border border-white/40 px-5 py-3 text-center text-[13px] font-semibold backdrop-blur-md" style={{ color: String(c.autoplayTextColor ?? "#ffffff"), backgroundColor: `${String(c.autoplayBackground ?? c.accent ?? "#0066cc")}e8`, borderRadius: `${Number(c.autoplayRadius ?? 12)}px` }}>{String(c.autoplayMessage || "Seu vídeo já começou. Clique para ouvir.")}</button>}
        {Boolean(c.smartProgress) && <div className="pointer-events-none absolute inset-x-0 bottom-0 z-30 bg-transparent" style={{ height: `${Math.max(Number(c.progressHeight ?? 6), 4)}px` }}><div className="h-full transition-[width] duration-300 ease-out" style={{ width: `${smartProgress}%`, backgroundColor: String(c.progressColor ?? c.accent ?? "#0066cc") }} /></div>}
        {Boolean(c.miniHooksEnabled) && currentTime >= Number(c.miniHookStart ?? 0) && currentTime < Number(c.miniHookStart ?? 0) + Number(c.miniHookDuration ?? 6) && <div className="pointer-events-none absolute inset-x-4 top-4 z-20 mx-auto max-w-[520px] px-4 py-3 font-semibold shadow-lg backdrop-blur-md" style={{ color: String(c.miniHookTextColor ?? "#ffffff"), backgroundColor: `${String(c.miniHookBackground ?? "#111111")}e8`, fontSize: `${Number(c.miniHookSize ?? 16)}px`, borderRadius: `${Number(c.miniHookRadius ?? 10)}px`, textAlign: String(c.miniHookAlign ?? "center") as CSSProperties["textAlign"] }}>{hookText}</div>}
        {thumbnailOverlay && <button type="button" onClick={() => { const paused = thumbnailOverlay === "pause"; setThumbnailOverlay(null); if (paused) setResumePlaybackSignal((value) => value + 1); else setRestartWithSoundSignal((value) => value + 1); }} className="absolute inset-0 z-50 bg-cover bg-center" style={{ backgroundImage: `url(${thumbnailOverlay === "pause" ? assetUrls.thumbnailPause : assetUrls.thumbnailEnd})` }} aria-label={thumbnailOverlay === "pause" ? "Continuar vídeo" : "Assistir novamente"}><span className="absolute inset-0 grid place-items-center bg-black/20"><span className="rounded-full bg-black/70 px-5 py-3 text-[13px] font-semibold text-white backdrop-blur-md">{thumbnailOverlay === "pause" ? "Continuar assistindo" : "Assistir novamente"}</span></span></button>}
      </div>
      {ctaVisible && safeCtaUrl && <a data-prisma-cta href={safeCtaUrl} target={Boolean(c.ctaNewTab) ? "_blank" : undefined} rel="noopener noreferrer" onClick={() => trackAnalytics("cta_click", 0, currentTime)} className={`prisma-embed-cta mx-auto mt-4 flex min-h-12 w-fit items-center justify-center font-semibold ${Boolean(c.ctaPulse) ? "studio-cta-pulse" : ""}`} style={{ color: String(c.ctaTextColor ?? "#ffffff"), backgroundColor: String(c.ctaBackground ?? c.accent ?? "#0066cc"), fontSize: `${Number(c.ctaFontSize ?? 18)}px`, borderRadius: `${Number(c.ctaRadius ?? 12)}px`, padding: `${Number(c.ctaPaddingY ?? 12)}px ${Number(c.ctaPaddingX ?? 24)}px`, boxShadow: Boolean(c.ctaShadow) ? "0 12px 28px rgba(0,102,204,.24)" : "none", "--cta-hover-bg": String(c.ctaHoverBackground ?? "#0055aa"), "--cta-hover-color": String(c.ctaHoverTextColor ?? "#ffffff") } as CSSProperties}>{String(c.ctaText ?? "Quero aproveitar agora")}</a>}
    </div>
  </main>;
}
