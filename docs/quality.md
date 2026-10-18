# Qualidade

## Comandos

- `npm run verify` — check composto: typecheck + lint + test.
- `npm run typecheck` — `tsc --noEmit`.
- `npm run lint` — ESLint (presets core-web-vitals + typescript; quality
  gates do toolkit; skills vendorizadas excluídas).
- `node scripts/verify-quality-rules.mjs` — self-check das regras locais
  de lint (gates do Vibe Coding Toolkit, rev. `f13bb35`): 3× ok, exit 0.
- `npm run test` — Vitest offline (sem rede/banco real).
- `npm run build` — build de produção.
- `npx knip` — arquivos/dependências/exports não usados (config `knip.json`).

## Quality gates (regras locais `quality/*`)

Instalados em 17/10/2026 (cópia byte a byte da revisão `f13bb35` do
toolkit; self-check verde). Severidades medidas antes — sem violação =
`error`; com legado = `warn` + plano; promover a `error` quando a contagem
própria chegar a zero.

| Regra | Escopo | Linha de base (17/10) | Severidade | Plano |
|---|---|---|---|---|
| `quality/max-lines` (350) | `src/**` produção; testes com `includeTests` | **32** (27 produção + 5 testes) | warn | Prompt 09 do toolkit: um arquivo por vez, testes entre etapas |
| `quality/no-direct-console` | `src/**` (adaptador `src/lib/utils/log.ts` eximido) | **45** (28 arquivos) | warn | Migrar para `safeLog()`; rotas de API primeiro |
| `quality/no-direct-data-access` | `src/components/**` + `src/features/**` não importam o client `db` (`@/lib/db`) | **1** (`Nav.tsx`) | warn | Mover a busca do Nav para serviço/Server Component; depois `error` |

Fronteira de dados por design: rotas e páginas em `src/app/**` usam `db`
diretamente (guard → serviço → resposta; ver `docs/ARCHITECTURE.md`) — a
regra protege só a camada de apresentação. Importar apenas `schema`
(tipos/tabelas) não puxa o client e não é sinalizado.

## Linha de base e estado (com atribuição)

| Check | Linha de base (15/10 23:07) | Após setup (16/10 08:11) | Com gates (17/10 18:40) |
|---|---|---|---|
| Testes | 212/212 (27 arquivos) | 266/274 (8 falhas em WIP paralelo) | **435/435 (37 arquivos), exit 0** |
| Typecheck | limpo | 2 erros TS2554 (WIP paralelo) | **0 erros** |
| Lint | 413 (13 erros, 400 warns) | 137 (13 erros, 124 warns) | **0 erros, 178 warns** — os 13 erros vigentes em 16/10 foram corrigidos por outras sessões |
| npm audit | — | 25 vulnerabilidades (4 críticas) | Sem mudança nesta sessão (lockfile intocado) |

Distribuição atual dos warns: `@typescript-eslint/no-unused-vars` (91),
`quality/no-direct-console` (45), `quality/max-lines` (32),
`react-hooks/exhaustive-deps` (4), `@next/next/no-img-element` (4),
`quality/no-direct-data-access` (1).

Concorrência: outras sessões trabalham no repositório simultaneamente. Antes
de atribuir falha de check, confira `git status` e a autoria do arquivo.

## Erros de 16/10 (resolvidos)

Os 13 erros listados em 16/10 (`react-hooks/refs`, `react-hooks/purity`,
`react-hooks/set-state-in-effect`, `react-hooks/immutability`,
`no-explicit-any`) foram corrigidos por sessões paralelas — `npx eslint
--quiet` retorna 0 em 17/10. Mantém-se a regra: **0 erros é o piso**; warns
não são apagados com `ignore`, reduzem na fonte.

## Regras de base

- TypeScript strict; presets oficiais `eslint-config-next`.
- Quality gates do toolkit (`eslint-rules/`) — teto de 350 linhas,
  console direto e fronteira de dados, com linhas de base anotadas em
  `eslint.config.mjs`.
- Skills vendorizadas (`.agents/`, `.claude/`, `.codex/`, `.github/`,
  `.superpowers/`) ficam fora do lint: são código de terceiros, não da
  aplicação.
- Warnings não são apagados com `ignore` — reduzir na fonte (os 91
  `no-unused-vars` casam com achados do knip).

## Estratégia de testes

Vitest + happy-dom, offline. Fronteira de servidor: `tests/server-boundary.test.ts`
(todo módulo `server-only` novo entra lá). Componentes: interação real
(ex.: `account-menu-click.test.tsx`). Sem E2E inventado — cobertura cresce
com regressões reais.

## Revisão após implementação ou correção

Ao concluir um ciclo, sugira de **3 a 8 ciclos posteriores de code review**,
quantidade proporcional ao risco, com focos complementares e prompt de
continuação preenchido (convenção do projeto, não garantia de qualidade).
Cada ciclo revisa o estado atual, registra achados com severidade, local e
evidência, e reavalia correções autorizadas com os checks afetados. Correções
internas não reiniciam a contagem.

## Dependências

`npm audit`: 25 vulnerabilidades (4 críticas, 12 high, 8 moderate, 1 low).
`npm audit fix` pode alterar o lockfile — avaliar advisories um a um antes de
executar. Lint/build verdes não significam auditoria zerada.
