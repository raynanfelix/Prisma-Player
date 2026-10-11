"use client";

import { useEffect, useMemo, useRef, useSyncExternalStore } from "react";
import createGlobe from "cobe";

export type AudienceCountry = { name: string; impressions: number; plays: number };

const COUNTRY_COORDINATES: Record<string, [number, number]> = {
  BR: [-14.24, -51.93], US: [37.09, -95.71], CA: [56.13, -106.35], MX: [23.63, -102.55],
  AR: [-38.42, -63.62], CL: [-35.68, -71.54], CO: [4.57, -74.3], PE: [-9.19, -75.02],
  PT: [39.4, -8.22], ES: [40.46, -3.75], FR: [46.23, 2.21], DE: [51.17, 10.45],
  GB: [55.38, -3.44], IT: [41.87, 12.57], NL: [52.13, 5.29], IE: [53.14, -7.69],
  IN: [20.59, 78.96], JP: [36.2, 138.25], CN: [35.86, 104.2], SG: [1.35, 103.82],
  AU: [-25.27, 133.78], ZA: [-30.56, 22.94], AO: [-11.2, 17.87], MZ: [-18.67, 35.53],
};

export default function AudienceGlobe({ countries, live }: { countries: AudienceCountry[]; live: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pointer = useRef<number | null>(null);
  const drag = useRef(0);
  const markers = useMemo(() => countries
    .filter((country) => COUNTRY_COORDINATES[country.name.toUpperCase()])
    .slice(0, 24)
    .map((country) => ({
      location: COUNTRY_COORDINATES[country.name.toUpperCase()],
      size: Math.min(0.13, 0.035 + Math.log10(country.impressions + 1) * 0.025),
    })), [countries]);
  const darkMode = useSyncExternalStore(
    (onChange) => {
      const observer = new MutationObserver(onChange);
      observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
      return () => observer.disconnect();
    },
    () => document.documentElement.classList.contains("dark"),
    () => false,
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let phi = 0;
    let width = Math.max(1, canvas.offsetWidth);
    const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
    const globe = createGlobe(canvas, {
      devicePixelRatio: pixelRatio, width: width * pixelRatio, height: width * pixelRatio,
      phi: 0, theta: 0.18, dark: darkMode ? 1 : 0, diffuse: 1.25, mapSamples: 16000, mapBrightness: darkMode ? 4.2 : 7,
      baseColor: darkMode ? [0.12, 0.17, 0.27] : [0.94, 0.97, 1], markerColor: [0, 0.4, 0.8], glowColor: darkMode ? [0.04, 0.09, 0.18] : [0.82, 0.9, 1], markers,
      onRender: (state) => {
        if (pointer.current === null) phi += 0.003;
        state.phi = phi + drag.current;
        state.width = width * pixelRatio;
        state.height = width * pixelRatio;
      },
    });
    const resize = new ResizeObserver(([entry]) => { width = Math.max(1, Math.floor(entry.contentRect.width)); });
    resize.observe(canvas);
    return () => { resize.disconnect(); globe.destroy(); };
  }, [darkMode, markers]);

  return <div className="relative mx-auto aspect-square min-w-0 w-full max-w-[460px] select-none overflow-hidden">
    <canvas ref={canvasRef} className="block aspect-square h-auto w-full max-w-full cursor-grab touch-none active:cursor-grabbing" onPointerDown={(event) => { pointer.current = event.clientX; }} onPointerMove={(event) => { if (pointer.current !== null) { const delta = event.clientX - pointer.current; drag.current += delta / 220; pointer.current = event.clientX; } }} onPointerUp={() => { pointer.current = null; }} onPointerLeave={() => { pointer.current = null; }} />
    <div className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/70 bg-white/85 px-4 py-2 text-center shadow-lg backdrop-blur-xl dark:border-white/15 dark:bg-[#0b1020]/85">
      <strong className="block text-[22px] tracking-[-.04em] text-[#1d1d1f] dark:text-white">{live}</strong><span className="text-[10px] font-semibold uppercase tracking-[.12em] text-slate-500 dark:text-slate-300">ao vivo</span>
    </div>
  </div>;
}
