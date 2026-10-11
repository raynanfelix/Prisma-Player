"use client";

interface HeadlineBlockProps {
  tagBadge?: string | null;
  headline: string;
  color: string;
  background: string;
  fontSize: number;
  align: string;
  playerRadius: number;
  format?: string;
  desktopUrl?: string;
  mobileUrl?: string;
}

/**
 * Headline única do player: mesma marcação no preview do Studio e no embed
 * publicado. Tamanho e raio seguem a mesma trava nos dois lugares.
 */
export default function HeadlineBlock({
  tagBadge,
  headline,
  color,
  background,
  fontSize,
  align,
  playerRadius,
  format,
  desktopUrl,
  mobileUrl,
}: HeadlineBlockProps) {
  if (format === "image" && (desktopUrl || mobileUrl)) {
    return (
      <picture className="mx-auto mb-3 block max-h-[112px] max-w-2xl shrink-0 overflow-hidden">
        <source media="(max-width: 767px)" srcSet={mobileUrl || desktopUrl} />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={desktopUrl || mobileUrl} alt="" aria-hidden={false} className="block h-full max-h-[112px] w-full object-contain" />
      </picture>
    );
  }
  return (
    <div className="mb-4 flex flex-col items-center justify-center text-center space-y-1">
      {tagBadge ? (
        <span className="rounded-full bg-[#191A23] px-3 py-0.5 text-[10px] font-extrabold text-[#B9FF66] border border-[#B9FF66]">
          {tagBadge}
        </span>
      ) : null}
      <h2
        className="mx-auto w-fit max-w-2xl px-4 py-2 font-extrabold leading-tight tracking-tight"
        style={{
          color,
          backgroundColor: background,
          fontSize: `${Math.min(Number(fontSize) || 30, 32)}px`,
          textAlign: (align || "center") as "left" | "center" | "right",
          borderRadius: `${Math.min(Number(playerRadius) || 0, 16)}px`,
        }}
      >
        {headline}
      </h2>
    </div>
  );
}
