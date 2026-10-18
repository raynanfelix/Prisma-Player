import Image from "next/image";

import type { StoreApp } from "./store-data";

/**
 * Marca visual do card/detalhe no Marketplace: logos oficiais de src/assets
 * via import estático. A imagem preenche praticamente todo o box (padding
 * mínimo) — logos pequenas ficam visíveis.
 */

export function AppMark({ app, large = false }: { app: StoreApp; large?: boolean }) {
  const box = large ? "size-20 rounded-2xl p-1" : "size-12 rounded-xl p-0.5";
  return (
    <span className={`grid ${box} shrink-0 place-items-center border bg-white text-[#191A23] dark:bg-white/95 dark:text-white`}>
      {app.logo ? (
        <Image src={app.logo} alt="" className="size-full object-contain" />
      ) : null}
    </span>
  );
}
