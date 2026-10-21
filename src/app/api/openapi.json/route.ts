import { API_VERSION } from "@/lib/api/version";

const base = (process.env.NEXT_PUBLIC_SITE_URL || "https://prisma-player.vercel.app").replace(/\/$/, "");

/**
 * GET /api/openapi.json - OpenAPI 3.1 da superfície PÚBLICA da API (item 4 do
 * relatório "Is Agentic" / Ora). Documento deliberadamente honesto: descreve
 * apenas o que é alcançável sem sessão de conta. Os endpoints de embed exigem
 * o contexto de origem do próprio player (token de origem assinado + cookie de
 * render pp_embed) - não são uma API de chave pública. Toda a API autenticada
 * (/api/account/*, /api/videos/*, /api/billing/*, /api/analytics internos)
 * responde 401 fora da sessão e está fora deste documento.
 *
 * Item 3 da spec Agentic v2: erros tipados com components.schemas.Error
 * (o corpo real das rotas é {error: código} e, quando existe, message/hint -
 * por isso só `error` é required no schema), versão por data em info.version
 * e header X-API-Version nas respostas públicas baratas.
 */
const errorSchemaRef = { $ref: "#/components/schemas/Error" };

const errorResponse = (description: string) => ({
  description,
  content: { "application/json": { schema: errorSchemaRef } },
});

const document = {
  openapi: "3.1.0",
  info: {
    title: "Prisma Player - API pública",
    version: API_VERSION,
    description:
      "Superfície pública do Prisma Player (player de VSL com Pitch Delay, analytics de retenção e testes A/B). " +
      "Não requer autenticação de conta; os endpoints de embed validam o contexto de origem do player publicado.\n\n" +
      "POLÍTICA DE VERSÃO: a versão é uma data e viaja no header `X-API-Version` das respostas públicas baratas " +
      "(/api/health, /api/markdown, /api/openapi.json), igual a info.version deste documento. Breaking changes exigem " +
      "aviso prévio de 90 dias, sinalizado pelo header `Sunset` e anunciado no changelog em /developers; nunca entram " +
      "sem esse aviso. Não existe versão /v1 no path hoje porque a superfície pública é estável e pequena.\n\n" +
      "CONTRATO DE ERROS: toda resposta de erro JSON segue components.schemas.Error (código machine-readable em " +
      "`error`; `message` humano e `hint` quando existem). Endpoints /api/* desconhecidos respondem 404 JSON " +
      "(error: not_found) apontando para este documento. Respostas 429 trazem os headers RateLimit-Limit, " +
      "RateLimit-Remaining: 0, RateLimit-Reset (epoch do fim da janela) e Retry-After.",
  },
  servers: [{ url: base, description: "Produção (configurável via NEXT_PUBLIC_SITE_URL)" }],
  components: {
    schemas: {
      Error: {
        type: "object",
        description:
          "Erro da API. `error` é o código machine-readable (ex.: not_found, rate_limited, invalid_origin); " +
          "`message` é texto humano quando a rota o fornece; `hint` orienta o chamador quando aplicável.",
        properties: {
          error: { type: "string", description: "Código machine-readable do erro" },
          message: { type: "string", description: "Mensagem humana, quando a rota a fornece" },
          hint: { type: "string", description: "Dica de resolução, quando aplicável" },
        },
        required: ["error"],
        examples: [
          {
            error: "not_found",
            message: "Endpoint inexistente.",
            hint: "Veja /api/openapi.json para a lista de endpoints públicos",
          },
        ],
      },
    },
  },
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
          "401": errorResponse("Contexto de origem ausente ou inválido"),
          "402": errorResponse("Assinatura do titular sem acesso (pausa/cancelamento)"),
          "403": errorResponse("Origem/domínio não permitido para este player"),
          "404": errorResponse("Player não publicado ou inexistente"),
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
          "401": errorResponse("Contexto de origem ausente ou inválido"),
          "402": errorResponse("Sem acesso pago ao player"),
          "403": errorResponse("Origem/dominio não permitido"),
          "404": errorResponse("Player inexistente"),
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
          "403": errorResponse("Token de origem inválido, origem divergente ou render não confirmado"),
          "404": errorResponse("ID inválido"),
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
          "400": errorResponse("Evento inválido"),
          "403": errorResponse("Origem inválida"),
          "404": errorResponse("Variante do teste não encontrada"),
          "409": errorResponse("Teste ou vídeo não estão ativos/prontos"),
          "429": errorResponse("Limite por sessão excedido"),
          "500": errorResponse("Falha ao registrar o evento"),
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
    headers: {
      "cache-control": "public, max-age=3600",
      "x-api-version": API_VERSION,
    },
  });
}
