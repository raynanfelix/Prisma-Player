const base = (process.env.NEXT_PUBLIC_SITE_URL || "https://prisma-player.vercel.app").replace(/\/$/, "");

/**
 * GET /api/openapi.json - OpenAPI 3.1 da superfície PÚBLICA da API (item 4 do
 * relatório "Is Agentic" / Ora). Documento deliberadamente honesto: descreve
 * apenas o que é alcançável sem sessão de conta. Os endpoints de embed exigem
 * o contexto de origem do próprio player (token de origem assinado + cookie de
 * render pp_embed) - não são uma API de chave pública. Toda a API autenticada
 * (/api/account/*, /api/videos/*, /api/billing/*, /api/analytics internos)
 * responde 401 fora da sessão e está fora deste documento.
 */
const document = {
  openapi: "3.1.0",
  info: {
    title: "Prisma Player - API pública",
    version: "1.0.0",
    description:
      "Superfície pública do Prisma Player (player de VSL com Pitch Delay, analytics de retenção e testes A/B). " +
      "Não requer autenticação de conta; os endpoints de embed validam o contexto de origem do player publicado.",
  },
  servers: [{ url: base, description: "Produção (configurável via NEXT_PUBLIC_SITE_URL)" }],
  paths: {
    "/api/health": {
      get: {
        summary: "Liveness da plataforma",
        description: "Monitor de uptime. Não consulta o banco - detecta queda da função/plataforma.",
        operationId: "getHealth",
        responses: {
          "200": {
            description: "Plataforma no ar",
            content: { "application/json": { schema: { type: "object", properties: { ok: { type: "boolean", const: true } }, required: ["ok"] } } },
          },
        },
      },
    },
    "/api/embed/{id}": {
      get: {
        summary: "Configuração do player para render no embed",
        description:
          "Retorna a configuração dinâmica do player publicado (cores, autoplay, Pitch Delay, teste A/B ativo). " +
          "Exige o contexto de origem do embed (token de origem assinado e cookie de render pp_embed emitidos ao " +
          "carregar /embed/{id} em um navegador real); não é uma API de chave pública.",
        operationId: "getEmbedConfig",
        parameters: [{ name: "id", in: "path", required: true, description: "ID do player (UUID)", schema: { type: "string", format: "uuid" } }],
        responses: {
          "200": { description: "Configuração do player", content: { "application/json": { schema: { type: "object" } } } },
          "401": { description: "Contexto de origem ausente ou inválido" },
          "402": { description: "Assinatura do titular sem acesso (pausa/cancelamento)" },
          "403": { description: "Origem/domínio não permitido para este player" },
          "404": { description: "Player não publicado ou inexistente" },
        },
      },
    },
    "/api/embed/{id}/manifest": {
      get: {
        summary: "Manifest de reprodução do embed",
        description: "Manifest (fontes de vídeo assinadas de curta duração, faixas e configuração) consumido pelo player no iframe do embed.",
        operationId: "getEmbedManifest",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } }],
        responses: {
          "200": { description: "Manifest de reprodução", content: { "application/json": { schema: { type: "object" } } } },
          "401": { description: "Contexto de origem ausente ou inválido" },
          "402": { description: "Sem acesso pago ao player" },
          "403": { description: "Origem/dominio não permitido" },
          "404": { description: "Player inexistente" },
        },
      },
    },
    "/api/embed/{id}/session": {
      post: {
        summary: "Mint do token de sessão do DRM",
        description:
          "Emite token de sessão assinado (camada adicional do toggle 'Exigir Token Assinado por Sessão'). " +
          "Mesmo pipeline de origem do embed: token de origem + header Origin/Referer coerente + cookie de render.",
        operationId: "postEmbedSession",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } }],
        responses: {
          "200": { description: "Token de sessão emitido", content: { "application/json": { schema: { type: "object" } } } },
          "403": { description: "Token de origem inválido, origem divergente ou render não confirmado" },
          "404": { description: "ID inválido" },
        },
      },
    },
    "/api/ab-events": {
      post: {
        summary: "Registro de eventos de teste A/B",
        description:
          "Eventos do player em teste A/B (impression, play, progress, complete) enviados pelo embed same-origin. " +
          "Valida origem e limita por sessão (120/min).",
        operationId: "postAbEvent",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  testId: { type: "string", format: "uuid" },
                  variantId: { type: "string", format: "uuid" },
                  sessionId: { type: "string", format: "uuid" },
                  eventType: { type: "string", enum: ["impression", "play", "progress", "complete"] },
                  progressPercent: { type: "integer", enum: [0, 25, 50, 75, 100] },
                  watchedSeconds: { type: "number" },
                },
                required: ["testId", "variantId", "sessionId", "eventType"],
              },
            },
          },
        },
        responses: {
          "200": { description: "Evento aceito" },
          "400": { description: "Evento inválido" },
          "403": { description: "Origem inválida" },
          "429": { description: "Limite por sessão excedido" },
        },
      },
    },
    "/llms.txt": {
      get: {
        summary: "Índice do site para agentes de IA",
        description: "Descrição do produto, quando usar e links principais, no formato llms.txt (text/plain).",
        operationId: "getLlmsTxt",
        responses: { "200": { description: "Índice llms.txt", content: { "text/plain": { schema: { type: "string" } } } } },
      },
    },
    "/api/markdown": {
      get: {
        summary: "Versão Markdown das páginas públicas",
        description:
          "Conteúdo Markdown (text/markdown) de uma página pública (?path=/, /pricing, /services, /about, /privacy, /terms, /cookies, /contact, /developers). " +
          "O proxy do site faz essa negociação automaticamente quando a requisição pede Accept: text/markdown.",
        operationId: "getMarkdownPage",
        parameters: [{ name: "path", in: "query", required: false, schema: { type: "string" }, description: "Caminho da página pública (default: /)" }],
        responses: {
          "200": { description: "Página em Markdown", content: { "text/markdown": { schema: { type: "string" } } } },
          "404": { description: "Caminho desconhecido (corpo em Markdown)" },
        },
      },
    },
  },
  "x-note":
    "APIs de conta, vídeos, billing e analytics internos exigem sessão autenticada (Better Auth/Neon) e respondem 401 fora dela - não fazem parte desta especificação pública.",
} as const;

export function GET() {
  return Response.json(document, {
    headers: { "cache-control": "public, max-age=3600" },
  });
}
