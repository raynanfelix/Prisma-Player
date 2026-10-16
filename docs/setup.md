# Setup e evidências — Vibe Coding Toolkit

## Origem e contexto

- Execução em 15–16/10/2026 com o prompt 12 (existing-project-setup) do
  [vibe-coding-toolkit](https://github.com/soumatheusgomes/vibe-coding-toolkit),
  revisão `f13bb354363dafef8ce8d8f605856cc9e1cc52cc` (clone temporário fora
  do projeto; todos os guias vieram dessa mesma revisão).
- Escopo aprovado pelo usuário: **seguro por etapas** — docs/harness/skills
  agora; quality gates em medição + regra nova em warn; sem refatoração de
  código enquanto sessões paralelas trabalham no repositório.
- Cliente: DeepSeek Harness (PromptScript), modelo da sessão, sem seleção de
  subagentes configurada — trabalho executado direto.

## Decisões

- Documentos equivalentes canônicos foram **mapeados, não duplicados**:
  `docs/ARCHITECTURE.md`, `docs/UI_ARCHITECTURE.md` e `docs/SECURITY.md`
  permanecem fontes canônicas. `docs/design.md` passou a ser o documento
  canônico de design após a remoção do `docs/apple-DESIGN.md` (a semântica
  azul da Apple contradizia os tokens reais — verde-lima `#B9FF66` de ação).
- Skills Vercel instaladas **localmente** com `--copy` (Windows, sem
  junctions), agentes `claude-code` + `codex`, lock versionado em
  `skills-lock.json`.
- Lint: skills vendorizadas excluídas via `globalIgnores` — eram ~280
  warnings falsos-positivos de código de terceiros.
- Superpowers/Ponytail/Caveman/RTK/Context7/Graphify/agent-browser:
  indisponíveis neste cliente (declarado no brainstorming). Equivalentes
  usados: protocolo próprio de design, documentação oficial via web, knip
  para código não usado. Integração real fica pendente para Claude Code/Codex
  (comandos em `docs/01-installation.md` do toolkit).

## Componentes (matriz de cobertura do catálogo)

| Componente | Ação e motivo | Escopo | Estado e evidência |
|---|---|---|---|
| AGENTS.md | Conciliar template preservando regras | Projeto | Comandos canônicos + acordos + ponteiros de docs adicionados; bloco Next intacto |
| CLAUDE.md | Já é ponte correta para AGENTS.md | Projeto | Reaproveitado sem alteração |
| README.md | Criar (inexistente) | Projeto | Criado: execução + índice de docs |
| PRODUCT.md | Criar com fatos observados + hipóteses declaradas | Projeto | Criado |
| docs/architecture.md | Reaproveitar equivalente `docs/ARCHITECTURE.md` | Projeto | Mapeado; nada duplicado |
| docs/design.md | Criar como documento canônico de design (tokens reais do `globals.css`) | Projeto | Criado; `apple-DESIGN.md` removido a pedido do usuário |
| docs/onboarding.md | Criar com setup real (Neon/Drizzle/R2) | Projeto | Criado |
| docs/quality.md | Criar com linha de base medida | Projeto | Criado |
| docs/setup.md | Este documento | Projeto | Criado |
| Skills Vercel (8 web) | Instalar localmente + lock (guia 16) | Projeto | `.agents/skills/` + `skills-lock.json` com hashes |
| find-skills | Instalar localmente | Projeto | Instalada (também ativa em nível usuário) |
| ESLint quality gates | Medir + regra nova em warn | Projeto | `max-lines` warn 350 + exclusão de skills vendorizadas; perfil completo (prompt 08) pendente |
| Comando composto | Adicionar `npm run verify` | Projeto | Adicionado (typecheck + lint + test) |
| knip | Reaproveitar config existente | Projeto | `knip.json` preservado |
| Superpowers/Ponytail/Caveman | Plugins de cliente | Cliente | Bloqueado neste cliente; pendência Claude Code/Codex |
| RTK | CLI externa de economia de tokens | Máquina | Inaplicável nesta sessão |
| Context7 | Consulta de docs de API | Cliente | Bloqueado; usadas fontes oficiais via web |
| Graphify | Grafo de código | Projeto | Não instalado (sem necessidade concreta; knip cobre parte) |
| agent-browser / Chrome DevTools MCP | Automação de navegador | Cliente | Inaplicável nesta sessão |
| Memória externa (Obsidian) | Memória em camadas | — | Inaplicável; docs versionados cobrem |
| Hooks do cliente | `.codex/hooks.json` existente | Projeto | Preservado, sem duplicação |

## Verificações (antes → depois)

| Item | Estado | Evidência |
|---|---|---|
| Testes | 212/212 → 266/274 (8 falhas) | Falhas exclusivamente em `tests/videos-routes.test.ts` — novo, sessão paralela, WIP não commitado; 27 arquivos originais passam |
| Typecheck | limpo → 2 erros TS2554 | Mesmo arquivo novo da sessão paralela (linhas 656 e 924) |
| Lint | 413 → **137** (13 erros idênticos, 124 warns) | Exclusão de skills vendorizadas + `max-lines` (26 arquivos); detalhe em `docs/quality.md` |
| Skills locais | Validado | `.agents/skills/` + `skills-lock.json` com hashes verificados |
| npm audit | 25 vulnerabilidades (4 críticas, 12 high, 8 moderate, 1 low) | Triagem pendente; `npm audit fix` exige avaliação |
| Build | Não executado | Sem mudança em código de aplicação; evitar conflito com dev server de outra sessão |

## Pendências e próxima entrega

1. **Zerar os 13 erros de lint** (lista priorizada em `docs/quality.md`) — a
   menor tarefa para `npm run verify` voltar ao verde (depende também do WIP
   paralelo ser concluído).
2. **Sessão paralela em andamento**: `src/app/api/*` (4 rotas),
   `src/lib/account/`, `src/lib/analytics/ingest.ts`,
   `src/lib/billing/webhook-flow.ts`, `src/lib/cron-tasks/` e
   `tests/videos-routes.test.ts` não commitados — não tocar até o commit.
3. Burndown dos 124 warnings (90 `no-unused-vars` casam com achados do knip).
4. Triagem do `npm audit` (4 críticas primeiro).
5. Perfil completo de quality gates (prompt 08) + self-check das regras.
6. Integrar Superpowers/Ponytail/Caveman/Context7/Graphify no Claude Code/Codex.
7. Decisão sobre os relatórios `PRISMA — *.md` da raiz (mover para `docs/`?).

### Revisão posterior sugerida: 5 ciclos

Mudança de escopo médio (docs + config + skills; sem código de aplicação),
mas com verificação ampla: **5 ciclos** — (1) exatidão dos docs vs código
real; (2) regressões de lint/config/package.json; (3) segurança das
instruções (sem segredos; audit); (4) skills locais e lock; (5) clareza e
manutenção dos documentos.

Prompt de continuação:

```text
Rode 5 ciclos de code review no estado atual do repositório. Focos:
1) exatidão dos documentos novos (README, PRODUCT, docs/design, onboarding,
quality, setup) contra o código real;
2) possíveis regressões das mudanças em eslint.config.mjs, package.json e
AGENTS.md;
3) segurança das instruções escritas (nenhum segredo; comandos seguros);
4) skills locais (.agents/skills) e skills-lock.json consistentes;
5) clareza e manutenção dos documentos.
Checks: npm run verify, npx knip, npm audit. Registre achados com
severidade, arquivo/linha e evidência; proponha correções sem aplicá-las sem
autorização. Não altere arquivos com work-in-progress de outra sessão.
```
