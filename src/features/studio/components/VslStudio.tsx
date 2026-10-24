"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  ArrowLeft,
  Captions,
  Clock3,
  FastForward,
  Gauge,
  Globe2,
  Heading,
  ImageIcon,
  Info,
  LockKeyhole,
  Maximize,
  MonitorPlay,
  MousePointerClick,
  Palette,
  PauseCircle,
  PictureInPicture2,
  Play,
  Plus,
  Radio,
  Rewind,
  RotateCcw,
  Shield,
  Sparkles,
  Subtitles,
  TimerReset,
  Trash2,
  Volume2,
  VolumeX,
  X,
  Zap,
} from "lucide-react";
import { Logo } from "@/components/logo";
import AdminSelect from "@/components/ui/custom/AdminSelect";
import { Button } from "@/components/ui/button";
import Dialog from "@/components/ui/Dialog";
import { resolveAutoplayCover } from "@/lib/player/autoplay-cover";
import { hookLiveViewersCount } from "@/lib/player/mini-hooks";
import { ToastSave } from "@/components/ui/toast-save";
import { VideoPlayer } from "@/features/player/components";
import AutoplayOverlay from "@/features/player/components/AutoplayOverlay";
import HeadlineBlock from "@/features/player/components/HeadlineBlock";
import { apiRequest, ApiError } from "@/services/http/client";
import PixelTrackingPanel, { type PixelTrackingFields } from "./PixelTrackingPanel";
import LearnModal, { type LearnModuleId } from "./LearnModal";

interface StoredVideo { id?: string; name: string; src: string; type: string }
type ModuleId = "style" | "progress" | "autoplay" | "turbo" | "headlines" | "hooks" | "traffic" | "actions" | "thumbnail" | "resume" | "pixels" | "captions" | "protection" | "playback";

export interface PresetCardItem {
  id: string;
  name: string;
  color: string;
  badge?: string;
  data: Record<string, unknown>;
}

interface StudioConfig extends PixelTrackingFields {
  accent: string; background: string; gradientEnd: string; colorStyle: "solid" | "gradient"; radius: number; bigPlay: boolean; playPause: boolean; disablePause: boolean; progressBar: boolean; time: boolean; seekBackward: boolean; seekForward: boolean; volume: boolean; fullscreen: boolean; pictureInPicture: boolean; speedControl: boolean;
  smartProgress: boolean; progressColor: string; progressHeight: number;
  smartAutoplay: boolean; autoplayMessage: string; autoplayTextColor: string; autoplayBackground: string; autoplayRadius: number;
  autoplayCoverType: "standard" | "gif" | "image"; autoplayGifUrl: string; autoplayImageUrl: string; autoplayTagBadge: string; autoplayAnimation: "pulse" | "sound_bars" | "cursor_click" | "play_glow"; autoplayOverlayOpacity: number;
  turboEnabled: boolean; turboMode: "automatic" | "manual"; turboMin: number; turboMax: number; playbackRate: number;
  headlineEnabled: boolean; headline: string; headlineVariants: string[]; headlineFormat: "text" | "image"; headlineDesktopName: string; headlineMobileName: string; headlineColor: string; headlineBackground: string; headlineSize: number; headlineAlign: "left" | "center" | "right"; headlineTagBadge: string; headlineStart: number; headlineDuration: number;
  trafficEnabled: boolean; domains: string[]; browserLanguage: string; allowedCountries: string; allowedDevices: string[]; blockVpn: boolean; urlKeyEnabled: boolean; accessToken: boolean;
  miniHooksEnabled: boolean; miniHookText: string; miniHookStart: number; miniHookDuration: number; miniHookTextColor: string; miniHookBackground: string; miniHookCounterColor: string; miniHookSize: number; miniHookRadius: number; miniHookAlign: "left" | "center" | "right"; miniHookType: "live_viewers" | "sound_indicator" | "fast_speed" | "geo" | "custom";
  ctaEnabled: boolean; ctaText: string; ctaSubtitle: string; ctaBadges: string; ctaUrl: string; ctaStart: number; ctaEnd: number; ctaNewTab: boolean; ctaPersist: boolean; ctaAutoScroll: boolean; ctaTextColor: string; ctaHoverTextColor: string; ctaBackground: string; ctaHoverBackground: string; ctaFontSize: number; ctaRadius: number; ctaPaddingY: number; ctaPaddingX: number; ctaPulse: boolean; ctaShadow: boolean; ctaPosition: "top" | "middle" | "bottom";
  thumbnailEnabled: boolean; resumeEnabled: boolean; resumeMessage: string;
  thumbnailStartName: string; thumbnailPauseName: string; thumbnailEndName: string;
  pixelsEnabled: boolean; pixelProvider: string; pixelName: string; pixelId: string; captionsEnabled: boolean; captionName: string;
  loop: boolean; muted: boolean; smartPause: boolean; fullscreenDesktop: boolean; fullscreenMobile: boolean; antiDownload: boolean; videoDuration: number; aspectRatio: number;

  // Watermark Settings
  watermarkEnabled: boolean;
  watermarkShowEmail: boolean;
  watermarkShowPhone: boolean;
  watermarkShowIp: boolean;
  watermarkShowUsername: boolean;
  watermarkShowDate: boolean;
  watermarkShowCustomText: boolean;
  watermarkCustomText: string;
  watermarkEmailText: string;
  watermarkPhoneText: string;
  watermarkType: "static" | "dynamic";
  watermarkPosition: "top-right" | "top-left" | "bottom-right" | "bottom-left" | "center";
  watermarkIntervalValue: number;
  watermarkIntervalUnit: "second" | "minute";
  watermarkOpacity: number;

  // Restrictions Settings
  limitConcurrentStreams: boolean;
  maxConcurrentStreams: number;
  domainWhitelistEnabled: boolean;
  domainWhitelist: string[];

  // DRM Settings
  drmHlsEnabled: boolean;
  drmSignedTokenEnabled: boolean;
  disableContextMenu: boolean;
  blockDevTools: boolean;

  assets: Record<string, string>;
}

const rates = [0.75, 1, 1.25, 1.5, 2];
const modules: Array<{ id: ModuleId; label: string; icon: typeof Palette; status?: keyof StudioConfig; badge?: string }> = [
  { id: "style", label: "Estilo", icon: Palette },
  { id: "progress", label: "Progresso inteligente", icon: Gauge, status: "smartProgress" },
  { id: "autoplay", label: "Smart Autoplay™", icon: Play, status: "smartAutoplay", badge: "A/B" },
  { id: "turbo", label: "Turbo", icon: Zap, status: "turboEnabled", badge: "Velocidade" },
  { id: "headlines", label: "Headlines", icon: Heading, status: "headlineEnabled" },
  { id: "hooks", label: "Mini-ganchos", icon: Zap, status: "miniHooksEnabled", badge: "Novo" },
  { id: "traffic", label: "Filtro de tráfego", icon: Shield, status: "trafficEnabled", badge: "Segurança" },
  { id: "actions", label: "Botões de ação", icon: MousePointerClick, status: "ctaEnabled" },
  { id: "thumbnail", label: "ThumbSniper", icon: ImageIcon, status: "thumbnailEnabled" },
  { id: "resume", label: "Continuar assistindo", icon: RotateCcw, status: "resumeEnabled" },
  { id: "pixels", label: "Pixels", icon: Radio, status: "pixelsEnabled" },
  { id: "captions", label: "Legendas", icon: Captions, status: "captionsEnabled" },
  { id: "protection", label: "Anti-download & DRM", icon: LockKeyhole, status: "antiDownload", badge: "Proteção" },
  { id: "playback", label: "Opções de reprodução", icon: TimerReset },
];

const defaultAutoplayPresetCards: PresetCardItem[] = [
  {
    id: "auto-1",
    name: "Smart Autoplay 1",
    color: "#0066cc",
    data: {
      autoplayCoverType: "standard",
      autoplayMessage: "Seu vídeo já começou. Clique para ouvir.",
      autoplayTagBadge: "🔴 AULÃO AO VIVO",
      autoplayTextColor: "#ffffff",
      autoplayBackground: "#0066cc",
      autoplayRadius: 16,
      autoplayAnimation: "pulse",
      autoplayOverlayOpacity: 85,
    },
  },
  {
    id: "auto-2",
    name: "Smart Autoplay 2",
    color: "#374151",
    data: {
      autoplayCoverType: "standard",
      autoplayMessage: "CLIQUE PARA OUVIR O ÁUDIO",
      autoplayTagBadge: "🔥 VÍDEO EXCLUSIVO",
      autoplayTextColor: "#ffffff",
      autoplayBackground: "#374151",
      autoplayRadius: 12,
      autoplayAnimation: "cursor_click",
      autoplayOverlayOpacity: 90,
    },
  },
  {
    id: "auto-3",
    name: "Smart Autoplay 3",
    color: "#B9FF66",
    badge: "Ativo",
    data: {
      autoplayCoverType: "standard",
      autoplayMessage: "ASSISTIR AULA AGORA COM SOM",
      autoplayTagBadge: "⚡ VAGAS LIMITADAS",
      autoplayTextColor: "#191A23",
      autoplayBackground: "#B9FF66",
      autoplayRadius: 16,
      autoplayAnimation: "pulse",
      autoplayOverlayOpacity: 95,
    },
  },
];

const defaultHeadlinePresetCards: PresetCardItem[] = [
  { id: "head-1", name: "Headline 1", color: "#0066cc", badge: "Ativo", data: { headline: "Descubra a maneira mais simples de transformar atenção em vendas", headlineTagBadge: "🔥 EXCLUSIVO", headlineColor: "#1d1d1f", headlineBackground: "#ffffff", headlineSize: 28, headlineAlign: "center" } },
  { id: "head-2", name: "Headline 2", color: "#B9FF66", data: { headline: "⚠️ ATENÇÃO: Esta apresentação sairá do ar em poucas horas", headlineTagBadge: "⚠️ URGENTE", headlineColor: "#191A23", headlineBackground: "#B9FF66", headlineSize: 30, headlineAlign: "center" } },
];

const defaultCtaPresetCards: PresetCardItem[] = [
  { id: "cta-1", name: "Botão 1", color: "#B9FF66", badge: "Ativo", data: { ctaText: "QUERO GARANTIR MINHA VAGA AGORA", ctaSubtitle: "🔒 Compra 100% Segura • Acesso Imediato", ctaBadges: "7 Dias de Garantia • Pix em 12x", ctaBackground: "#B9FF66", ctaTextColor: "#191A23", ctaHoverBackground: "#a6ee50", ctaPulse: true } },
  { id: "cta-2", name: "Botão 2", color: "#0066cc", data: { ctaText: "ACESSAR AGORA COM DESCONTO", ctaSubtitle: "🔒 Garantia de 7 dias • Suporte 24h", ctaBadges: "50% OFF • Pix em 12x", ctaBackground: "#0066cc", ctaTextColor: "#ffffff", ctaHoverBackground: "#0052a3", ctaPulse: false } },
  { id: "cta-3", name: "Botão 3", color: "#ef4444", data: { ctaText: "GARANTIR MINHA VAGA", ctaSubtitle: "⚡ Vagas limitadas • Acesso imediato", ctaBadges: "Bônus exclusivo • 7 dias", ctaBackground: "#ef4444", ctaTextColor: "#ffffff", ctaHoverBackground: "#dc2626", ctaPulse: true } },
];

const defaultHookPresetCards: PresetCardItem[] = [
  { id: "hook-1", name: "Gancho 1", color: "#B9FF66", badge: "Ativo", data: { miniHookText: "Continue assistindo - a parte mais importante está chegando.", miniHookStart: 30, miniHookDuration: 6, miniHookTextColor: "#ffffff", miniHookBackground: "#111111", miniHookCounterColor: "#ff3b30", miniHookSize: 16, miniHookRadius: 10, miniHookAlign: "center", miniHookType: "custom" } },
  { id: "hook-2", name: "Gancho 2", color: "#0066cc", data: { miniHookText: "🔴 AO VIVO: Não perca o que vem a seguir!", miniHookStart: 60, miniHookDuration: 8, miniHookTextColor: "#ffffff", miniHookBackground: "#0066cc", miniHookCounterColor: "#B9FF66", miniHookSize: 16, miniHookRadius: 10, miniHookAlign: "left", miniHookType: "live_viewers" } },
  { id: "hook-3", name: "Gancho 3", color: "#ef4444", data: { miniHookText: "⚡ VELOCIDADE 2x ATIVADA - Acelere seu aprendizado", miniHookStart: 120, miniHookDuration: 5, miniHookTextColor: "#ffffff", miniHookBackground: "#ef4444", miniHookCounterColor: "#ffffff", miniHookSize: 16, miniHookRadius: 10, miniHookAlign: "right", miniHookType: "fast_speed" } },
];

const defaultThumbnailPresetCards: PresetCardItem[] = [
  { id: "thumb-1", name: "Thumbnail Padrão", color: "#B9FF66", badge: "Ativo", data: { thumbnailEnabled: true, thumbnailStartName: "thumb_start.jpg", thumbnailPauseName: "thumb_pause.jpg", thumbnailEndName: "thumb_end.jpg" } },
];

export type MiniHookType = "live_viewers" | "sound_indicator" | "fast_speed" | "geo" | "custom";

/** Rótulos em linguagem natural + ícone + explicação de cada tipo de gancho. */
const HOOK_TYPE_META: Record<MiniHookType, { label: string; hint: string }> = {
  live_viewers: { label: "Pessoas assistindo", hint: "Mostra seu texto com o número de pessoas assistindo agora. Ideal para prova social no meio do vídeo." },
  sound_indicator: { label: "Alerta de som", hint: "Mostra seu texto com destaque de som. Ideal para pedir que o espectador ative o áudio." },
  fast_speed: { label: "Selo de velocidade", hint: "Mostra seu texto com destaque de velocidade. Ideal para vídeos acelerados ou trechos rápidos." },
  geo: { label: "Localização", hint: "Mostra seu texto com destaque de localização. Ideal para ofertas regionais ou eventos presenciais." },
  custom: { label: "Texto livre", hint: "Mostra exatamente o texto que você escrever." },
};

const initialConfig: StudioConfig = {
  metaCapiToken: "",
  accent: "#0066cc", background: "#000000", gradientEnd: "#2997ff", colorStyle: "solid", radius: 0, bigPlay: true, playPause: true, disablePause: false, progressBar: true, time: true, seekBackward: false, seekForward: false, volume: true, fullscreen: true, pictureInPicture: true, speedControl: true,
  smartProgress: true, progressColor: "#0066cc", progressHeight: 6,
  smartAutoplay: true, autoplayMessage: "Seu vídeo já começou. Clique para ouvir.", autoplayTextColor: "#191A23", autoplayBackground: "#B9FF66", autoplayRadius: 16,
  autoplayCoverType: "standard", autoplayGifUrl: "", autoplayImageUrl: "", autoplayTagBadge: "🔴 AULÃO AO VIVO", autoplayAnimation: "pulse", autoplayOverlayOpacity: 90,
  turboEnabled: true, turboMode: "manual", turboMin: 1, turboMax: 1.2, playbackRate: 1,
  headlineEnabled: true, headline: "Descubra a maneira mais simples de transformar atenção em vendas", headlineVariants: [], headlineFormat: "text", headlineDesktopName: "", headlineMobileName: "", headlineColor: "#1d1d1f", headlineBackground: "#ffffff", headlineSize: 30, headlineAlign: "center", headlineTagBadge: "🔥 EXCLUSIVO", headlineStart: 0, headlineDuration: 0,
  trafficEnabled: false, domains: [], browserLanguage: "Todos", allowedCountries: "Todos", allowedDevices: ["desktop", "mobile", "tablet"], blockVpn: true, urlKeyEnabled: false, accessToken: false,
  miniHooksEnabled: false, miniHookText: "Continue assistindo - a parte mais importante está chegando.", miniHookStart: 30, miniHookDuration: 6, miniHookTextColor: "#ffffff", miniHookBackground: "#111111", miniHookCounterColor: "#ff3b30", miniHookSize: 16, miniHookRadius: 10, miniHookAlign: "center", miniHookType: "custom",
  ctaEnabled: false, ctaText: "Quero aproveitar agora", ctaSubtitle: "🔒 Compra 100% Segura • Entrega Imediata", ctaBadges: "7 Dias de Garantia • Pix em 12x", ctaUrl: "https://", ctaStart: 60, ctaEnd: 0, ctaNewTab: true, ctaPersist: true, ctaAutoScroll: false, ctaTextColor: "#191A23", ctaHoverTextColor: "#191A23", ctaBackground: "#B9FF66", ctaHoverBackground: "#a6ee50", ctaFontSize: 18, ctaRadius: 12, ctaPaddingY: 12, ctaPaddingX: 24, ctaPulse: false, ctaShadow: true, ctaPosition: "bottom",
  thumbnailEnabled: false, resumeEnabled: true, resumeMessage: "Você já começou a assistir este vídeo",
  thumbnailStartName: "", thumbnailPauseName: "", thumbnailEndName: "",
  pixelsEnabled: false, pixelProvider: "Meta", pixelName: "", pixelId: "", metaPixelEnabled: false, metaPixelId: "", googlePixelEnabled: false, googleTagId: "", googleConversionDestination: "", tiktokPixelEnabled: false, tiktokPixelId: "", pixelConsentMode: "banner", pixelConsentTitle: "Sua privacidade importa", pixelConsentDescription: "Usamos tecnologias de publicidade para medir resultados e melhorar sua experiência.", pixelConsentAcceptLabel: "Aceitar", pixelConsentRejectLabel: "Recusar", pixelPrivacyUrl: "", captionsEnabled: false, captionName: "",
  loop: false, muted: false, smartPause: true, fullscreenDesktop: true, fullscreenMobile: true, antiDownload: true, videoDuration: 0, aspectRatio: 16 / 9,

  // Watermark Defaults
  watermarkEnabled: true,
  watermarkShowEmail: true,
  watermarkShowPhone: true,
  watermarkShowIp: true,
  watermarkShowUsername: true,
  watermarkShowDate: true,
  watermarkShowCustomText: true,
  watermarkCustomText: "Sample Custom Text",
  watermarkEmailText: "",
  watermarkPhoneText: "",
  watermarkType: "static",
  watermarkPosition: "top-right",
  watermarkIntervalValue: 10,
  watermarkIntervalUnit: "second",
  watermarkOpacity: 85,

  // Restrictions Defaults
  limitConcurrentStreams: true,
  maxConcurrentStreams: 5,
  domainWhitelistEnabled: false,
  domainWhitelist: [],

  // DRM Defaults
  drmHlsEnabled: true,
  drmSignedTokenEnabled: true,
  disableContextMenu: true,
  blockDevTools: true,

  assets: {},
};

const playerConfigSaveErrors: Record<string, string> = {
  invalid_payload: "Os dados do player são inválidos. Revise as configurações e tente novamente.",
  config_too_large: "A configuração excede o tamanho máximo permitido.",
  invalid_config_key: "A configuração contém chaves não suportadas. Recarregue a página e salve novamente.",
  invalid_pixel_config: "A configuração de pixels informada é inválida.",
  video_not_found: "O vídeo não foi encontrado. Recarregue a página e tente novamente.",
  config_save_failed: "Não foi possível salvar a configuração. Tente novamente em instantes.",
};

interface PlayerConfigResponse {
  playerConfig: { id: string; config: Partial<StudioConfig> | null; allowed_domains: string[] | null; published: boolean; updated_at: string } | null;
}

export default function VslStudio() {
  const router = useRouter();
  const [video] = useState<StoredVideo | null>(() => { if (typeof window === "undefined") return null; try { return JSON.parse(sessionStorage.getItem("prisma-mvp-video") ?? "null") as StoredVideo | null; } catch { return null; } });
  const [active, setActiveState] = useState<ModuleId | null>("autoplay");
  const [config, setConfig] = useState<StudioConfig>(() => {
    if (typeof window === "undefined") return initialConfig;
    if (video?.id) return initialConfig;
    try { return { ...initialConfig, ...JSON.parse(localStorage.getItem("prisma-studio-config") ?? "{}") as Partial<StudioConfig> }; }
    catch { return initialConfig; }
  });

  // Presets States
  const [autoplayPresets, setAutoplayPresets] = useState<PresetCardItem[]>(defaultAutoplayPresetCards);
  const [activeAutoplayIndex, setActiveAutoplayIndex] = useState(2);
  const [templateModalOpen, setTemplateModalOpen] = useState(false);
  const [learnModule, setLearnModule] = useState<LearnModuleId | null>(null);

  const [headlinePresets, setHeadlinePresets] = useState<PresetCardItem[]>(defaultHeadlinePresetCards);
  const [activeHeadlineIndex, setActiveHeadlineIndex] = useState(0);

  const [ctaPresets, setCtaPresets] = useState<PresetCardItem[]>(defaultCtaPresetCards);
  const [activeCtaIndex, setActiveCtaIndex] = useState(0);

  const [hookPresets, setHookPresets] = useState<PresetCardItem[]>(defaultHookPresetCards);
  const [activeHookIndex, setActiveHookIndex] = useState(0);

  const [thumbnailPresets, setThumbnailPresets] = useState<PresetCardItem[]>(defaultThumbnailPresetCards);
  const [activeThumbnailIndex, setActiveThumbnailIndex] = useState(0);

  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [videoSize, setVideoSize] = useState({ width: 16, height: 9 });
  const [startTime, setStartTime] = useState(0);
  const [resumePoint, setResumePoint] = useState<number | null>(null);
  const [autoplayActivated, setAutoplayActivated] = useState(false);
  const [restartWithSoundSignal, setRestartWithSoundSignal] = useState(0);
  const [resumePlaybackSignal, setResumePlaybackSignal] = useState(0);
  const [saved, setSaved] = useState(true);
  const [saving, setSaving] = useState(false);
  const [discarding, setDiscarding] = useState(false);
  const [discardOpen, setDiscardOpen] = useState(false);
  const loadSeq = useRef(0);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [playerId, setPlayerId] = useState<string>();
  const [posterUrl, setPosterUrl] = useState<string>();
  const [pausePosterUrl, setPausePosterUrl] = useState<string>();
  const [endPosterUrl, setEndPosterUrl] = useState<string>();
  const [headlineDesktopUrl, setHeadlineDesktopUrl] = useState<string>();
  const [headlineMobileUrl, setHeadlineMobileUrl] = useState<string>();
  const [thumbnailOverlay, setThumbnailOverlay] = useState<"pause" | "end" | null>(null);
  const autoplayCover = resolveAutoplayCover(config as unknown as Record<string, unknown>);
  const [posterPreviewActive, setPosterPreviewActive] = useState(false);
  const [captionTrack, setCaptionTrack] = useState<{ src: string; kind: "subtitles"; label: string; srclang: string; default: boolean }>();
  const [slowFileWarn, setSlowFileWarn] = useState(false);
  const probedSrcRef = useRef<string | null>(null);
  const previewStageRef = useRef<HTMLDivElement>(null);
  const [previewStageSize, setPreviewStageSize] = useState({ width: 0, height: 0 });
  const dirtyConfigKeys = useRef(new Set<keyof StudioConfig>());

  const update = <K extends keyof StudioConfig>(key: K, value: StudioConfig[K]) => {
    dirtyConfigKeys.current.add(key);
    setSaved(false);
    setConfig((current) => {
      const next = { ...current, [key]: value };
      // Update active preset card color if autoplay background changes
      if (key === "autoplayBackground" && active === "autoplay") {
        setAutoplayPresets((prev) =>
          prev.map((item, idx) => (idx === activeAutoplayIndex ? { ...item, color: String(value) } : item))
        );
      }
      return next;
    });
  };

  const applyPresetData = (data: Record<string, unknown>) => {
    Object.entries(data).forEach(([key, val]) => {
      update(key as keyof StudioConfig, val as StudioConfig[keyof StudioConfig]);
    });
  };

  const loadConfig = useCallback(async () => {
    const id = video?.id;
    if (!id) return false;
    const seq = ++loadSeq.current;
    setLoadError(null);
    try {
      const payload = await apiRequest<PlayerConfigResponse>(`/api/player-configs?videoId=${encodeURIComponent(id)}` as `/${string}`, { cache: "no-store" });
      if (seq !== loadSeq.current) return false;
      if (payload.playerConfig?.id) setPlayerId(payload.playerConfig.id);
      const savedCfg = payload.playerConfig?.config;
      setConfig(savedCfg && typeof savedCfg === "object" ? { ...initialConfig, ...savedCfg } : initialConfig);
      dirtyConfigKeys.current.clear();
      setSaved(true);
      // Resolve as capas/legendas salvas para a prévia (URLs assinadas de 1h).
      const savedAssets = (savedCfg && typeof savedCfg === "object" ? (savedCfg as Partial<StudioConfig>).assets : undefined) as Record<string, string> | undefined;
      if (savedAssets && Object.keys(savedAssets).length > 0) {
        try {
          const signed = await apiRequest<{ signedUrls?: Record<string, string> }>("/api/studio/asset-sign", { method: "POST", body: { videoId: id, assets: savedAssets } });
          if (seq !== loadSeq.current) return false;
          const urls = signed.signedUrls ?? {};
          if (urls.thumbnailStart) setPosterUrl(urls.thumbnailStart);
          if (urls.thumbnailPause) setPausePosterUrl(urls.thumbnailPause);
          if (urls.thumbnailEnd) setEndPosterUrl(urls.thumbnailEnd);
          if (urls.captions) setCaptionTrack({ src: urls.captions, kind: "subtitles", label: "Legendas", srclang: "pt-BR", default: true });
        } catch {
          // Prévia segue sem as capas salvas; o player publicado não é afetado.
        }
      }
      return true;
    } catch {
      if (seq !== loadSeq.current) return false;
      setLoadError("Não foi possível carregar a configuração salva deste player.");
      return false;
    }
  }, [video?.id]);

  useEffect(() => {
    // loadConfig seta estado no corpo: deferido (padrão 98f6b87) evita a
    // cascata síncrona de renders no mount/troca de VSL.
    const load = setTimeout(() => void loadConfig(), 0);
    return () => clearTimeout(load);
  }, [loadConfig]);

  // Trocar de VSL zera a reprodução e oferece retomada se houver ponto salvo.
  // setState síncrono no effect dispara cascata de renders (lint
  // react-compiler): deferido para a próxima macrotask (padrão 98f6b87).
  useEffect(() => {
    const reset = setTimeout(() => {
      setStartTime(0);
      setCurrentTime(0);
      setResumePoint(null);
      setAutoplayActivated(false);
      setThumbnailOverlay(null);
      setSlowFileWarn(false);
      probedSrcRef.current = null;
      if (video?.id) {
        try {
          const raw = localStorage.getItem(`prisma-resume:${video.id}`);
          const point = raw ? Math.floor(Number(raw)) : NaN;
          if (Number.isFinite(point) && point > 5) setResumePoint(point);
        } catch {
          // Sem retomada salva.
        }
      }
    }, 0);
    return () => clearTimeout(reset);
  }, [video?.id]);

  // Diagnóstico de startup lento: avisa quando o MP4 não tem faststart.
  useEffect(() => {
    const src = video?.src;
    if (!src || probedSrcRef.current === src) return;
    probedSrcRef.current = src;
    void probeMoovPosition(src).then((result) => {
      if (result === "late" && probedSrcRef.current === src) setSlowFileWarn(true);
    });
  }, [video?.src]);

  useEffect(() => {
    const stage = previewStageRef.current;
    if (!stage) return;
    const observer = new ResizeObserver(([entry]) => {
      const width = Math.floor(entry.contentRect.width);
      const height = Math.floor(entry.contentRect.height);
      setPreviewStageSize((current) => current.width === width && current.height === height ? current : { width, height });
    });
    observer.observe(stage);
    return () => observer.disconnect();
  }, []);

  const sources = useMemo(() => video ? [{ src: video.src, type: video.type }] : [], [video]);
  // Tamanho padrão: largura cheia + proporção real do arquivo (sem corte, sem
  // encolher). Fundo do Estilo só quando customizado (senão, transparente como antes).
  const playerStyle = useMemo(() => {
    const isGradient = config.colorStyle === "gradient";
    const customBg = isGradient || (config.background && config.background.toLowerCase() !== "#000000" && config.background.toLowerCase() !== "#000");
    return { borderRadius: `${config.radius}px`, aspectRatio: `${videoSize.width} / ${videoSize.height}`, "--player-accent": String(config.progressColor ?? config.accent ?? "#0066cc"), ...(customBg ? { background: isGradient ? `linear-gradient(135deg, ${config.background}, ${config.gradientEnd})` : config.background } : {}) } as React.CSSProperties;
  }, [config.radius, config.background, config.gradientEnd, config.colorStyle, config.progressColor, config.accent, videoSize]);

  const handleMetadata = (meta: { duration: number; width: number; height: number }) => {
    setDuration(meta.duration);
    if (meta.width > 0 && meta.height > 0) setVideoSize({ width: meta.width, height: meta.height });
    // Duração real alimenta os sliders de tempo (ganchos, CTA, headlines).
    // Sem marcar como sujo: é dado do arquivo, não edição do usuário.
    const floored = Math.floor(meta.duration);
    if (Number.isFinite(floored) && floored > 0) {
      setConfig((current) => (current.videoDuration === floored ? current : { ...current, videoDuration: floored }));
    }
  };

  const handleTimeUpdate = (time: number) => {
    setCurrentTime(time);
  };

  const setActive = (id: ModuleId | null) => {
    setActiveState(id);
    if (id === "autoplay") setAutoplayActivated(false);
  };

  const handlePoster = (file: File, kind: "start" | "pause" | "end") => {
    const url = URL.createObjectURL(file);
    if (kind === "start") setPosterUrl(url);
    else if (kind === "pause") setPausePosterUrl(url);
    else setEndPosterUrl(url);
    // Sobe o arquivo para o servidor para valer no player publicado;
    // a prévia local (object URL) aparece na hora, sem esperar o upload.
    const assetKind = kind === "start" ? "thumbnailStart" : kind === "pause" ? "thumbnailPause" : "thumbnailEnd";
    void uploadAsset(file, assetKind);
  };

  const handleCaption = (file: File) => {
    const url = URL.createObjectURL(file);
    setCaptionTrack({ src: url, kind: "subtitles", label: config.captionName || "Legendas", srclang: "pt-BR", default: true });
    void uploadAsset(file, "captions");
  };

  const updateAssets = (kind: string, path: string) => {
    dirtyConfigKeys.current.add("assets");
    setSaved(false);
    setConfig((current) => ({ ...current, assets: { ...current.assets, [kind]: path } }));
  };

  const uploadAsset = async (file: File, kind: "thumbnailStart" | "thumbnailPause" | "thumbnailEnd" | "captions") => {
    const id = video?.id;
    if (!id) return;
    try {
      const form = new FormData();
      form.set("videoId", id);
      form.set("kind", kind);
      form.set("file", file);
      const response = await fetch("/api/studio/asset-upload", { method: "POST", credentials: "same-origin", body: form });
      const payload = await response.json().catch(() => null) as { path?: string; error?: string } | null;
      if (!response.ok || !payload?.path) throw new Error(payload?.error ?? "upload_failed");
      updateAssets(kind, payload.path);
    } catch {
      setSaveError("Não foi possível enviar o arquivo para o servidor. A prévia local continua valendo.");
    }
  };

  const saveConfig = async () => {
    const id = video?.id;
    setSaving(true);
    setSaveError(null);
    setLoadError(null);
    try {
      if (id) {
        const response = await apiRequest<PlayerConfigResponse>("/api/player-configs", {
          method: "PUT",
          body: { videoId: id, config, domains: config.domainWhitelistEnabled ? config.domainWhitelist : [] },
        });
        if (response.playerConfig?.id) setPlayerId(response.playerConfig.id);
      } else {
        localStorage.setItem("prisma-studio-config", JSON.stringify(config));
      }
      setSaved(true);
      dirtyConfigKeys.current.clear();
    } catch (error) {
      if (error instanceof ApiError) {
        setSaveError(playerConfigSaveErrors[error.code] ?? error.message);
      } else {
        setSaveError("Não foi possível salvar a configuração. Tente novamente.");
      }
    } finally {
      setSaving(false);
    }
  };

  // Descartar = voltar ao que está salvo no servidor, sem tocar no banco.
  const discardConfig = async () => {
    if (discarding) return;
    setDiscarding(true);
    setSaveError(null);
    try {
      await loadConfig();
    } finally {
      setDiscarding(false);
      setDiscardOpen(false);
    }
  };

  // Add Template Selection Function
  const addAutoplayTemplate = (templateIndex: number) => {
    const templates = [
      { name: "Smart Autoplay 4", color: "#0066cc", bg: "#0066cc", text: "#ffffff", msg: "Seu vídeo já começou. Clique para ouvir.", badge: "🔴 AO VIVO" },
      { name: "Smart Autoplay 5", color: "#0066cc", bg: "#0066cc", text: "#ffffff", msg: "Clique para ouvir", badge: "🔊 ÁUDIO" },
      { name: "Smart Autoplay 6", color: "#191A23", bg: "#191A23", text: "#ffffff", msg: "CLIQUE PARA OUVIR", badge: "🔥 EXCLUSIVO" },
      { name: "Smart Autoplay 7", color: "#0066cc", bg: "#0066cc", text: "#ffffff", msg: "Seu vídeo já começou", badge: "⚡ NOVO" },
      { name: "Smart Autoplay 8", color: "#ef4444", bg: "#ef4444", text: "#ffffff", msg: "Clique para ouvir", badge: "⚠️ URGENTE" },
      { name: "Smart Autoplay 9", color: "#B9FF66", bg: "#B9FF66", text: "#191A23", msg: "ASSISTIR AULA AGORA", badge: "🟢 HERO" },
    ];
    const t = templates[templateIndex % templates.length];
    const newCard: PresetCardItem = {
      // ID determinístico baseado no comprimento atual dos presets; usado como React key.
      id: `auto-${autoplayPresets.length + 1}`,
      name: t.name,
      color: t.color,
      badge: "Ativo",
      data: {
        autoplayCoverType: "standard",
        autoplayMessage: t.msg,
        autoplayTagBadge: t.badge,
        autoplayTextColor: t.text,
        autoplayBackground: t.bg,
        autoplayRadius: 16,
        autoplayAnimation: "pulse",
      },
    };
    setAutoplayPresets((prev) => [...prev.map((p) => ({ ...p, badge: undefined as string | undefined })), newCard]);
    setActiveAutoplayIndex(autoplayPresets.length);
    applyPresetData(newCard.data);
    setTemplateModalOpen(false);
  };

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-white text-[#1d1d1f] dark:bg-card dark:text-white">
      {/* Top Header with New Official Logo */}
      <header className="flex h-14 shrink-0 items-center justify-between border-b border-black/10 px-4 dark:border-white/10">
        <div className="flex items-center gap-3">
          <Link href="/dashboard/videos" className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-100 dark:bg-card text-slate-700 dark:text-zinc-300 hover:bg-[#B9FF66]/10 hover:text-[#191A23] dark:hover:text-white">
            <ArrowLeft size={16} />
          </Link>
          <div className="flex items-center gap-2">
            <Logo />
            <span className="text-xs font-bold text-[#191A23] dark:text-white">• Estúdio VSL</span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {(saveError || loadError) && (
            <span role="alert" className="max-w-64 truncate text-[11px] font-bold text-red-600 dark:text-red-400">
              {saveError ?? loadError}
            </span>
          )}
          <ToastSave
            state={saving || discarding ? "loading" : saved ? "success" : "initial"}
            onSave={() => void saveConfig()}
            onReset={() => setDiscardOpen(true)}
            loadingText={discarding ? "Descartando" : "Salvando"}
            successText="Tudo salvo"
            initialText="Alterações não salvas"
            saveText="Salvar Player"
          />
          <Dialog
            open={discardOpen}
            onClose={() => { if (!discarding) setDiscardOpen(false); }}
            title="Descartar alterações"
            footer={<>
              <Button type="button" variant="outline" onClick={() => setDiscardOpen(false)} disabled={discarding}>Continuar editando</Button>
              <Button type="button" onClick={() => void discardConfig()} disabled={discarding}>Descartar alterações</Button>
            </>}
          >
            <p className="text-sm leading-6 themeable-text-ink-muted-48">As edições não salvas serão perdidas e o estúdio volta ao último estado salvo no servidor. Nada é apagado do banco.</p>
          </Dialog>
        </div>
      </header>

      {/* Main 3-Column Studio Workspace: Left Sidebar (Modules), Center Canvas (Video), Right Sidebar (Customization & Presets) */}
      <div className="grid flex-1 min-h-0 grid-cols-1 overflow-hidden lg:grid-cols-[240px_minmax(0,1fr)_380px]">
        {/* LEFT COLUMN: Modules Selection Drawer */}
        <aside className="order-1 flex min-h-0 min-w-0 flex-col border-r border-black/10 bg-[#fafafa] dark:border-white/10 dark:bg-card">
          <div className="p-3.5 text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-zinc-500 border-b border-black/5 dark:border-white/5">
            Módulos do Player
          </div>
          <div className="flex-1 overflow-y-auto overscroll-contain p-2 space-y-1">
            {modules.map((item) => {
              const isSelected = active === item.id;
              const IconComp = item.icon;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setActive(item.id)}
                  className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-xs font-semibold transition-all cursor-pointer ${
                    isSelected
                      ? "bg-[#B9FF66] text-[#191A23] font-bold shadow-xs"
                      : "text-slate-700 dark:text-zinc-300 hover:bg-[#B9FF66]/10 hover:text-[#191A23] dark:hover:text-white"
                  }`}
                >
                  <IconComp size={16} />
                  <span className="flex-1 text-left">{item.label}</span>
                  {item.badge && (
                    <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold ${isSelected ? "bg-[#191A23] text-[#B9FF66]" : "bg-slate-200 dark:bg-card text-slate-700 dark:text-zinc-300"}`}>
                      {item.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </aside>

        {/* CENTER COLUMN: Live Player Preview Stage (Main Stage) */}
        <main className="order-2 flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-[#f5f5f7] dark:bg-black p-4 sm:p-6">
          <div className="mb-3 flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 dark:text-zinc-400 flex items-center gap-1.5">
              <Sparkles size={14} className="text-[#B9FF66]" /> Prévia em Tempo Real
            </span>
            <span className="rounded-full bg-slate-200 dark:bg-card px-3 py-0.5 text-xs font-bold text-slate-700 dark:text-zinc-300">
              {config.playbackRate.toFixed(2)}x
            </span>
          </div>

          <div ref={previewStageRef} className="flex-1 flex flex-col items-center overflow-y-auto overscroll-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {/* m-auto centraliza quando o conteúdo é curto e libera o scroll completo quando é alto (justify-center cortava o topo). */}
            <div className="m-auto flex w-full flex-col items-center">
            {slowFileWarn && (
              <div role="alert" className="mb-3 flex w-full max-w-3xl items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs font-medium leading-relaxed text-amber-700 dark:text-amber-300">
                <span className="flex-1">Este arquivo demora para iniciar: não está otimizado para streaming (faststart). Re-exporte com “faststart”/“Web Optimized” para abrir instantâneo.</span>
                <button type="button" onClick={() => setSlowFileWarn(false)} aria-label="Dispensar aviso" className="grid size-6 shrink-0 place-items-center rounded-lg hover:bg-black/5 dark:hover:bg-transparent cursor-pointer">✕</button>
              </div>
            )}
            {/* Headline Preview (obedece horário configurado; mesmo componente do publicado) */}
            {config.headlineEnabled && currentTime >= Number(config.headlineStart ?? 0) && (Number(config.headlineDuration ?? 0) <= 0 || currentTime <= Number(config.headlineStart ?? 0) + Number(config.headlineDuration ?? 0)) && (
              <HeadlineBlock
                tagBadge={config.headlineTagBadge}
                headline={config.headline || "Digite sua headline"}
                color={config.headlineColor}
                background={config.headlineBackground}
                fontSize={config.headlineSize}
                align={config.headlineAlign}
                playerRadius={config.radius}
                format={config.headlineFormat}
                desktopUrl={headlineDesktopUrl}
                mobileUrl={headlineMobileUrl}
              />
            )}

            {/* Video Canvas Container */}
            <div className="relative order-2 w-full max-w-3xl overflow-hidden shadow-2xl rounded-2xl bg-black" style={playerStyle}>
              {video ? (
                <VideoPlayer
                  key={`${posterUrl ?? "video"}-${config.smartAutoplay}`}
                  className="w-full"
                  sources={sources}
                  poster={config.thumbnailEnabled && posterUrl ? posterUrl : undefined}
                  textTracks={config.captionsEnabled && captionTrack ? [captionTrack] : []}
                  autoplay={config.smartAutoplay && resumePoint === null && !posterPreviewActive}
                  muted={config.muted || (config.smartAutoplay && !autoplayActivated)}
                  controls
                  playbackRate={config.playbackRate}
                  playbackRates={rates}
                  loop={config.loop}
                  bigPlayButton={config.bigPlay}
                  pauseWhenHidden={config.smartPause}
                  startTime={startTime}
                  restartWithSoundSignal={restartWithSoundSignal}
                  resumePlaybackSignal={resumePlaybackSignal}
                  onLoadedMetadata={handleMetadata}
                  onTimeUpdate={handleTimeUpdate}
                  onPlay={() => setThumbnailOverlay(null)}
                  onPause={() => { if (config.thumbnailEnabled && pausePosterUrl) setThumbnailOverlay("pause"); }}
                  onEnded={() => { if (config.thumbnailEnabled && endPosterUrl && !config.loop) setThumbnailOverlay("end"); }}
                />
              ) : (
                <div className="flex aspect-video w-full items-center justify-center text-center text-slate-400">
                  <div>
                    <Play size={40} className="mx-auto mb-2 text-[#B9FF66]" />
                    <p className="text-xs font-semibold">Selecione uma VSL para visualizar o player</p>
                  </div>
                </div>
              )}

              {/* Watermark Overlay Preview */}
              {config.watermarkEnabled && (
                <div
                  className={`pointer-events-none absolute z-40 p-3 font-mono text-[11px] leading-tight select-none ${
                    config.watermarkPosition === "top-left"
                      ? "top-3 left-3 text-left"
                      : config.watermarkPosition === "bottom-left"
                      ? "bottom-3 left-3 text-left"
                      : config.watermarkPosition === "bottom-right"
                      ? "bottom-3 right-3 text-right"
                      : config.watermarkPosition === "center"
                      ? "top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-center"
                      : "top-3 right-3 text-right"
                  }`}
                  style={{
                    color: "rgba(255,255,255,0.9)",
                    textShadow: "0 1px 3px rgba(0,0,0,0.8)",
                    opacity: config.watermarkOpacity / 100,
                  }}
                >
                  {config.watermarkShowEmail && <div>john.doe@example.com</div>}
                  {config.watermarkShowPhone && <div>+1-128-456-789</div>}
                  {config.watermarkShowIp && <div>192.168.1.101</div>}
                  {config.watermarkShowUsername && <div>John Doe</div>}
                  {config.watermarkShowDate && <div>{new Date().toLocaleDateString("en-US", { month: "short", day: "2-digit", year: "numeric" })}</div>}
                  {config.watermarkShowCustomText && config.watermarkCustomText && <div>{config.watermarkCustomText}</div>}
                </div>
              )}

              {/* Smart Autoplay Overlay Preview (mesmo componente do player publicado) */}
              {config.smartAutoplay && !autoplayActivated && (
                <AutoplayOverlay
                  message={config.autoplayMessage}
                  textColor={config.autoplayTextColor}
                  background={config.autoplayBackground}
                  radius={config.autoplayRadius}
                  tagBadge={config.autoplayTagBadge}
                  coverUrl={autoplayCover.type !== "standard" ? autoplayCover.url : posterUrl ?? null}
                  overlayOpacity={config.autoplayOverlayOpacity}
                  animClass={config.autoplayAnimation === "pulse" ? "animate-pulse" : config.autoplayAnimation === "sound_bars" ? "studio-autoplay-sound" : config.autoplayAnimation === "cursor_click" ? "studio-autoplay-click" : config.autoplayAnimation === "play_glow" ? "studio-autoplay-glow" : ""}
                  onActivate={() => {
                    setStartTime(0);
                    setAutoplayActivated(true);
                    setRestartWithSoundSignal((prev) => prev + 1);
                  }}
                />
              )}

              {/* Mini-Gancho Preview em tempo real (segue o currentTime do player) */}
              {config.miniHooksEnabled && currentTime >= Number(config.miniHookStart ?? 0) && currentTime < Number(config.miniHookStart ?? 0) + Number(config.miniHookDuration ?? 6) && (() => {
                const hookRemaining = Math.max(0, Math.ceil(Number(config.miniHookStart ?? 0) + Number(config.miniHookDuration ?? 6) - currentTime));
                const hookPreviewText = String(config.miniHookText || "Continue assistindo").replace("{mm:ss}", `${Math.floor(hookRemaining / 60)}:${String(hookRemaining % 60).padStart(2, "0")}`);
                return (
                  <div className="pointer-events-none absolute inset-x-4 top-4 z-20 mx-auto max-w-[520px] px-4 py-3 font-semibold shadow-md backdrop-blur-md" style={{ color: String(config.miniHookTextColor ?? "#ffffff"), backgroundColor: `${String(config.miniHookBackground ?? "#111111")}e8`, fontSize: `${Number(config.miniHookSize ?? 16)}px`, borderRadius: `${Number(config.miniHookRadius ?? 10)}px`, textAlign: String(config.miniHookAlign ?? "center") as React.CSSProperties["textAlign"] }}>
                    {hookPreviewText}
                    {config.miniHookType === "live_viewers" && (
                      <span className="ml-1.5 font-extrabold" style={{ color: String(config.miniHookCounterColor ?? "#ff3b30") }}>
                        {hookLiveViewersCount(video?.id ?? "preview")} assistindo
                      </span>
                    )}
                  </div>
                );
              })()}

              {/* Continuar assistindo (retomada salva deste vídeo) */}
              {config.resumeEnabled && resumePoint !== null && (
                <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/75 p-5 text-center text-white backdrop-blur-sm">
                  <div>
                    <p className="mb-4 text-[16px] font-semibold">{config.resumeMessage || "Você já começou a assistir este vídeo"}</p>
                    <div className="flex flex-wrap justify-center gap-2">
                      <button
                        type="button"
                        onClick={() => { setStartTime(resumePoint); setResumePoint(null); setAutoplayActivated(true); setResumePlaybackSignal((prev) => prev + 1); }}
                        className="min-h-11 rounded-full bg-white px-5 text-[13px] font-semibold text-black cursor-pointer"
                      >
                        Continuar em {Math.floor(resumePoint / 60)}:{String(Math.floor(resumePoint % 60)).padStart(2, "0")}
                      </button>
                      <button
                        type="button"
                        onClick={() => { try { if (video?.id) localStorage.removeItem(`prisma-resume:${video.id}`); } catch { /* segue do início */ } setStartTime(0); setResumePoint(null); setAutoplayActivated(true); setRestartWithSoundSignal((prev) => prev + 1); }}
                        className="min-h-11 rounded-full border border-white/30 px-5 text-[13px] font-semibold cursor-pointer"
                      >
                        Assistir do início
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* CTA no meio do vídeo (overlay central, como o Smart Autoplay) */}
              {config.ctaEnabled && config.ctaPosition === "middle" && currentTime >= Number(config.ctaStart ?? 0) && (Number(config.ctaEnd ?? 0) <= 0 || currentTime <= Number(config.ctaEnd ?? 0)) && (
                <div className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center p-4">
                  <div className="pointer-events-auto max-w-full">
                    <a
                      href={/^https?:\/\//i.test(config.ctaUrl) ? config.ctaUrl : undefined}
                      target={config.ctaNewTab ? "_blank" : undefined}
                      rel="noreferrer"
                      className={`inline-flex max-w-full flex-col items-center justify-center rounded-2xl font-extrabold cursor-pointer ${
                        config.ctaPulse ? "studio-cta-pulse" : ""
                      }`}
                      style={{
                        color: config.ctaTextColor,
                        backgroundColor: config.ctaBackground,
                        fontSize: `${config.ctaFontSize}px`,
                        borderRadius: `${config.ctaRadius}px`,
                        padding: `${config.ctaPaddingY}px ${config.ctaPaddingX}px`,
                        boxShadow: config.ctaShadow ? "0 10px 30px rgba(0,0,0,0.28)" : "none",
                      }}
                    >
                      <span>{config.ctaText}</span>
                      {config.ctaSubtitle && (
                        <span className="text-[11px] font-normal opacity-90">{config.ctaSubtitle}</span>
                      )}
                      {config.ctaBadges && (
                        <span className="text-[10px] font-semibold opacity-75">{config.ctaBadges}</span>
                      )}
                    </a>
                  </div>
                </div>
              )}

              {/* ThumbSniper Preview: pausa/fim mostram a capa enviada */}
              {thumbnailOverlay && (thumbnailOverlay === "pause" ? pausePosterUrl : endPosterUrl) && (
                <button
                  type="button"
                  onClick={() => {
                    const paused = thumbnailOverlay === "pause";
                    setThumbnailOverlay(null);
                    if (paused) setResumePlaybackSignal((prev) => prev + 1);
                    else setRestartWithSoundSignal((prev) => prev + 1);
                  }}
                  className="absolute inset-0 z-50 bg-cover bg-center cursor-pointer"
                  style={{ backgroundImage: `url(${thumbnailOverlay === "pause" ? pausePosterUrl : endPosterUrl})` }}
                  aria-label={thumbnailOverlay === "pause" ? "Continuar vídeo" : "Assistir novamente"}
                >
                  <span className="absolute inset-0 grid place-items-center bg-black/20">
                    <span className="rounded-full bg-black/70 px-5 py-3 text-[13px] font-semibold text-white backdrop-blur-md">
                      {thumbnailOverlay === "pause" ? "Continuar assistindo" : "Assistir novamente"}
                    </span>
                  </span>
                </button>
              )}
            </div>

            {/* CTA Button Preview (obedece o mesmo horário do player publicado) */}
            {config.ctaEnabled && config.ctaPosition !== "middle" && currentTime >= Number(config.ctaStart ?? 0) && (Number(config.ctaEnd ?? 0) <= 0 || currentTime <= Number(config.ctaEnd ?? 0)) && (
              <div className={`${config.ctaPosition === "top" ? "mb-5 order-1" : "mt-5 order-3"} text-center space-y-1.5`}>
                <a
                  href={/^https?:\/\//i.test(config.ctaUrl) ? config.ctaUrl : undefined}
                  target={config.ctaNewTab ? "_blank" : undefined}
                  rel="noreferrer"
                  className={`inline-flex flex-col items-center justify-center rounded-2xl transition-transform active:scale-95 font-extrabold cursor-pointer ${
                    // Mesmo pulso suave (scale 1→1.045, ease-in-out) do embed real
                    // (globals.css) - sem salto brusco, deceleração exponencial.
                    config.ctaPulse ? "studio-cta-pulse" : ""
                  }`}
                  style={{
                    color: config.ctaTextColor,
                    backgroundColor: config.ctaBackground,
                    fontSize: `${config.ctaFontSize}px`,
                    borderRadius: `${config.ctaRadius}px`,
                    padding: `${config.ctaPaddingY}px ${config.ctaPaddingX}px`,
                    boxShadow: config.ctaShadow ? "0 10px 30px rgba(0,0,0,0.28)" : "none",
                  }}
                >
                  <span>{config.ctaText}</span>
                  {config.ctaSubtitle && (
                    <span className="text-[11px] font-normal opacity-90">{config.ctaSubtitle}</span>
                  )}
                  {config.ctaBadges && (
                    <span className="text-[10px] font-semibold opacity-75">{config.ctaBadges}</span>
                  )}
                </a>
              </div>
            )}
            </div>
          </div>
        </main>

        {/* RIGHT COLUMN: Customization Panel & Preset Manager Cards WITH FULL EDITABLE CONTROLS BELOW */}
        {active && (
          <aside className="order-3 flex min-h-0 min-w-0 flex-col border-l border-black/10 bg-white dark:border-white/10 dark:bg-card overflow-y-auto overscroll-contain">
            <div className="p-4 border-b border-black/10 dark:border-white/10 flex items-center justify-between">
              <h3 className="text-sm font-bold text-[#191A23] dark:text-white flex items-center gap-2">
                {modules.find((m) => m.id === active)?.label}
              </h3>
              <div className="flex items-center gap-1">
                {active && (
                  <button type="button" onClick={() => setLearnModule(active)} aria-label={`Aprenda sobre ${modules.find((m) => m.id === active)?.label ?? active}`} title={`Aprenda sobre ${modules.find((m) => m.id === active)?.label ?? active}`} className="grid size-8 place-items-center rounded-lg text-sky-600 hover:bg-[#B9FF66]/10 hover:text-[#191A23] dark:hover:text-white">
                    <Info size={16} />
                  </button>
                )}
                <button type="button" onClick={() => setActive(null)} className="text-slate-400 hover:bg-[#B9FF66]/10 hover:text-[#191A23] dark:hover:text-white p-1 rounded-lg">
                  <X size={16} />
                </button>
              </div>
            </div>
            {learnModule && (
              <LearnModal module={learnModule} label={modules.find((m) => m.id === learnModule)?.label ?? ""} onClose={() => setLearnModule(null)} />
            )}

            <div className="p-4 space-y-5">
              {/* SMART AUTOPLAY PRESET CARDS LIST + FULL EDITABLE CONTROLS */}
              {active === "autoplay" && (
                <div className="space-y-5">
                  <div className="flex items-center justify-between">
                    <div id="learn-autoplay" className="flex scroll-mt-28 items-center gap-2">
                      <Play size={16} className="text-[#0066cc] dark:text-[#B9FF66]" />
                      <h4 className="text-xs font-extrabold uppercase tracking-wider text-[#191A23] dark:text-white">
                        Smart Autoplay™
                      </h4>
                    </div>
                    <Switch checked={config.smartAutoplay} onChange={(v) => update("smartAutoplay", v)} />
                  </div>

                  <button type="button" onClick={() => setLearnModule("autoplay")} className="text-xs font-semibold text-[#191A23] dark:text-[#B9FF66] hover:underline flex items-center gap-1">
                    <Info size={13} /> Aprenda sobre Smart Autoplay™
                  </button>

                  {/* Vertical Preset Cards List */}
                  <div className="space-y-2.5 pt-1">
                    {autoplayPresets.map((preset, idx) => {
                      const isActive = idx === activeAutoplayIndex;
                      return (
                        <div
                          key={preset.id}
                          onClick={() => {
                            setActiveAutoplayIndex(idx);
                            setAutoplayPresets((prev) =>
                              prev.map((p: PresetCardItem, i: number) => ({ ...p, badge: i === idx ? "Ativo" : undefined }))
                            );
                            applyPresetData(preset.data);
                          }}
                          className={`relative flex items-center justify-between rounded-2xl border p-3.5 transition-all cursor-pointer ${
                            isActive
                              ? "border-sky-500 ring-2 ring-sky-500/20 bg-white dark:bg-card shadow-sm"
                              : "border-slate-200 dark:border-zinc-800 bg-white dark:bg-card hover:border-[#B9FF66] hover:bg-[#B9FF66]/10"
                          }`}
                        >
                          {isActive && (
                            <span className="absolute -top-2.5 right-3 rounded-md bg-sky-500 px-2 py-0.5 text-[9px] font-extrabold text-white uppercase shadow-xs">
                              Ativo
                            </span>
                          )}

                          <div className="flex items-center gap-3">
                            <div
                              className="flex h-11 w-11 shrink-0 flex-col items-center justify-center rounded-xl font-bold text-white shadow-xs"
                              style={{ backgroundColor: preset.color }}
                            >
                              <Play size={18} fill="currentColor" />
                            </div>

                            <div>
                              <p className="text-xs font-bold text-[#191A23] dark:text-white">{preset.name}</p>
                            </div>
                          </div>

                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              const next = autoplayPresets.filter((_, i) => i !== idx);
                              setAutoplayPresets(next);
                              setActiveAutoplayIndex(Math.max(0, idx - 1));
                            }}
                            title="Excluir este autoplay"
                            aria-label="Excluir este autoplay"
                            className="grid size-7 shrink-0 place-items-center rounded-lg bg-[#B9FF66]/15 text-[#191A23] transition-colors hover:bg-red-50 hover:text-red-600 dark:text-[#B9FF66] dark:hover:bg-red-950/30 dark:hover:text-red-400"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      );
                    })}
                  </div>

                  {/* Add Another Autoplay Button */}
                  <button
                    type="button"
                    onClick={() => setTemplateModalOpen(true)}
                    className="flex w-full min-h-11 items-center justify-center gap-2 rounded-2xl border-2 border-slate-200 dark:border-zinc-800 bg-white dark:bg-card text-xs font-bold text-[#191A23] dark:text-[#B9FF66] hover:bg-[#B9FF66]/10 hover:text-[#191A23] dark:hover:text-white cursor-pointer shadow-xs"
                  >
                    + Adicionar outro Autoplay
                  </button>

                  {/* FULL EDITABLE CONTROLS FOR THE ACTIVE PRESET */}
                  <div className="border-t border-slate-200 dark:border-zinc-800 pt-4 space-y-4">
                    <PanelTitle>Personalizar Preset Selecionado</PanelTitle>

                    <TextInput
                      label="Tag / Badge do Botão"
                      value={config.autoplayTagBadge}
                      placeholder="Ex: 🔴 AULÃO AO VIVO"
                      onChange={(v) => update("autoplayTagBadge", v)}
                    />

                    <TextArea
                      label="Mensagem de Ativação"
                      value={config.autoplayMessage}
                      onChange={(v) => update("autoplayMessage", v)}
                    />

                    <Segmented
                      label="Tipo de Capa"
                      value={config.autoplayCoverType}
                      options={[
                        { label: "Padrão", value: "standard" },
                        { label: "GIF Animado", value: "gif" },
                        { label: "Imagem Custom", value: "image" },
                      ]}
                      onChange={(v) => update("autoplayCoverType", v as StudioConfig["autoplayCoverType"])}
                    />

                    {config.autoplayCoverType === "gif" && (
                      <TextInput
                        label="URL do GIF Animado"
                        value={config.autoplayGifUrl}
                        placeholder="https://media.giphy.com/media/.../giphy.gif"
                        onChange={(v) => update("autoplayGifUrl", v)}
                      />
                    )}

                    {config.autoplayCoverType === "image" && (
                      <TextInput
                        label="URL da Imagem Custom"
                        value={config.autoplayImageUrl}
                        placeholder="https://seusite.com/capa.png"
                        onChange={(v) => update("autoplayImageUrl", v)}
                      />
                    )}

                    <Select
                      label="Estilo de Animação do Botão"
                      value={config.autoplayAnimation}
                      options={["pulse", "sound_bars", "cursor_click", "play_glow"]}
                      onChange={(v) => update("autoplayAnimation", v as StudioConfig["autoplayAnimation"])}
                    />

                    <Color
                      label="Cor do Texto"
                      value={config.autoplayTextColor}
                      onChange={(v) => update("autoplayTextColor", v)}
                    />

                    <Color
                      label="Cor de Fundo do Botão"
                      value={config.autoplayBackground}
                      onChange={(v) => update("autoplayBackground", v)}
                    />

                    <Range
                      label="Cantos Arredondados (Raio)"
                      value={config.autoplayRadius}
                      min={0}
                      max={28}
                      suffix="px"
                      onChange={(v) => update("autoplayRadius", v)}
                    />

                    <Range
                      label="Opacidade do fundo"
                      value={config.autoplayOverlayOpacity}
                      min={10}
                      max={100}
                      suffix="%"
                      onChange={(v) => update("autoplayOverlayOpacity", v)}
                    />
                  </div>
                </div>
              )}

              {/* HEADLINES PRESET CARDS LIST + FULL EDITABLE CONTROLS */}
              {active === "headlines" && (
                <div className="space-y-5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Heading size={16} className="text-[#0066cc]" />
                      <h4 className="text-xs font-extrabold uppercase tracking-wider text-[#191A23] dark:text-white">
                        Headlines
                      </h4>
                    </div>
                    <Switch checked={config.headlineEnabled} onChange={(v) => update("headlineEnabled", v)} />
                  </div>

                  <div className="space-y-2.5 pt-1">
                    {headlinePresets.map((preset, idx) => {
                      const isActive = idx === activeHeadlineIndex;
                      return (
                        <div
                          key={preset.id}
                          onClick={() => {
                            setActiveHeadlineIndex(idx);
                            setHeadlinePresets((prev) =>
                              prev.map((p: PresetCardItem, i: number) => ({ ...p, badge: i === idx ? "Ativo" : undefined }))
                            );
                            applyPresetData(preset.data);
                          }}
                          className={`relative flex items-center justify-between rounded-2xl border p-3.5 transition-all cursor-pointer ${
                            isActive
                              ? "border-sky-500 ring-2 ring-sky-500/20 bg-white dark:bg-card shadow-sm"
                              : "border-slate-200 dark:border-zinc-800 bg-white dark:bg-card hover:border-[#B9FF66] hover:bg-[#B9FF66]/10"
                          }`}
                        >
                          {isActive && (
                            <span className="absolute -top-2.5 right-3 rounded-md bg-sky-500 px-2 py-0.5 text-[9px] font-extrabold text-white uppercase shadow-xs">
                              Ativo
                            </span>
                          )}

                          <div className="flex items-center gap-3">
                            <div className="flex h-10 w-14 shrink-0 flex-col items-center justify-center rounded-xl bg-black text-white p-1 text-[8px] font-bold text-center">
                              <span>HEADLINE</span>
                            </div>

                            <div>
                              <p className="text-xs font-bold text-[#191A23] dark:text-white">{preset.name}</p>
                            </div>
                          </div>

                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              const next = headlinePresets.filter((_, i) => i !== idx);
                              setHeadlinePresets(next);
                              setActiveHeadlineIndex(Math.max(0, idx - 1));
                            }}
                            title="Excluir esta headline"
                            aria-label="Excluir esta headline"
                            className="grid size-7 shrink-0 place-items-center rounded-lg bg-[#B9FF66]/15 text-[#191A23] transition-colors hover:bg-red-50 hover:text-red-600 dark:text-[#B9FF66] dark:hover:bg-red-950/30 dark:hover:text-red-400"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      );
                    })}
                  </div>

                  {/* FULL EDITABLE CONTROLS FOR THE ACTIVE HEADLINE PRESET */}
                  <div className="border-t border-slate-200 dark:border-zinc-800 pt-4 space-y-4">
                    <PanelTitle>Personalizar Headline Selecionada</PanelTitle>

                    <TextInput
                      label="Tag / Selo da Headline"
                      value={config.headlineTagBadge}
                      placeholder="Ex: 🔥 EXCLUSIVO"
                      onChange={(v) => update("headlineTagBadge", v)}
                    />

                    <TextArea
                      label="Headline Principal"
                      value={config.headline}
                      onChange={(v) => update("headline", v)}
                    />

                    <Segmented
                      label="Alinhamento"
                      value={config.headlineAlign}
                      options={[
                        { label: "Esquerda", value: "left" },
                        { label: "Centro", value: "center" },
                        { label: "Direita", value: "right" },
                      ]}
                      onChange={(v) => update("headlineAlign", v as StudioConfig["headlineAlign"])}
                    />

                    <Range
                      label="Tamanho da Fonte"
                      value={config.headlineSize}
                      min={16}
                      max={64}
                      suffix="px"
                      onChange={(v) => update("headlineSize", v)}
                    />

                    <Color
                      label="Cor do Texto"
                      value={config.headlineColor}
                      onChange={(v) => update("headlineColor", v)}
                    />

                    <Color
                      label="Cor de Fundo"
                      value={config.headlineBackground}
                      onChange={(v) => update("headlineBackground", v)}
                    />

                    <TimeRange label="Exibir a partir de" value={config.headlineStart} max={Math.max(1, Math.floor(config.videoDuration || 1))} onChange={(v) => update("headlineStart", v)} />
                    <Range label="Duração visível (0 = sempre)" value={config.headlineDuration} min={0} max={Math.max(60, Math.floor(config.videoDuration || 60))} suffix="s" onChange={(v) => update("headlineDuration", v)} />
                  </div>
                </div>
              )}

              {/* TURBO MODULE PANEL */}
              {active === "turbo" && (
                <div className="space-y-4">
                  <div id="learn-turbo" className="flex scroll-mt-28 items-center justify-between border-b border-slate-100 dark:border-zinc-800 pb-3">
                    <div className="flex items-center gap-2">
                      <Zap size={18} className="text-amber-500" />
                      <h4 className="text-sm font-bold text-[#191A23] dark:text-white">Turbo</h4>
                    </div>
                    <Switch checked={config.turboEnabled} onChange={(v) => update("turboEnabled", v)} />
                  </div>

                  <button type="button" onClick={() => setLearnModule("turbo")} className="text-xs font-semibold text-[#191A23] dark:text-[#B9FF66] hover:underline flex items-center gap-1">
                    <Info size={13} /> Aprenda sobre Turbo
                  </button>

                  <div className="space-y-3 pt-2">
                    <h5 className="text-xs font-extrabold text-[#191A23] dark:text-white uppercase tracking-wider">Definir Velocidade</h5>
                    <p className="text-xs text-slate-500">Escolha entre um teste automático ou a definição da velocidade de maneira manual</p>

                    <Segmented
                      label=""
                      value={config.turboMode}
                      options={[
                        { label: "Automático", value: "automatic" },
                        { label: "Manual", value: "manual" },
                      ]}
                      onChange={(v) => update("turboMode", v as StudioConfig["turboMode"])}
                    />

                    {config.turboMode === "automatic" ? (
                      <div className="space-y-3 pt-2">
                        <h6 className="text-xs font-bold text-[#191A23] dark:text-white">Intervalo de teste</h6>
                        <p className="text-xs text-slate-500">Testaremos a partir da velocidade 1x até a velocidade escolhida</p>

                        <div className="flex items-center justify-between text-xs font-bold text-sky-600">
                          <span className="rounded-md bg-sky-100 dark:bg-sky-950 px-2 py-0.5">{config.turboMin.toFixed(1)}x</span>
                          <span className="rounded-md bg-sky-100 dark:bg-sky-950 px-2 py-0.5">{config.turboMax.toFixed(1)}x</span>
                        </div>

                        <Range
                          label=""
                          value={config.turboMax}
                          min={1.0}
                          max={1.5}
                          step={0.1}
                          suffix="x"
                          onChange={(v) => update("turboMax", v)}
                        />
                      </div>
                    ) : (
                      <Select
                        label="Velocidade manual"
                        value={`${config.playbackRate.toFixed(1)}x`}
                        options={["0.9x", "1.0x", "1.1x", "1.2x", "1.3x", "1.4x", "1.5x"]}
                        onChange={(v) => update("playbackRate", Number(v.replace("x", "")))}
                      />
                    )}

                    <button
                      type="button"
                      onClick={() => void saveConfig()}
                      disabled={saving}
                      className="mt-4 flex w-full min-h-11 items-center justify-center rounded-xl bg-[#B9FF66] hover:bg-[#a6ee50] dark:hover:bg-[#B9FF66] px-4 text-xs font-bold text-[#191A23] shadow-xs cursor-pointer disabled:opacity-50"
                    >
                      Iniciar novo teste
                    </button>
                  </div>
                </div>
              )}

              {/* Module Form Controls for remaining modules */}
              {/* O update grava em um ref write-only (rastreamento sujo); inlining aqui exigiria refatorar o painel. */}
              {/* eslint-disable-next-line react-hooks/refs -- ref é gravado apenas em handlers; análise estática não enxerga através do helper de módulo */}
              {renderPanel(active, config, update, handlePoster, handleCaption, playerId, video?.id, {
    hookPresets, setHookPresets, activeHookIndex, setActiveHookIndex,
    ctaPresets, setCtaPresets, activeCtaIndex, setActiveCtaIndex,
    thumbnailPresets, setThumbnailPresets, activeThumbnailIndex, setActiveThumbnailIndex,
    setLearnModule,
  })}
            </div>
          </aside>
        )}
      </div>

      {/* TEMPLATE SELECTION MODAL */}
      <Dialog
        open={templateModalOpen}
        onClose={() => setTemplateModalOpen(false)}
        title="Escolher Template"
        description="Escolha um template para o seu Smart Autoplay"
        size="md"
        footer={
          <>
            <button
              type="button"
              onClick={() => setTemplateModalOpen(false)}
              className="min-h-10 rounded-xl border border-slate-200 dark:border-zinc-800 px-5 text-xs font-bold text-slate-700 dark:text-zinc-300"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={() => addAutoplayTemplate(0)}
              className="min-h-10 rounded-xl bg-[#B9FF66] hover:bg-[#a6ee50] dark:hover:bg-[#B9FF66] px-5 text-xs font-bold text-[#191A23] shadow-xs"
            >
              Definir template
            </button>
          </>
        }
      >
        <div className="grid grid-cols-3 gap-3 p-2">
          {[
            { id: 0, title: "Seu vídeo já começou", color: "#0066cc", icon: VolumeX },
            { id: 1, title: "Clique para ouvir", color: "#0066cc", icon: Volume2 },
            { id: 2, title: "Play Dark", color: "#191A23", icon: Play },
            { id: 3, title: "Seu vídeo começou", color: "#0066cc", icon: VolumeX },
            { id: 4, title: "Clique para ouvir", color: "#ef4444", icon: Play },
            { id: 5, title: "Verde Limão Hero", color: "#B9FF66", icon: Play },
          ].map((t) => {
            const IconComponent = t.icon;
            return (
              <div
                key={t.id}
                onClick={() => addAutoplayTemplate(t.id)}
                className="flex aspect-4/3 flex-col items-center justify-center rounded-2xl border border-slate-200 dark:border-zinc-800 bg-slate-100 dark:bg-card p-3 text-center transition-all cursor-pointer shadow-xs hover:border-[#B9FF66] hover:bg-[#B9FF66]/10"
              >
                <div
                  className="flex h-14 w-20 flex-col items-center justify-center rounded-xl font-bold text-white shadow-xs p-1"
                  style={{ backgroundColor: t.color, color: t.color === "#B9FF66" ? "#191A23" : "#ffffff" }}
                >
                  <IconComponent size={18} />
                  <span className="text-[8px] mt-1 line-clamp-1">{t.title}</span>
                </div>
              </div>
            );
          })}
        </div>
      </Dialog>
    </div>
  );
}

function ProtectionPanel({ config: c, update: u }: { config: StudioConfig; update: <K extends keyof StudioConfig>(key: K, value: StudioConfig[K]) => void }) {
  const [subTab, setSubTab] = useState<"watermark" | "restrictions" | "drm" | "geo">("watermark");
  const [newDomain, setNewDomain] = useState("");

  const addDomain = () => {
    const clean = newDomain.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
    if (clean && !c.domainWhitelist.includes(clean)) {
      u("domainWhitelist", [...c.domainWhitelist, clean]);
      setNewDomain("");
    }
  };

  const removeDomain = (domain: string) => {
    u("domainWhitelist", c.domainWhitelist.filter((d) => d !== domain));
  };

  return (
    <div className="space-y-4">
      {/* 4 Tabs Header */}
      <div className="flex border-b border-slate-200 dark:border-zinc-800 text-xs font-bold">
        {[
          { id: "watermark", label: "Marca D'água" },
          { id: "restrictions", label: "Restrições" },
          { id: "drm", label: "DRM" },
          { id: "geo", label: "Bloco Geográfico" },
        ].map((tab) => {
          const isActive = subTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setSubTab(tab.id as typeof subTab)}
              className={`pb-2.5 px-3 border-b-2 transition-all cursor-pointer ${
                isActive
                  ? "border-[#B9FF66] text-[#191A23] dark:text-[#B9FF66] font-extrabold"
                  : "border-transparent text-slate-500 dark:text-zinc-400 hover:text-[#191A23] dark:hover:text-[#B9FF66]"
              }`}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* TAB 1: MARCA D'ÁGUA */}
      {subTab === "watermark" && (
        <div className="space-y-4 pt-1">
          <CheckRow label="Adicionar marca d'água ao player" checked={c.watermarkEnabled} onChange={(v) => u("watermarkEnabled", v)} />

          {c.watermarkEnabled && (
            <>
              <div className="space-y-2 pt-2">
                <PanelTitle>Parâmetros</PanelTitle>
                <div className="grid grid-cols-2 gap-2 text-xs font-medium">
                  <CheckRow label="Endereço de e-mail do usuário" checked={c.watermarkShowEmail} onChange={(v) => u("watermarkShowEmail", v)} />
                  <CheckRow label="Número de telefone" checked={c.watermarkShowPhone} onChange={(v) => u("watermarkShowPhone", v)} />
                  <CheckRow label="Endereço IP" checked={c.watermarkShowIp} onChange={(v) => u("watermarkShowIp", v)} />
                  <CheckRow label="Nome de usuário" checked={c.watermarkShowUsername} onChange={(v) => u("watermarkShowUsername", v)} />
                  <CheckRow label="Data" checked={c.watermarkShowDate} onChange={(v) => u("watermarkShowDate", v)} />
                  <CheckRow label="Texto personalizado" checked={c.watermarkShowCustomText} onChange={(v) => u("watermarkShowCustomText", v)} />
                </div>

                {c.watermarkShowCustomText && (
                  <TextInput
                    label=""
                    value={c.watermarkCustomText}
                    placeholder="Digite o texto personalizado"
                    onChange={(v) => u("watermarkCustomText", v)}
                  />
                )}
                {c.watermarkShowEmail && (
                  <TextInput
                    label="E-mail exibido na marca d'água (ex.: o comercial da sua empresa)"
                    value={c.watermarkEmailText}
                    placeholder="contato@suaempresa.com"
                    onChange={(v) => u("watermarkEmailText", v)}
                  />
                )}
                {c.watermarkShowPhone && (
                  <TextInput
                    label="Telefone exibido na marca d'água"
                    value={c.watermarkPhoneText}
                    placeholder="+55 11 99999-0000"
                    onChange={(v) => u("watermarkPhoneText", v)}
                  />
                )}
              </div>

              <div className="space-y-3 pt-2">
                <PanelTitle>Aparência</PanelTitle>
                <Segmented
                  label=""
                  value={c.watermarkType}
                  options={[
                    { label: "Dinâmico", value: "dynamic" },
                    { label: "Estático", value: "static" },
                  ]}
                  onChange={(v) => u("watermarkType", v as StudioConfig["watermarkType"])}
                />

                {c.watermarkType === "static" ? (
                  <Select
                    label="Posição na Tela"
                    value={c.watermarkPosition}
                    options={[
                      "top-right",
                      "top-left",
                      "bottom-right",
                      "bottom-left",
                      "center",
                    ]}
                    onChange={(v) => u("watermarkPosition", v as StudioConfig["watermarkPosition"])}
                  />
                ) : (
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-slate-500">Mostrar raramente, todos os dias</label>
                    <div className="flex gap-2">
                      <input
                        type="number"
                        value={c.watermarkIntervalValue}
                        onChange={(e) => u("watermarkIntervalValue", Number(e.target.value))}
                        className="h-10 w-24 rounded-xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-card px-3 text-xs font-medium text-[#191A23] dark:text-white"
                      />
                      <AdminSelect label="Unidade do intervalo" value={c.watermarkIntervalUnit} onChange={(v) => u("watermarkIntervalUnit", v as "second" | "minute")} className="flex-1" options={[{ value: "second", label: "Segundo" }, { value: "minute", label: "Minuto" }]} />
                    </div>
                  </div>
                )}

                <Range
                  label="Opacidade(%)"
                  value={c.watermarkOpacity}
                  min={10}
                  max={100}
                  suffix="%"
                  onChange={(v) => u("watermarkOpacity", v)}
                />
              </div>
            </>
          )}
        </div>
      )}

      {/* TAB 2: RESTRIÇÕES */}
      {subTab === "restrictions" && (
        <div className="space-y-4 pt-1">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <CheckRow label="Limitar fluxos simultâneos" checked={c.limitConcurrentStreams} onChange={(v) => u("limitConcurrentStreams", v)} />
              <span title="Número máximo de conexões simultâneas ativas por conta"><Info size={14} className="text-slate-400" /></span>
            </div>

            {c.limitConcurrentStreams && (
              <div className="pl-2 pt-1 space-y-1">
                <label className="text-xs font-medium text-slate-500">Número máximo de dispositivos por conta</label>
                <input
                  type="number"
                  value={c.maxConcurrentStreams}
                  onChange={(e) => u("maxConcurrentStreams", Number(e.target.value))}
                  className="h-10 w-full rounded-xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-card px-3.5 text-xs font-medium text-[#191A23] dark:text-white"
                />
              </div>
            )}
          </div>

          <div className="space-y-3 pt-3 border-t border-slate-100 dark:border-zinc-800">
            <div className="flex items-center justify-between">
              <CheckRow label="Lista de permissões de domínio" checked={c.domainWhitelistEnabled} onChange={(v) => u("domainWhitelistEnabled", v)} />
              <span title="Se ativado, bloqueia a reprodução em sites não listados abaixo"><Info size={14} className="text-slate-400" /></span>
            </div>

            {c.domainWhitelistEnabled && (
              <div className="space-y-3 pt-1">
                <div className="rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900/50 p-3 text-xs font-semibold text-amber-900 dark:text-amber-300 flex items-start gap-2">
                  <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400 mt-0.5" />
                  <span>Aviso: Se nenhum nome de domínio for adicionado, o reproductor incorporado será bloqueado em todos os sites.</span>
                </div>

                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Globe2 size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      value={newDomain}
                      onChange={(e) => setNewDomain(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && addDomain()}
                      placeholder="por exemplo www.muvi.com"
                      className="h-10 w-full rounded-xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-card pl-9 pr-3.5 text-xs font-medium text-[#191A23] dark:text-white outline-none focus:border-[#B9FF66]"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={addDomain}
                    className="flex min-h-10 items-center gap-1 rounded-xl bg-[#B9FF66] hover:bg-[#a6ee50] dark:hover:bg-[#B9FF66] px-4 text-xs font-bold text-[#191A23] cursor-pointer shadow-xs"
                  >
                    <Plus size={14} /> Adicionar
                  </button>
                </div>

                <div className="rounded-xl border border-slate-200 dark:border-zinc-800 overflow-hidden text-xs">
                  <table className="w-full text-left">
                    <thead className="bg-slate-50 dark:bg-card text-slate-500 font-semibold border-b border-slate-100 dark:border-zinc-800">
                      <tr>
                        <th className="p-2.5">Nº De Série</th>
                        <th className="p-2.5">URL Do Site</th>
                        <th className="p-2.5 text-right">Ação</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-zinc-800">
                      {c.domainWhitelist.length === 0 ? (
                        <tr>
                          <td colSpan={3} className="p-4 text-center text-slate-400">
                            Nenhum domínio cadastrado na lista.
                          </td>
                        </tr>
                      ) : (
                        c.domainWhitelist.map((item, idx) => (
                          <tr key={item}>
                            <td className="p-2.5 text-slate-400 font-medium">{idx + 1}</td>
                            <td className="p-2.5 font-bold text-[#191A23] dark:text-zinc-100">{item}</td>
                            <td className="p-2.5 text-right">
                              <button type="button" onClick={() => removeDomain(item)} className="text-slate-400 hover:text-red-600 p-1 cursor-pointer">
                                <Trash2 size={14} />
                              </button>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 3: DRM */}
      {subTab === "drm" && (
        <div className="space-y-3 pt-1">
          <div className="rounded-xl border border-[#B9FF66]/40 bg-[#B9FF66]/10 p-3 text-xs font-semibold text-[#191A23] dark:text-[#B9FF66] flex items-center gap-2">
            <LockKeyhole size={16} />
            <span>Proteção DRM de Mídia contra Captura & Download</span>
          </div>

          <CheckRow label="Ativar Criptografia HLS AES-128" checked={c.drmHlsEnabled} onChange={(v) => u("drmHlsEnabled", v)} />
          <CheckRow label="Exigir Token Assinado por Sessão" checked={c.drmSignedTokenEnabled} onChange={(v) => u("drmSignedTokenEnabled", v)} />
          <CheckRow label="Desativar Menu de Contexto (Botão Direito)" checked={c.disableContextMenu} onChange={(v) => u("disableContextMenu", v)} />
          <CheckRow label="Bloquear Atalhos DevTools (F12 / Inspect)" checked={c.blockDevTools} onChange={(v) => u("blockDevTools", v)} />
        </div>
      )}

      {/* TAB 4: BLOCO GEOGRÁFICO */}
      {subTab === "geo" && (
        <div className="space-y-4 pt-1">
          <CheckRow label="Regras de tráfego ativas" checked={c.trafficEnabled} onChange={(v) => u("trafficEnabled", v)} />
          {!c.trafficEnabled && (
            <div className="rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900/50 p-3 text-xs font-semibold text-amber-900 dark:text-amber-300 flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400 mt-0.5" />
              <span>As regras abaixo só são aplicadas com as regras de tráfego ativas. Sem isso, nada é bloqueado.</span>
            </div>
          )}
          <CheckRow label="Bloquear acessos de Proxy / VPN" checked={c.blockVpn} onChange={(v) => u("blockVpn", v)} />
          <Select label="Idioma do Navegador" value={c.browserLanguage} options={["Todos", "Português", "Inglês", "Espanhol"]} onChange={(v) => u("browserLanguage", v)} />
          <TextInput label="Países permitidos" value={c.allowedCountries} placeholder="Todos ou BR, PT, US" onChange={(v) => u("allowedCountries", v)} />

          <div className="space-y-2">
            <PanelTitle>Dispositivos Permitidos</PanelTitle>
            {[["Desktop", "desktop"], ["Celular", "mobile"], ["Tablet", "tablet"]].map(([label, value]) => (
              <CheckRow
                key={value}
                label={label}
                checked={c.allowedDevices.includes(value)}
                onChange={(checked) =>
                  u(
                    "allowedDevices",
                    checked ? [...new Set([...c.allowedDevices, value])] : c.allowedDevices.filter((item) => item !== value)
                  )
                }
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

interface PanelExtras {
  hookPresets: PresetCardItem[];
  setHookPresets: React.Dispatch<React.SetStateAction<PresetCardItem[]>>;
  activeHookIndex: number;
  setActiveHookIndex: (idx: number) => void;
  ctaPresets: PresetCardItem[];
  setCtaPresets: React.Dispatch<React.SetStateAction<PresetCardItem[]>>;
  activeCtaIndex: number;
  setActiveCtaIndex: (idx: number) => void;
  thumbnailPresets: PresetCardItem[];
  setThumbnailPresets: React.Dispatch<React.SetStateAction<PresetCardItem[]>>;
  activeThumbnailIndex: number;
  setActiveThumbnailIndex: (idx: number) => void;
  setLearnModule: (module: LearnModuleId | null) => void;
}

function renderPanel(
  module: ModuleId,
  c: StudioConfig,
  u: <K extends keyof StudioConfig>(key: K, value: StudioConfig[K]) => void,
  onPoster: (file: File, kind: "start" | "pause" | "end") => void,
  onCaption: (file: File) => void,
  playerId?: string,
  videoId?: string,
  extras?: PanelExtras
) {
  if (module === "style") return <><Color label="Cor principal" value={c.accent} onChange={(v) => u("accent", v)} /><Range label="Cantos arredondados" value={c.radius} min={0} max={28} suffix="px" onChange={(v) => u("radius", v)} /><p className="panel-help">O raio recorta diretamente o vídeo. Não existe uma camada de fundo atrás dele, portanto nenhuma cor aparece nos cantos.</p><PanelTitle>Controles do player</PanelTitle><CheckRow label="Botão de play grande" checked={c.bigPlay} onChange={(v) => u("bigPlay", v)} /><CheckRow label="Botão de play pequeno" checked={c.playPause} onChange={(v) => u("playPause", v)} /><CheckRow label="Desativar pausa" checked={c.disablePause} onChange={(v) => u("disablePause", v)} /><CheckRow label="Barra de progresso" checked={c.progressBar} onChange={(v) => u("progressBar", v)} /><CheckRow label="Tempo do vídeo" checked={c.time} onChange={(v) => u("time", v)} /><CheckRow label="Voltar 10 segundos" checked={c.seekBackward} onChange={(v) => u("seekBackward", v)} /><CheckRow label="Avançar 10 segundos" checked={c.seekForward} onChange={(v) => u("seekForward", v)} /><CheckRow label="Volume" checked={c.volume} onChange={(v) => u("volume", v)} /><CheckRow label="Fullscreen" checked={c.fullscreen} onChange={(v) => u("fullscreen", v)} /><CheckRow label="Picture-in-Picture" checked={c.pictureInPicture} onChange={(v) => u("pictureInPicture", v)} /><CheckRow label="Controle de velocidade" checked={c.speedControl} onChange={(v) => u("speedControl", v)} /></>;
  if (module === "progress") return <><p className="panel-help">A barra avança mais rápido no início e desacelera perto do final, dando a percepção de que falta pouco para o vídeo terminar.</p><Color label="Cor da barra" value={c.progressColor} onChange={(v) => u("progressColor", v)} /><Range label="Altura" value={c.progressHeight} min={4} max={12} suffix="px" onChange={(v) => u("progressHeight", v)} /></>;
  if (module === "hooks") {
    const { hookPresets, setHookPresets, activeHookIndex, setActiveHookIndex } = extras ?? {};
    const applyHook = (data: Record<string, unknown>) => {
      Object.entries(data).forEach(([k, v]) => u(k as keyof StudioConfig, v as StudioConfig[keyof StudioConfig]));
    };
    return (
      <>
        <p className="panel-help">Crie vários mini-ganchos para aparecerem em diferentes momentos do vídeo, igual ao Smart Autoplay.</p>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Zap size={16} className="text-[#0066cc] dark:text-[#B9FF66]" />
            <h4 className="text-xs font-extrabold uppercase tracking-wider text-[#191A23] dark:text-white">
              Mini-ganchos
            </h4>
          </div>
          <Switch checked={c.miniHooksEnabled} onChange={(v) => u("miniHooksEnabled", v)} />
        </div>
        <button type="button" onClick={() => extras?.setLearnModule("hooks")} className="text-xs font-semibold text-[#191A23] dark:text-[#B9FF66] hover:underline flex items-center gap-1">
          <Info size={13} /> Aprenda sobre Mini-ganchos
        </button>
        <div className="space-y-2.5 pt-1">
          {(hookPresets ?? []).map((preset, idx) => {
            const isActive = idx === activeHookIndex;
            return (
              <div
                key={preset.id}
                onClick={() => {
                  setActiveHookIndex?.(idx);
                  setHookPresets?.((prev: PresetCardItem[]) =>
                    prev.map((p: PresetCardItem, i: number) => ({ ...p, badge: i === idx ? "Ativo" : undefined }))
                  );
                  applyHook(preset.data);
                }}
                className={`relative flex items-center justify-between rounded-2xl border p-3.5 transition-all cursor-pointer ${
                  isActive
                    ? "border-sky-500 ring-2 ring-sky-500/20 bg-white dark:bg-card shadow-sm"
                    : "border-slate-200 dark:border-zinc-800 bg-white dark:bg-card hover:border-[#B9FF66] hover:bg-[#B9FF66]/10"
                }`}
              >
                {isActive && (
                  <span className="absolute -top-2.5 right-3 rounded-md bg-sky-500 px-2 py-0.5 text-[9px] font-extrabold text-white uppercase shadow-xs">
                    Ativo
                  </span>
                )}
                <div className="flex items-center gap-3">
                  <div className="flex h-11 w-11 shrink-0 flex-col items-center justify-center rounded-xl font-bold text-white shadow-xs" style={{ backgroundColor: preset.color }}>
                    <Zap size={18} fill="currentColor" />
                  </div>
                  <div>
                    <p className="text-xs font-bold text-[#191A23] dark:text-white">{preset.name}</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    const next = (hookPresets ?? []).filter((_, i) => i !== idx);
                    setHookPresets?.(next);
                    setActiveHookIndex?.(Math.max(0, idx - 1));
                  }}
                  title="Excluir este gancho"
                  aria-label="Excluir este gancho"
                  className="grid size-7 shrink-0 place-items-center rounded-lg bg-[#B9FF66]/15 text-[#191A23] transition-colors hover:bg-red-50 hover:text-red-600 dark:text-[#B9FF66] dark:hover:bg-red-950/30 dark:hover:text-red-400"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            );
          })}
        </div>
        <button type="button" onClick={() => {
          const newHook: PresetCardItem = {
            id: `hook-${Date.now()}`,
            name: `Gancho ${(hookPresets ?? []).length + 1}`,
            color: ["#B9FF66", "#0066cc", "#ef4444", "#a855f7", "#10b981"][(hookPresets ?? []).length % 5],
            data: { miniHookText: "Novo gancho...", miniHookStart: 30, miniHookDuration: 6, miniHookTextColor: "#ffffff", miniHookBackground: "#111111", miniHookCounterColor: "#ff3b30", miniHookSize: 16, miniHookRadius: 10, miniHookAlign: "center", miniHookType: "custom" },
          };
          setHookPresets?.([...(hookPresets ?? []), newHook]);
          setActiveHookIndex?.((hookPresets ?? []).length);
          applyHook(newHook.data);
        }} className="flex w-full min-h-11 items-center justify-center gap-2 rounded-2xl border-2 border-slate-200 dark:border-zinc-800 bg-white dark:bg-card text-xs font-bold text-[#191A23] dark:text-[#B9FF66] hover:bg-[#B9FF66]/10 hover:text-[#191A23] dark:hover:text-white cursor-pointer shadow-xs">
          + Adicionar outro Mini-gancho
        </button>
        <div className="border-t border-slate-200 dark:border-zinc-800 pt-4 space-y-4">
          <PanelTitle>Personalizar Gancho Selecionado</PanelTitle>
          <TextArea label="Texto do Mini-Gancho / Widget" value={c.miniHookText} onChange={(v) => u("miniHookText", v)} />
          <TimeRange label="Aparecer em" value={c.miniHookStart} max={Math.max(1, Math.floor(c.videoDuration || 1))} onChange={(v) => u("miniHookStart", v)} />
          <Range label="Duração" value={c.miniHookDuration} min={2} max={60} suffix="s" onChange={(v) => u("miniHookDuration", v)} />
          <Color label="Cor do texto" value={c.miniHookTextColor} onChange={(v) => u("miniHookTextColor", v)} />
          <Color label="Cor do fundo" value={c.miniHookBackground} onChange={(v) => u("miniHookBackground", v)} />
          <Color label="Cor do contador" value={c.miniHookCounterColor} onChange={(v) => u("miniHookCounterColor", v)} />
          <Range label="Tamanho da fonte" value={c.miniHookSize} min={12} max={24} suffix="px" onChange={(v) => u("miniHookSize", v)} />
          <Range label="Raio dos cantos" value={c.miniHookRadius} min={0} max={20} suffix="px" onChange={(v) => u("miniHookRadius", v)} />
          <Segmented
            label="Alinhamento"
            value={c.miniHookAlign}
            options={[
              { label: "Esquerda", value: "left" },
              { label: "Centro", value: "center" },
              { label: "Direita", value: "right" },
            ]}
            onChange={(v) => u("miniHookAlign", v as StudioConfig["miniHookAlign"])}
          />
          <Select
            label="Tipo de Gancho"
            value={c.miniHookType}
            options={(Object.keys(HOOK_TYPE_META) as MiniHookType[]).map((type) => ({ value: type, label: HOOK_TYPE_META[type].label }))}
            onChange={(v) => u("miniHookType", v as StudioConfig["miniHookType"])}
          />
          <p className="rounded-xl border border-[#B9FF66]/40 bg-[#B9FF66]/10 p-3 text-xs font-medium leading-relaxed text-[#191A23] dark:text-[#B9FF66]">
            {HOOK_TYPE_META[c.miniHookType as MiniHookType]?.hint ?? "Escolha um tipo de gancho."}
          </p>
        </div>
      </>
    );
  }
  if (module === "traffic") return <><p className="panel-help">As regras são avaliadas no backend.</p><Select label="Idioma do navegador" value={c.browserLanguage} options={["Todos", "Português", "Inglês", "Espanhol"]} onChange={(v) => u("browserLanguage", v)} /><TextInput label="Países permitidos" value={c.allowedCountries} placeholder="Todos ou BR, PT, US" onChange={(v) => u("allowedCountries", v)} /><CheckRow label="Bloquear Proxy / VPN" checked={c.blockVpn} onChange={(v) => u("blockVpn", v)} /></>;
  if (module === "actions") {
    const { ctaPresets, setCtaPresets, activeCtaIndex, setActiveCtaIndex } = extras ?? {};
    const applyCta = (data: Record<string, unknown>) => {
      Object.entries(data).forEach(([k, v]) => u(k as keyof StudioConfig, v as StudioConfig[keyof StudioConfig]));
    };
    return (
      <>
        <p className="panel-help">Crie vários botões de ação (CTAs) com diferentes textos, links e estilos. Selecione qual usar no momento da publicação.</p>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <MousePointerClick size={16} className="text-[#0066cc] dark:text-[#B9FF66]" />
            <h4 className="text-xs font-extrabold uppercase tracking-wider text-[#191A23] dark:text-white">
              Botões de Ação
            </h4>
          </div>
          <Switch checked={c.ctaEnabled} onChange={(v) => u("ctaEnabled", v)} />
        </div>
        <button type="button" onClick={() => extras?.setLearnModule("actions")} className="text-xs font-semibold text-[#191A23] dark:text-[#B9FF66] hover:underline flex items-center gap-1">
          <Info size={13} /> Aprenda sobre Botões de Ação
        </button>
        <div className="space-y-2.5 pt-1">
          {(ctaPresets ?? []).map((preset, idx) => {
            const isActive = idx === activeCtaIndex;
            return (
              <div
                key={preset.id}
                onClick={() => {
                  setActiveCtaIndex?.(idx);
                  setCtaPresets?.((prev: PresetCardItem[]) =>
                    prev.map((p: PresetCardItem, i: number) => ({ ...p, badge: i === idx ? "Ativo" : undefined }))
                  );
                  applyCta(preset.data);
                }}
                className={`relative flex items-center justify-between rounded-2xl border p-3.5 transition-all cursor-pointer ${
                  isActive
                    ? "border-sky-500 ring-2 ring-sky-500/20 bg-white dark:bg-card shadow-sm"
                    : "border-slate-200 dark:border-zinc-800 bg-white dark:bg-card hover:border-[#B9FF66] hover:bg-[#B9FF66]/10"
                }`}
              >
                {isActive && (
                  <span className="absolute -top-2.5 right-3 rounded-md bg-sky-500 px-2 py-0.5 text-[9px] font-extrabold text-white uppercase shadow-xs">
                    Ativo
                  </span>
                )}
                <div className="flex items-center gap-3">
                  <div className="flex h-11 w-11 shrink-0 flex-col items-center justify-center rounded-xl font-bold text-white shadow-xs" style={{ backgroundColor: preset.color }}>
                    <MousePointerClick size={18} fill="currentColor" />
                  </div>
                  <div>
                    <p className="text-xs font-bold text-[#191A23] dark:text-white">{preset.name}</p>
                    <p className="text-[10px] truncate max-w-40 text-slate-500 dark:text-zinc-400">{preset.data.ctaText as string}</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    const next = (ctaPresets ?? []).filter((_, i) => i !== idx);
                    setCtaPresets?.(next);
                    setActiveCtaIndex?.(Math.max(0, idx - 1));
                  }}
                  title="Excluir este botão"
                  aria-label="Excluir este botão"
                  className="grid size-7 shrink-0 place-items-center rounded-lg bg-[#B9FF66]/15 text-[#191A23] transition-colors hover:bg-red-50 hover:text-red-600 dark:text-[#B9FF66] dark:hover:bg-red-950/30 dark:hover:text-red-400"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            );
          })}
        </div>
        <button type="button" onClick={() => {
          const newCta: PresetCardItem = {
            id: `cta-${Date.now()}`,
            name: `Botão ${(ctaPresets ?? []).length + 1}`,
            color: ["#B9FF66", "#0066cc", "#ef4444", "#a855f7", "#10b981"][(ctaPresets ?? []).length % 5],
            data: { ctaText: "Quero aproveitar agora", ctaSubtitle: "🔒 Compra 100% Segura • Entrega Imediata", ctaBadges: "7 Dias de Garantia • Pix em 12x", ctaUrl: "https://", ctaNewTab: true, ctaPersist: true, ctaAutoScroll: false, ctaTextColor: "#191A23", ctaHoverTextColor: "#191A23", ctaBackground: "#B9FF66", ctaHoverBackground: "#a6ee50", ctaFontSize: 18, ctaRadius: 12, ctaPaddingY: 12, ctaPaddingX: 24, ctaPulse: false, ctaShadow: true },
          };
          setCtaPresets?.([...(ctaPresets ?? []), newCta]);
          setActiveCtaIndex?.((ctaPresets ?? []).length);
          applyCta(newCta.data);
        }} className="flex w-full min-h-11 items-center justify-center gap-2 rounded-2xl border-2 border-slate-200 dark:border-zinc-800 bg-white dark:bg-card text-xs font-bold text-[#191A23] dark:text-[#B9FF66] hover:bg-[#B9FF66]/10 hover:text-[#191A23] dark:hover:text-white cursor-pointer shadow-xs">
          + Adicionar outro Botão de Ação
        </button>
        <div className="border-t border-slate-200 dark:border-zinc-800 pt-4 space-y-4">
          <PanelTitle>Personalizar Botão Selecionado</PanelTitle>
          <TextInput label="Texto do Botão" value={c.ctaText} onChange={(v) => u("ctaText", v)} />
          <TextInput label="Subtítulo / Garantia abaixo do Botão" value={c.ctaSubtitle} placeholder="Ex: 🔒 Compra 100% Segura • Entrega Imediata" onChange={(v) => u("ctaSubtitle", v)} />
          <TextInput label="Selo de Segurança / Badges" value={c.ctaBadges} placeholder="Ex: 7 Dias de Garantia • Pix em 12x" onChange={(v) => u("ctaBadges", v)} />
          <TextInput label="Link de Destino" value={c.ctaUrl} onChange={(v) => u("ctaUrl", v)} />
          <TimeRange label="Exibir botão a partir de" value={c.ctaStart} max={Math.max(1, Math.floor(c.videoDuration || 1))} onChange={(v) => u("ctaStart", v)} />
          <TimeRange label="Ocultar botão em (0 = até o fim)" value={c.ctaEnd} max={Math.max(1, Math.floor(c.videoDuration || 1))} onChange={(v) => u("ctaEnd", v)} />
          <Segmented
            label="Posição do botão"
            value={c.ctaPosition ?? "bottom"}
            options={[
              { label: "Acima do vídeo", value: "top" },
              { label: "No meio do vídeo", value: "middle" },
              { label: "Abaixo do vídeo", value: "bottom" },
            ]}
            onChange={(v) => u("ctaPosition", v as StudioConfig["ctaPosition"])}
          />
          <CheckRow label="Abrir em nova aba" checked={c.ctaNewTab} onChange={(v) => u("ctaNewTab", v)} />
          <CheckRow label="Persistir após fechar" checked={c.ctaPersist} onChange={(v) => u("ctaPersist", v)} />
          <CheckRow label="Auto-scroll ao aparecer" checked={c.ctaAutoScroll} onChange={(v) => u("ctaAutoScroll", v)} />
          <CheckRow label="Fazer o botão pulsar" checked={c.ctaPulse} onChange={(v) => u("ctaPulse", v)} />
          <Color label="Cor do texto" value={c.ctaTextColor} onChange={(v) => u("ctaTextColor", v)} />
          <Color label="Cor do hover do texto" value={c.ctaHoverTextColor} onChange={(v) => u("ctaHoverTextColor", v)} />
          <Color label="Cor do botão" value={c.ctaBackground} onChange={(v) => u("ctaBackground", v)} />
          <Color label="Cor do hover do botão" value={c.ctaHoverBackground} onChange={(v) => u("ctaHoverBackground", v)} />
          <Range label="Tamanho da fonte" value={c.ctaFontSize} min={14} max={28} suffix="px" onChange={(v) => u("ctaFontSize", v)} />
          <Range label="Raio dos cantos" value={c.ctaRadius} min={0} max={28} suffix="px" onChange={(v) => u("ctaRadius", v)} />
          <Range label="Padding vertical" value={c.ctaPaddingY} min={8} max={24} suffix="px" onChange={(v) => u("ctaPaddingY", v)} />
          <Range label="Padding horizontal" value={c.ctaPaddingX} min={16} max={48} suffix="px" onChange={(v) => u("ctaPaddingX", v)} />
          <CheckRow label="Sombra no botão" checked={c.ctaShadow} onChange={(v) => u("ctaShadow", v)} />
        </div>
      </>
    );
  }
  if (module === "thumbnail") {
    const { thumbnailPresets, setThumbnailPresets, activeThumbnailIndex, setActiveThumbnailIndex } = extras ?? {};
    const applyThumb = (data: Record<string, unknown>) => {
      Object.entries(data).forEach(([k, v]) => u(k as keyof StudioConfig, v as StudioConfig[keyof StudioConfig]));
    };
    return (
      <>
        <p className="panel-help">Configure thumbnails diferentes para: inicial (antes do play), pausa (quando o usuário pausa) e final (quando o vídeo termina). O ThumbSniper troca automaticamente a capa baseada no estado do player.</p>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ImageIcon size={16} className="text-[#0066cc] dark:text-[#B9FF66]" />
            <h4 className="text-xs font-extrabold uppercase tracking-wider text-[#191A23] dark:text-white">
              ThumbSniper
            </h4>
          </div>
          <Switch checked={c.thumbnailEnabled} onChange={(v) => u("thumbnailEnabled", v)} />
        </div>
        <button type="button" onClick={() => extras?.setLearnModule("thumbnail")} className="text-xs font-semibold text-[#191A23] dark:text-[#B9FF66] hover:underline flex items-center gap-1">
          <Info size={13} /> Aprenda sobre ThumbSniper
        </button>
        <div className="space-y-2.5 pt-1">
          {(thumbnailPresets ?? []).map((preset, idx) => {
            const isActive = idx === activeThumbnailIndex;
            return (
              <div
                key={preset.id}
                onClick={() => {
                  setActiveThumbnailIndex?.(idx);
                  setThumbnailPresets?.((prev: PresetCardItem[]) =>
                    prev.map((p: PresetCardItem, i: number) => ({ ...p, badge: i === idx ? "Ativo" : undefined }))
                  );
                  applyThumb(preset.data);
                }}
                className={`relative flex items-center justify-between rounded-2xl border p-3.5 transition-all cursor-pointer ${
                  isActive
                    ? "border-sky-500 ring-2 ring-sky-500/20 bg-white dark:bg-card shadow-sm"
                    : "border-slate-200 dark:border-zinc-800 bg-white dark:bg-card hover:border-[#B9FF66] hover:bg-[#B9FF66]/10"
                }`}
              >
                {isActive && (
                  <span className="absolute -top-2.5 right-3 rounded-md bg-sky-500 px-2 py-0.5 text-[9px] font-extrabold text-white uppercase shadow-xs">
                    Ativo
                  </span>
                )}
                <div className="flex items-center gap-3">
                  <div className="flex h-11 w-11 shrink-0 flex-col items-center justify-center rounded-xl font-bold text-white shadow-xs" style={{ backgroundColor: preset.color }}>
                    <ImageIcon size={18} fill="currentColor" />
                  </div>
                  <div>
                    <p className="text-xs font-bold text-[#191A23] dark:text-white">{preset.name}</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    const next = (thumbnailPresets ?? []).filter((_, i) => i !== idx);
                    setThumbnailPresets?.(next);
                    setActiveThumbnailIndex?.(Math.max(0, idx - 1));
                  }}
                  title="Excluir este conjunto"
                  aria-label="Excluir este conjunto"
                  className="grid size-7 shrink-0 place-items-center rounded-lg bg-[#B9FF66]/15 text-[#191A23] transition-colors hover:bg-red-50 hover:text-red-600 dark:text-[#B9FF66] dark:hover:bg-red-950/30 dark:hover:text-red-400"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            );
          })}
        </div>
        <button type="button" onClick={() => {
          const newThumb: PresetCardItem = {
            id: `thumb-${Date.now()}`,
            name: `Thumbnail ${(thumbnailPresets ?? []).length + 1}`,
            color: ["#B9FF66", "#0066cc", "#ef4444", "#a855f7", "#10b981"][(thumbnailPresets ?? []).length % 5],
            data: { thumbnailEnabled: true, thumbnailStartName: "", thumbnailPauseName: "", thumbnailEndName: "" },
          };
          setThumbnailPresets?.([...(thumbnailPresets ?? []), newThumb]);
          setActiveThumbnailIndex?.((thumbnailPresets ?? []).length);
          applyThumb(newThumb.data);
        }} className="flex w-full min-h-11 items-center justify-center gap-2 rounded-2xl border-2 border-slate-200 dark:border-zinc-800 bg-white dark:bg-card text-xs font-bold text-[#191A23] dark:text-[#B9FF66] hover:bg-[#B9FF66]/10 hover:text-[#191A23] dark:hover:text-white cursor-pointer shadow-xs">
          + Adicionar Thumbnail Set
        </button>
        <div className="border-t border-slate-200 dark:border-zinc-800 pt-4 space-y-4">
          <PanelTitle>Uploads do Thumbnail Ativo</PanelTitle>
          <UploadBox
            label="Thumbnail inicial (capa do vídeo)"
            selectedName={c.thumbnailStartName || (c.assets.thumbnailStart ? "Thumbnail salva" : "")}
            accept="image/*"
            onFile={(file) => { onPoster(file, "start"); u("thumbnailStartName", file.name); u("thumbnailEnabled", true); }}
          />
          <UploadBox
            label="Thumbnail de pausa (quando usuário pausa)"
            selectedName={c.thumbnailPauseName || (c.assets.thumbnailPause ? "Thumbnail salva" : "")}
            accept="image/*"
            onFile={(file) => { onPoster(file, "pause"); u("thumbnailPauseName", file.name); }}
          />
          <UploadBox
            label="Thumbnail final (quando vídeo termina)"
            selectedName={c.thumbnailEndName || (c.assets.thumbnailEnd ? "Thumbnail salva" : "")}
            accept="image/*"
            onFile={(file) => { onPoster(file, "end"); u("thumbnailEndName", file.name); }}
          />
        </div>
      </>
    );
  }
  if (module === "resume") return <TextArea label="Mensagem" value={c.resumeMessage} onChange={(v) => u("resumeMessage", v)} />;
  if (module === "pixels") return <PixelTrackingPanel config={c} update={u} playerId={playerId} videoId={videoId} />;
  if (module === "protection") return <ProtectionPanel config={c} update={u} />;
  if (module === "captions") return <UploadBox label={c.captionName || "Upload de legenda WebVTT"} accept=".vtt,text/vtt" onFile={(file) => { onCaption(file); u("captionName", file.name); u("captionsEnabled", true); }} />;
  return <><CheckRow label="Começar sem som" checked={c.muted} onChange={(v) => u("muted", v)} /><CheckRow label="Recomeçar após o fim" checked={c.loop} onChange={(v) => u("loop", v)} /></>;
}

function PanelTitle({ children }: { children: React.ReactNode }) { return <h3 className="border-t border-black/10 dark:border-white/10 pt-5 text-[15px] font-semibold">{children}</h3>; }

function Switch({ checked, onChange }: { checked: boolean; onChange: (value: boolean) => void }) { return <button type="button" onClick={() => onChange(!checked)} className={`ml-auto h-6 w-11 rounded-full p-1 cursor-pointer ${checked ? "bg-[#B9FF66]" : "bg-slate-300 dark:bg-zinc-700"}`}><span className={`block h-4 w-4 rounded-full bg-[#191A23] transition-transform ${checked ? "translate-x-5" : ""}`} /></button>; }
function ControlIcon({ label }: { label: string }) {
  const normalized = label.toLowerCase();
  const Icon = normalized.includes("paus") ? PauseCircle : normalized.includes("progres") ? Gauge : normalized.includes("tempo") ? Clock3 : normalized.includes("voltar") ? Rewind : normalized.includes("avanç") ? FastForward : normalized.includes("volume") || normalized.includes("som") ? Volume2 : normalized.includes("fullscreen") ? Maximize : normalized.includes("picture") ? PictureInPicture2 : normalized.includes("veloc") ? Gauge : normalized.includes("desktop") ? MonitorPlay : normalized.includes("prote") || normalized.includes("token") || normalized.includes("vpn") || normalized.includes("chave") ? LockKeyhole : Play;
  return <Icon size={17} strokeWidth={1.8} className="shrink-0 text-[#191A23] dark:text-[#B9FF66]" aria-hidden="true" />;
}
function CheckRow({ label, checked, onChange }: { label: string; checked: boolean; onChange: (value: boolean) => void }) { return <label className="flex min-h-11 items-center gap-3 rounded-[11px] bg-slate-100 dark:bg-card px-3 text-[14px] cursor-pointer"><ControlIcon label={label} /><span className="flex-1 font-medium">{label}</span><input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="h-4 w-4 accent-[#B9FF66]" /></label>; }
function Color({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) { return <label className="block text-[14px] font-semibold">{label}<div className="mt-2 flex gap-2"><input type="color" value={value} onChange={(e) => onChange(e.target.value)} className="h-10 w-14 rounded-lg cursor-pointer border border-slate-200 dark:border-zinc-800" /><input value={value} onChange={(e) => onChange(e.target.value)} className="studio-input h-10 rounded-xl border border-slate-200 dark:border-zinc-800 px-3 text-xs font-medium" /></div></label>; }
function Segmented({ label, value, options, onChange }: { label: string; value: string; options: Array<{ label: string; value: string }>; onChange: (value: string) => void }) { return <fieldset><legend className="mb-2 text-[14px] font-semibold">{label}</legend><div className="grid grid-cols-2 gap-1 rounded-[11px] bg-slate-100 p-1 dark:bg-card">{options.map((option) => <button key={option.value} type="button" onClick={() => onChange(option.value)} className={`min-h-9 rounded-[8px] px-2 text-[12px] font-semibold transition cursor-pointer ${value === option.value ? "bg-[#B9FF66] text-[#191A23] font-bold shadow-xs" : "text-slate-600 dark:text-zinc-400"}`}>{option.label}</button>)}</div></fieldset>; }
function Range({ label, value, min, max, step = 1, suffix, onChange }: { label: string; value: number; min: number; max: number; step?: number; suffix: string; onChange: (value: number) => void }) { return <label className="block text-[14px] font-semibold">{label}<span className="float-right text-[12px] font-bold text-[#191A23] dark:text-[#B9FF66]">{value}{suffix}</span><input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} className="mt-3 w-full accent-[#B9FF66]" /></label>; }
function formatPlayerTime(value: number) { const seconds = Math.max(0, Math.floor(Number.isFinite(value) ? value : 0)); return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`; }

/**
 * Detecta MP4 com `moov` depois do `mdat` (sem faststart): o navegador baixa o
 * arquivo inteiro antes do primeiro frame - a causa mais comum de VSL que
 * "demora para aparecer". Lê só o primeiro chunk (Range) e falha em silêncio.
 */
async function probeMoovPosition(url: string): Promise<"late" | "early" | "unknown"> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    const response = await fetch(url, { headers: { Range: "bytes=0-131071" }, signal: controller.signal });
    clearTimeout(timer);
    if (!response.ok && response.status !== 206) return "unknown";
    const reader = response.body?.getReader();
    if (!reader) return "unknown";
    const { value } = await reader.read();
    await reader.cancel().catch(() => undefined);
    const buf = value ?? new Uint8Array(0);
    if (buf.length < 8) return "unknown";
    const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
    let offset = 0;
    let sawMdat = false;
    while (offset + 8 <= buf.length) {
      const size = view.getUint32(offset);
      const type = String.fromCharCode(buf[offset + 4], buf[offset + 5], buf[offset + 6], buf[offset + 7]);
      if (type === "moov") return sawMdat ? "late" : "early";
      if (type === "mdat") sawMdat = true;
      let step = size;
      if (size === 1) {
        if (offset + 16 > buf.length) break;
        const big = view.getBigUint64(offset + 8);
        if (big < BigInt(16) || big > BigInt(Number.MAX_SAFE_INTEGER)) break;
        step = Number(big);
      } else if (size === 0) {
        return sawMdat ? "late" : "unknown";
      }
      if (step < 8) break;
      offset += step;
      if (offset >= buf.length) return sawMdat ? "late" : "unknown";
    }
    return sawMdat ? "late" : "unknown";
  } catch {
    return "unknown";
  }
}
function TimeRange({ label, value, max, onChange }: { label: string; value: number; max: number; onChange: (value: number) => void }) { const safeValue = Math.min(Math.max(0, value), max); return <label className="block text-[14px] font-semibold">{label}<span className="float-right rounded-full bg-[#B9FF66] px-2.5 py-0.5 text-[11px] font-bold text-[#191A23]">{formatPlayerTime(safeValue)} / {formatPlayerTime(max)}</span><input type="range" min={0} max={max} step={1} value={safeValue} onChange={(e) => onChange(Number(e.target.value))} className="mt-4 w-full accent-[#B9FF66]" /></label>; }
function TextInput({ label, value, placeholder, onChange }: { label: string; value?: string; placeholder?: string; onChange?: (value: string) => void }) { return <label className="block text-[14px] font-semibold">{label}<input value={value ?? ""} placeholder={placeholder} onChange={(e) => onChange?.(e.target.value)} className="studio-input mt-1.5 h-10 w-full rounded-xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-card px-3.5 text-xs font-medium text-[#191A23] dark:text-white outline-none focus:border-[#B9FF66]" /></label>; }
function TextArea({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) { return <label className="block text-[14px] font-semibold">{label}<textarea rows={3} value={value} onChange={(e) => onChange(e.target.value)} className="studio-input mt-1.5 w-full rounded-xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-card p-3 text-xs font-medium text-[#191A23] dark:text-white outline-none focus:border-[#B9FF66]" /></label>; }
function Select({ label, value, options, onChange }: { label: string; value: string; options: Array<string | { value: string; label: string }>; onChange: (value: string) => void }) { return <div className="block text-[14px] font-semibold"><span className="mb-1.5 block">{label}</span><AdminSelect label={label} value={value} onChange={onChange} options={options.map((option) => (typeof option === "string" ? { value: option, label: option } : option))} /></div>; }
function UploadBox({ label, selectedName, accept, onFile }: { label: string; selectedName?: string; accept: string; onFile: (file: File) => void }) { return <label className={`flex min-h-36 cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed px-4 text-center transition-colors ${selectedName ? "border-[#B9FF66] bg-[#B9FF66]/10" : "border-slate-300 dark:border-zinc-700 bg-slate-50 dark:bg-card"}`}><Subtitles size={24} className={`mb-2 ${selectedName ? "text-[#191A23] dark:text-[#B9FF66]" : "text-slate-400"}`} /><span className="text-[13px] font-bold">{label}</span>{selectedName ? <span className="mt-1 text-[11px] font-bold text-emerald-600 dark:text-emerald-400">✓ {selectedName}</span> : <span className="mt-1 text-[11px] text-slate-400">Clique para selecionar</span>}<input type="file" accept={accept} className="sr-only" onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} /></label>; }
