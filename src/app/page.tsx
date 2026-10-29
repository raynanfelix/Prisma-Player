import { permanentRedirect } from "next/navigation";

import { MARKETING_URL } from "@/lib/site";

/**
 * Este repositório é SÓ a aplicação (app.prismaplayer.online): o site de
 * vendas vive no repo da landing, servido em prismaplayer.online. A raiz
 * do app redireciona para lá (308 permanente - o conteúdo não volta).
 */
export default function Home() {
  permanentRedirect(MARKETING_URL);
}
