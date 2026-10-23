# Is Agentic / Ora audit — spec de implementação (20/10/2026)

Fonte: relatório Ora (score 70/100) com 6 itens. Objetivo: agentes de IA (curl/API) conseguirem ler o site público em Markdown, achar recursos e confiar. Valide tsc+vitest após cada item. Set-Content PROIBIDO com acentos.

## 0. LEIA PRIMEIRO (segurança e UI)
- src/proxy.ts INTEIRO (middleware: CSP/nonce, sessão Neon, OAuth verifier, embed) — suas mudanças são ADITIVAS: NÃO altere nenhuma lógica existente byte a byte.
- src/app/layout.tsx (metadata), src/app/(páginas públicas): about/privacy/terms/pricing/services existem.
- Next.js 16: confira docs em node_modules/next/dist/docs/ se algo de middleware/rotas mudou de API.
- UI: docs/UI_ARCHITECTURE.md + docs/design.md antes de criar a página /contact e /developers.

## 1. Negociação de conteúdo Markdown (o coração)
Em src/proxy.ts, para requisições GET cujo header `accept` contenha `text/markdown`:
- SE o caminho está na lista de páginas públicas: `/`, `/pricing`, `/services`, `/about`, `/privacy`, `/terms`, `/contact`, `/developers` → REWRITE para `/api/markdown?path=<caminho>`.
- Prefixos SEMPRE passthrough (nunca interceptar): `/api`, `/_next`, `/dashboard`, `/admin`, `/embed`, `/login`, `/signup`, `/welcome`, `/reset-password`, `/studio`, `/auth`, `/player-loader`, e arquivos: `/favicon.ico`, `/robots.txt`, `/sitemap.xml`, `/llms.txt`, `/llms-full.txt`, `/*.png|ico|mp4|svg|webmanifest` (qualquer caminho com extensão de asset).
- Qualquer OUTRO caminho (não conhecido, sem extensão) → REWRITE para `/api/markdown/404?path=<caminho>` (o handler devolve 404 + Markdown). Cuidado: caminhos reais dinâmicos do app público — confira a lista de rotas do build antes de fechar a lista de passthrough.
- TODO response de página (NextResponse.next()) ganha `Vary` com `Accept` APPENDADO ao valor existente (nunca sobrescrever — hoje vem "rsc, next-router-state-tree, next-router-prefetch, next-router-segment-prefetch"). Só para navegação (não assets).
- Sem Accept: text/markdown → comportamento atual byte a byte (HTML).

## 2. /api/markdown (200) e /api/markdown/404 (404)
Route handlers Node:
- `/api/markdown?path=X`: devolve o conteúdo da página X em Markdown (título, seções reais da página — resuma a copy existente, NÃO invente produto/features), `Content-Type: text/markdown; charset=utf-8`, `Vary: Accept`, cache-control: `public, max-age=300`. Path desconhecido → 404 markdown.
- `/api/markdown/404?path=X`: status 404 + `Content-Type: text/markdown` + corpo ≥20 chars explicando que a página não existe + links: `/`, `/llms.txt`, `/sitemap.xml`.
- Ambos: sem segredos, sem dados de usuário. O conteúdo Markdown das páginas vive num módulo `src/lib/markdown/pages.ts` (mapa path→string; texto PT-BR fiel à copy da página).

## 3. llms.txt (root público)
Route handler `src/app/llms.txt/route.ts` (GET) devolvendo `text/plain; charset=utf-8` (o arquivo já tem rota? src/app/llms.txt existe no build de ontem — CONFIRA; se existe, SUBSTITUA o conteúdo):
- `# Prisma Player` + parágrafo: player de VSL hospedado com Pitch Delay sincronizado, analytics de retenção, testes A/B, proteção anti-download, pixels Meta/GA4/TikTok, billing Stripe. PT-BR + 1 linha EN.
- `## When to use this` (exigência Ora): casos de uso específicos (hospedar VSL de venda com botão de checkout no tempo exato; medir retenção por segundo; rodar A/B de thumb/pitch; vender com Stripe no BR com Pix) e quando NÃO usar (não é LMS, não é video-hosting genérico sem gate).
- Links: /, /pricing, /developers, /api/openapi.json, /about, /contact, /privacy, /terms, /sitemap.xml.

## 4. /api/openapi.json + página /developers (descobribilidade dev)
- `src/app/api/openapi.json/route.ts`: OpenAPI 3.1 mínimo e HONESTO: GET /api/health, GET /api/embed/[id] (+manifest, session), POST /api/ab-events, GET /llms.txt; auth: nenhuma pública além dessas (account APIs exigem sessão — descreva `401`). Server: https://prisma-player.vercel.app. JSON válido (teste parseia).
- Página `/developers` (rota pública, ≥500 chars, `<h1>Prisma Player — Recursos para desenvolvedores e agentes</h1>`): endpoints públicos, formato do embed (script tag), onde está o openapi.json/llms.txt, como falar com a equipe (/contact). Link no llms.txt e no Footer (adicione "Developers" ao Footer.tsx se houver coluna de links).

## 5. /contact (trust anchor faltante)
`src/app/contact/page.tsx` pública (layout de páginas legais existente — veja como /privacy renderiza): ≥500 chars, email de contato (use `raynanbarbosa803@gmail.com` — o dono troca depois; comente no código `// TODO(dono): trocar pelo e-mail oficial`), tempo de resposta, o que incluir no contato, links privacy/terms. Adicione "Contato" no Footer/Nav se houver lista de páginas.

## 6. Metadata de marca (item 4 do Ora — parcial, resto é SEO externo)
`src/app/layout.tsx`: title template com "Prisma Player" + termo principal do produto na description ("player de VSL, Pitch Delay, analytics de retenção" — use a copy REAL da landing como base, não invente). NÃO mexa na copy visível da landing.

## 7. Testes (vitest 5, padrão do repo)
- markdown routes: 200/404/Content-Type/Vary/corpo≥20 chars/links; conteúdo das páginas conhecidas não vazio.
- proxy: aceite text/markdown → rewrite; sem → passthrough; Vary appendado sem perder valores existentes; prefixos protegidos passthrough. (Se testar middleware for pesado, teste as funções auxiliares exportadas — extraia a decisão para `src/lib/markdown/negotiate.ts` testável).
- llms.txt: 200, text/plain, contém "When to use" e os links.
- openapi.json: 200 + JSON.parse ok + paths ≥5.
- contact/developers: render básico (happy-dom) ≥1 heading e sem erro.

## Regras
NÃO toque: features/landing-page (COPY DO DONO — metadata do layout é ok), src/lib/billing, integrations, auth internals, .github. Zero deps novas. Validação final: tsc 0, vitest 575+, lint 0, NÃO rode build, NÃO push. Resposta final: arquivos, o que o Lead verifica com curl após o deploy (os 2 comandos do Ora), pendências (SEO/brand externo é decisão de produto: domínio próprio, backlinks).
