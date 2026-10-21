import { NextResponse } from "next/server";

/**
 * Resposta Markdown comum aos handlers /api/markdown (200) e /api/markdown/404
 * (404) - item 2 do relatório "Is Agentic" / Ora.
 *
 * `Vary: Accept` é sempre setado (não appendado): aqui a resposta É o resultado
 * da negociação e o handler é o único dono da resposta - sem outros valores
 * de Vary para preservar. Cache-Control é responsabilidade de quem chama
 * (200 pode cachear 300s; 404 não deve cachear). Headers extras (ex.:
 * X-API-Version) são opcionais e ficam a cargo do chamador.
 */
export function markdownResponse(body: string, status: 200 | 404, cacheControl: string, extraHeaders?: Record<string, string>): NextResponse {
  return new NextResponse(body, {
    status,
    headers: {
      "content-type": "text/markdown; charset=utf-8",
      vary: "Accept",
      "cache-control": cacheControl,
      ...extraHeaders,
    },
  });
}
