"use client";

interface AutoplayOverlayProps {
  message: string;
  textColor: string;
  background: string;
  radius: number;
  tagBadge?: string | null;
  coverUrl?: string | null;
  overlayOpacity?: number;
  animClass?: string;
  onActivate: () => void;
}

/**
 * Overlay do Smart Autoplay™: mesma marcação no preview do Studio e no embed
 * publicado (fundo, capa GIF/imagem, selo, mensagem e dica de áudio).
 */
export default function AutoplayOverlay({
  message,
  textColor,
  background,
  radius,
  tagBadge,
  coverUrl,
  overlayOpacity = 90,
  animClass = "",
  onActivate,
}: AutoplayOverlayProps) {
  return (
    <div
      className="absolute inset-0 z-30 flex items-center justify-center overflow-hidden p-4 backdrop-blur-xs"
      style={{ backgroundColor: `rgba(0,0,0,${Number(overlayOpacity ?? 90) / 100})` }}
    >
      {coverUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={coverUrl} alt="" aria-hidden className="absolute inset-0 h-full w-full object-cover" />
      ) : null}
      <button
        type="button"
        onClick={onActivate}
        className={`relative flex flex-col items-center justify-center gap-2 p-5 text-center transition-transform active:scale-95 cursor-pointer ${animClass}`}
        style={{
          color: textColor,
          backgroundColor: background,
          borderRadius: `${Number(radius) || 0}px`,
          boxShadow: "0 10px 30px rgba(0,0,0,0.3)",
        }}
      >
        {tagBadge ? (
          <span className="rounded-full bg-black/20 px-2.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wider">
            {tagBadge}
          </span>
        ) : null}
        <span className="text-sm font-extrabold tracking-tight">{message}</span>
        <span className="text-[11px] opacity-80 flex items-center gap-1 font-semibold">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M11 5 6 9H2v6h4l5 4z" />
            <path d="M15.5 8.5a5 5 0 0 1 0 7" />
          </svg>
          toque para ativar o áudio
        </span>
      </button>
    </div>
  );
}
