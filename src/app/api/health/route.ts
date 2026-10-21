import { NextResponse } from "next/server";

import { API_VERSION } from "@/lib/api/version";

/**
 * Liveness público para monitor de uptime (Plano H da análise de escala).
 *
 * Deliberadamente NÃO consulta o banco: o objetivo é detectar queda da
 * plataforma (função/edge fora do ar), não da Neon. Monitorar o banco aqui
 * manteria o compute acordado (queimando horas) e derrubaria o health
 * durante o scale-to-zero - falso positivo. A Neon é monitorada
 * indiretamente: um ping que ATIVE o embed (/api/embed de um player de
 * teste, ver DEPLOY.md) valida a cadeia completa quando desejado.
 */
export function GET() {
  return NextResponse.json(
    { ok: true },
    // X-API-Version (item 3 da spec Agentic v2): prova, em produção, a mesma
    // versão de data que o /api/openapi.json declara em info.version.
    { headers: { "cache-control": "no-store", "x-api-version": API_VERSION } },
  );
}
