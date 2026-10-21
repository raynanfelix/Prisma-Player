# Agentic v2 (Ora 83/100) — spec (21/10/2026)

Fonte: dono — "somente o que for preciso e que combine com o negócio". 4 itens de código + 2 skips deliberados. Sem travessões em textos (regra do dono). UTF-8 via read/edit/write apenas. Valide tsc+vitest por item.

## 1. JSON 404 para /api/* desconhecido (Essential)
Novo `src/app/api/[...slug]/route.ts`: catch-all que responde `404 {"error":"not_found","message":"Endpoint inexistente...","hint":"Veja /api/openapi.json para a lista de endpoints públicos"}` (no-store). Rotas explícitas ganham do catch-all (Next prioriza explícitas). Confira que NENHUMA rota real some (build lista antes/depois no relatório). Teste: GET /api/nao-existe → 404 JSON; POST também.

## 2. Rate limit headers (RFC) no 429 + onde for barato
`src/lib/security/rate-limit.ts`: quando LIMITA, a resposta 429 ganha `RateLimit-Limit`, `RateLimit-Remaining: 0`, `RateLimit-Reset` (epoch do fim da janela) e `Retry-After` (segundos até resetar). Quando PERMITE, se for trivial expor (a função retorna info), exponha `RateLimit-Limit/Remaining/Reset` via um helper que as rotas do guard usam — NÃO reescreva 40 rotas: se a thread de headers por rota for invasiva, limite-se ao 429 + documento no OpenAPI (item 2 abaixo) que os headers vêm em 429. Honestidade > teatro. Testes: 429 tem os 4 headers; valores coerentes com a janela.

## 3. OpenAPI: error schema + versioning policy
`src/app/api/openapi.json/route.ts`:
- `components.schemas.Error`: `{error: string (código machine-readable), message: string (humano), hint?: string}` + exemplo.
- Respostas 401/403/404/429/500 tipadas com esse schema nos endpoints existentes (ao menos health/embed/ab-events: 401 e 429).
- `info.version`: data (`2026-10-21`); `info.description` ganha POLÍTICA: "Versão por data no header `X-API-Version` das respostas públicas; breaking changes nunca sem aviso prévio de 90 dias via header `Sunset` + changelog em /developers; hoje NÃO há versões /v1 no path porque a superfície pública é estável e pequena".
- Adicionar `X-API-Version` (a data) nas respostas de `/api/health`, `/api/markdown*` e `/api/openapi.json` (barato, prova o que o doc promete). Testes: openapi parseia, schemas.Error existe, 429 do rate-limit tem Retry-After.

## 4. Organization JSON-LD (layout)
`src/app/layout.tsx`: `<script type="application/ld+json">` com Organization: name "Prisma Player", url (NEXT_PUBLIC_SITE_URL || vercel app), logo (/favicon ou logo público se houver em public/), contactPoint [{contactType: "customer support", email: raynanbarbosa803@gmail.com (TODO(dono) trocar), availableLanguage: ["pt-BR"]}], address { "@type": "PostalAddress", addressCountry: "BR" } — NÃO inventar rua/cidade. JSON-LD correto (JSON.parse no teste). Não mudar nada visual.

## Skips deliberados (relatar, não implementar)
- CLI no npm: público não-técnico; exigiria credenciais npm + manutenção sem demanda real (dono aprovou skip).
- Brand SEO: externo (domínio próprio + backlinks), não é código.

## Regras
NÃO tocar: landing, lib/billing, integrations, auth internals, .github, src/proxy.ts (a menos que o header X-API-Version precise lá — preferir por rota). Zero deps. tsc 0 + vitest 603+ + lint 0. Sem build, sem push. Resposta: arquivos, testes, o que o Lead verifica com curl, skips documentados.
