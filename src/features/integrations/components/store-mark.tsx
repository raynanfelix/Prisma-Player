import Image from "next/image";

import type { StoreApp } from "./store-data";

/**
 * Marca visual do card/detalhe no Marketplace: logos oficiais de
 * src/assets, ícones lucide para os apps de produto e um SVG inline de
 * globo+check para "Domínios autorizados" (nenhum arquivo novo).
 */

export function GlobeShieldMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18" />
      <path d="M12 3c2.6 2.6 3.6 5.7 3.6 9s-1 6.4-3.6 9c-2.6-2.6-3.6-5.7-3.6-9s1-6.4 3.6-9z" />
      <path d="m9 12 2 2 4-4.5" />
    </svg>
  );
}

export function AppMark({ app, large = false }: { app: StoreApp; large?: boolean }) {
  const box = large ? "size-14 rounded-2xl p-2.5" : "size-9 rounded-xl p-1.5";
  return (
    <span className={`grid ${box} shrink-0 place-items-center border bg-white text-[#191A23] dark:bg-white/95 dark:text-white`}>
      {app.kind === "provider" && app.logo ? (
        <Image src={app.logo} alt="" width={large ? 40 : 24} height={large ? 40 : 24} className={large ? "size-10 object-contain" : "size-6 object-contain"} />
      ) : app.kind === "feature" && app.globeShield ? (
        <GlobeShieldMark className={large ? "size-8" : "size-5"} />
      ) : app.icon ? (
        <app.icon className={large ? "size-8" : "size-5"} aria-hidden />
      ) : null}
    </span>
  );
}
