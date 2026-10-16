# Qualidade

## Comandos

- `npm run verify` — check composto: typecheck + lint + test.
- `npm run typecheck` — `tsc --noEmit`.
- `npm run lint` — ESLint (presets core-web-vitals + typescript; teto de 350
  linhas em warn; skills vendorizadas excluídas).
- `npm run test` — Vitest offline (sem rede/banco real).
- `npm run build` — build de produção.
- `npx knip` — arquivos/dependências/exports não usados (config `knip.json`).

## Linha de base e estado (com atribuição)

| Check | Linha de base (15/10 23:07) | Após setup (16/10 08:11) | Atribuição |
|---|---|---|---|
| Testes | 212/212 (27 arquivos) | 266/274 (28 arquivos; 8 falhas) | Falhas 100% em `tests/videos-routes.test.ts` — arquivo novo de sessão paralela (WIP não commitado); os 27 arquivos originais passam |
| Typecheck | limpo | 2 erros TS2554 | Ambos no mesmo arquivo novo da sessão paralela |
| Lint | 413 (13 erros, 400 warns), incluindo skills vendorizadas | **137 (13 erros, 124 warns)** | Exclusão de skills vendorizadas removeu ~280 falsos positivos; +26 warns da regra `max-lines` (nova, intencional); os 13 erros são os mesmos da linha de base |
| npm audit | — | **25 vulnerabilidades (4 críticas, 12 high, 8 moderate, 1 low)** | Triagem pendente |

Concorrência: outras sessões trabalham no repositório simultaneamente. Antes
de atribuir falha de check, confira `git status` e a autoria do arquivo.

## Erros vigentes (13) — prioridade de correção

1. `react-hooks/refs` (5) — `src/features/player/components/EmbedPlayer.tsx:442-445`:
   watermark lê refs durante o render; mover para state/eventos.
2. `react-hooks/purity` (2) — `Date.now()` no render de
   `src/app/admin/finance/page.tsx:28` e `src/app/admin/page.tsx:36`.
3. `react-hooks/set-state-in-effect` (3) — `src/components/ui/toast-save.tsx:44`,
   `src/features/studio/components/VslStudio.tsx:383,388`.
4. `react-hooks/immutability` (1) — `src/app/dashboard/support/[id]/page.tsx:60`
   reatribui `lastDay` no render.
5. `@typescript-eslint/no-explicit-any` (1) — `src/features/player/components/VideoPlayer.tsx:43`.

## Regras de base

- TypeScript strict; presets oficiais `eslint-config-next`.
- Teto de **350 linhas** por arquivo — `max-lines` em **warn** (26 arquivos do
  projeto acima hoje; endurecer conforme o burndown).
- Skills vendorizadas (`.agents/`, `.claude/`, `.codex/`, `.github/`,
  `.superpowers/`) ficam fora do lint: são código de terceiros, não da aplicação.
- Warnings não são apagados com `ignore` — reduzir na fonte (os 90
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
