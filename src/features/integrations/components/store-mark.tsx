import Image from "next/image";

import type { StoreApp } from "./store-data";

/**
 * Marca visual do card/detalhe no Marketplace: logo oficial pura, sem fundo
 * e sem borda (o quadrado branco "bugava" logos pretas como a do TikTok).
 * A imagem ocupa o box inteiro, sem vazamento.
 */

export function AppMark({ app, large = false }: { app: StoreApp; large?: boolean }) {
  const size = large ? "size-24" : "size-14";
  return (
    <span className={`${size} grid shrink-0 place-items-center`}>
      {app.logo ? <Image src={app.logo} alt="" className="size-full object-contain" /> : null}
    </span>
  );
}
