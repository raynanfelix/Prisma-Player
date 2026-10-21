/**
 * Catch-all de /api/* desconhecido (item 1 da spec Agentic v2).
 *
 * O Next prioriza rotas estáticas e dinâmicas sobre o catch-all, então
 * nenhum endpoint real chega aqui: só cai nesta rota o que não existe
 * (ex.: /api/nao-existe, /api/videos/xyz/inventado). Sem ela, esses pedidos
 * recebiam o HTML de 404 do Next e agentes/monitores tinham que parsear
 * HTML para descobrir um simples endpoint inexistente.
 *
 * O corpo segue o schema `Error` do OpenAPI (components.schemas.Error) e
 * aponta /api/openapi.json, que é a lista honesta da superfície pública.
 */
function notFound(): Response {
  return Response.json(
    {
      error: "not_found",
      message: "Endpoint inexistente.",
      hint: "Veja /api/openapi.json para a lista de endpoints públicos",
    },
    { status: 404, headers: { "cache-control": "no-store" } },
  );
}

export function GET(): Response {
  return notFound();
}

export function POST(): Response {
  return notFound();
}

export function PUT(): Response {
  return notFound();
}

export function PATCH(): Response {
  return notFound();
}

export function DELETE(): Response {
  return notFound();
}
