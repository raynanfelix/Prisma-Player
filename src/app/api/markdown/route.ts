import { getMarkdownPage, markdownNotFoundBody } from "@/lib/markdown/pages";
import { markdownResponse } from "@/lib/markdown/respond";

/**
 * GET /api/markdown?path=X - versão Markdown das páginas públicas para
 * agentes de IA (item 2 do relatório "Is Agentic" / Ora). O proxy reescreve
 * para cá quando o header `accept` pede `text/markdown` e o caminho é uma
 * página pública conhecida; chamadas diretas também funcionam.
 *
 * Stateless e público: sem segredos, sem dados de usuário, sem banco.
 * Path desconhecido devolve 404 em Markdown (mesmo contrato do
 * /api/markdown/404).
 */
export function GET(request: Request) {
  const path = new URL(request.url).searchParams.get("path") ?? "/";
  const body = getMarkdownPage(path);
  if (body === null) {
    return markdownResponse(markdownNotFoundBody(path), 404, "no-store");
  }
  return markdownResponse(body, 200, "public, max-age=300");
}
