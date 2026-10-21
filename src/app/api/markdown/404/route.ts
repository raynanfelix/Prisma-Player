import { markdownNotFoundBody } from "@/lib/markdown/pages";
import { markdownResponse } from "@/lib/markdown/respond";

/**
 * GET /api/markdown/404?path=X - destino do rewrite do proxy quando um agente
 * pede `text/markdown` para um caminho desconhecido (item 1/2 do relatório
 * "Is Agentic" / Ora): status 404 + corpo Markdown explicando que a página
 * não existe, com links de descoberta (/ , /llms.txt, /sitemap.xml).
 *
 * É sempre 404 por contrato: o proxy só manda para cá caminhos que não estão
 * no mapa de páginas públicas. Resposta sem segredos e sem dados de usuário.
 */
export function GET(request: Request) {
  const path = new URL(request.url).searchParams.get("path") ?? "/";
  return markdownResponse(markdownNotFoundBody(path), 404, "no-store");
}
