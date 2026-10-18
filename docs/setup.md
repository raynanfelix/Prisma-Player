# Setup e evidências — Vibe Coding Toolkit

## Origem e contexto

- Execução 15–16/10/2026 com o prompt 12 (existing-project-setup) do
  [vibe-coding-toolkit](https://github.com/soumatheusgomes/vibe-coding-toolkit),
  revisão `f13bb354363dafef8ce8d8f605856cc9e1cc52cc` (clone temporário fora
  do projeto; todos os guias vieram dessa mesma revisão).
- **Execução 17/10/2026 (esta sessão)**, mesma revisão `f13bb35` (hash
  conferido no clone): quality gates instalados + self-check + matriz de
  cobertura completa do catálogo + conciliação de AGENTS.md/CLAUDE.md +
  decisão de delegação documentada. Escopo aprovado: gates em warn com
  linha de base medida; **nenhuma refatoração de código de aplicação**
  (sessões paralelas em voo).
- Cliente: DeepSeek Harness (PromptScript), modelo da sessão, sem seleção
  de subagentes configurada — trabalho executado direto.

## Decisões

- Documentos equivalentes canônicos foram **mapeados, não duplicados**
  (tabela abaixo). `docs/ARCHITECTURE.md`, `docs/UI_ARCHITECTURE.md` e
  `docs/SECURITY.md` permanecem fontes canônicas.
- Skills Vercel instaladas **localmente** com `--copy` (Windows), agentes
  `claude-code` + `codex`, lock versionado em `skills-lock.json`.
- **Quality gates (prompt 08)**: os 3 `.cjs` + `verify.mjs` copiados
  byte a byte da revisão `f13bb35` (SHA-256 conferido origem↔cópia).
  Adaptações de fronteira reais:
  - **Apresentação** = `src/components/**` e `src/features/**`. Rotas e
    páginas em `src/app/**` usam `db` **por design** (guard → serviço →
    resposta, ver `docs/ARCHITECTURE.md`) — fora do escopo da regra.
  - **Módulo de dados** = `@/lib/db` (binding `db`); importar só `schema`
    não é sinalizado (não puxa o client).
  - **Logger** = `safeLog()` (`src/lib/utils/log.ts`), eximido do gate de
    console (é o próprio wrapper).
  - **Teto de 350 linhas** passa a valer só para `src/**` + testes; os
    configs de raiz (todos < 100 linhas) ficam fora, por medição.
  - Regra genérica `max-lines` foi **substituída** por `quality/max-lines`
    (exime barrels, módulos só de tipos, `.d.ts` e testes por AST).
- **Severidades medidas antes** (regra do toolkit: sem violação = error;
  com legado = warn + plano):
  - `quality/max-lines`: **32** (27 produção + 5 testes) → warn.
  - `quality/no-direct-console`: **45** (28 arquivos) → warn.
  - `quality/no-direct-data-access`: **1** (`Nav.tsx`) → warn.
  - Critério de promoção: cada regra vai a `error` quando a própria
    contagem chegar a zero (contagem anotada em `eslint.config.mjs`).
- **Superpowers/Ponytail/Caveman/RTK/Context7/Graphify/agent-browser/**
  Chrome DevTools MCP/memória: indisponíveis neste cliente ou sem
  necessidade concreta — cada item com justificativa na matriz abaixo;
  integração real fica pendente para Claude Code/Codex.
- **Biome não instalado**: exigiria novo devDependency (lockfile congelado
  nesta sessão); ESLint + presets Next cobrem o papel hoje.

## Componentes — matriz de cobertura completa do catálogo

Revisão usada: `f13bb354363dafef8ce8d8f605856cc9e1cc52cc` (2026-10-15).
Ações: instalado / atualizado / integrado / reaproveitado / inaplicável /
bloqueado. Nenhum item do catálogo omitido.

### Guias (docs/)

| Componente | Necessidade | Estado atual | Ação | Escopo | Risco | Critério de validação |
|---|---|---|---|---|---|---|
| 00-overview.md | Entender caminhos de adoção | Lido; 4 caminhos conhecidos | Reaproveitado | Sessão | Baixo | Matriz desta seção cobre os caminhos |
| 01-installation.md | Instalar peças modularmente | Comandos mapeados | Reaproveitado | Sessão | Baixo | Nenhuma instalação global executada |
| 02-playbook-onboarding.md | Fluxo narrado de trabalho | Acordos equivalentes em AGENTS.md | Reaproveitado | Repo | Baixo | AGENTS.md cobre os acordos |
| 03-environment-setup.md | Preparar a máquina | Máquina fora do escopo do repo | Inaplicável (máquina) | Máquina | Baixo | Manifesto global não pertence ao repo |
| 04-project-bootstrap.md | Base de projeto novo | Projeto já existe | Inaplicável (existente) | — | Baixo | — |
| 05-toolkit-validation.md | Validar a cópia do toolkit | Cópia conferida por hash | Reaproveitado | Temp | Baixo | SHA-256 origem↔cópia idêntico |
| 06-project-defaults.md | Padrões de stack | Stack própria preservada (Next 16/Drizzle/Neon/R2) | Reaproveitado como referência | Projeto | Baixo | Desvios registrados nas Decisões |
| prompts/12-existing-project-setup.md | Adoção/atualização existente | Executado em 15–16/10 e 17/10 | Atualizado | Repo | Médio | Este documento + checks verdes |

### Prompts (docs/prompts/)

| Componente | Necessidade | Estado atual | Ação | Escopo | Risco | Critério de validação |
|---|---|---|---|---|---|---|
| 01-project-sanitation | Medir código não usado | `npx knip` cobre | Reaproveitado (equivalente) | Projeto | Baixo | knip roda com config própria |
| 02-eslint-warning-burndown | Reduzir avisos com plano | Aplicado às contagens dos gates | Reaproveitado (método) | Projeto | Baixo | Contagem por regra em `docs/quality.md` |
| 03-multi-agent-code-review | Revisão por especialistas | Convenção 3–8 ciclos adotada | Reaproveitado | Lead | Baixo | Ciclos sugeridos em cada entrega |
| 04-brainstorm-to-plan | Refinar pedido ambíguo | Protocolo próprio de design | Reaproveitado (parcial) | Sessão | Baixo | — |
| 05-parallel-wave-dispatch | Ondas paralelas | Prática real: subagentes background por frente | Integrado (decisão em AGENTS.md) | Lead | Médio — corrida de escrita se escopos se cruzarem | Escopos disjuntos + validação do Lead |
| 06-memory-bootstrap | Contexto persistente | Docs versionados + `skills-lock.json` | Inaplicável (sem memória no cliente; docs cobrem) | — | Baixo | — |
| 07-eslint-complete-setup | ESLint completo do zero | Superseded pelo 08 (regras prontas > escrever) | Reaproveitado (decisão: usar 08) | — | Baixo | — |
| 08-eslint-quality-gates-install | Gates prontos + medição | **Executado nesta sessão** | Instalado | `eslint-rules/` + `scripts/` | Médio — gate mal adaptado vira ruído | Self-check 3× ok; lint 0 erros |
| 09-file-size-refactor | Quebrar arquivos > 350 | 27 arquivos produção medidos | Pendente (refatoração ampla não autorizada em paralelo) | `src/**` | Alto — refatoração extensa | Burndown 32 → 0 antes de `error` |
| 10-development-environment-setup | Máquina | Fora do escopo | Inaplicável (máquina) | Máquina | Baixo | — |
| 11-next-project-bootstrap | Projeto novo | Projeto já existe | Inaplicável (existente) | — | Baixo | — |

### Ferramentas (docs/tools/)

| Componente | Necessidade | Estado atual | Ação | Escopo | Risco | Critério de validação |
|---|---|---|---|---|---|---|
| 01 Superpowers | Processo: design/plano/verificação | Plugin de Claude Code; cliente atual não suporta | Bloqueado (cliente); princípio nos Acordos | Claude Code/Codex | Baixo | `/plugin install superpowers` quando houver Claude Code |
| 02 Subagentes | Delegação e ondas | Padrão documentado como decisão real do repo | Integrado (AGENTS.md §Delegação e revisão) | Lead | Médio | Escopos disjuntos; Lead valida diff+checks |
| 03 RTK | Economia de tokens de CLI | CLI externa (brew/binário); não instalada | Inaplicável nesta sessão | Máquina | Baixo | `rtk --version` se algum dia instalado |
| 04 Ponytail | Menor solução completa | Plugin de cliente; princípio já nos Acordos ("menor mudança suficiente") | Bloqueado (cliente); princípio reaproveitado | Claude Code/Codex | Baixo | Acordos de trabalho em AGENTS.md |
| 05 Caveman | Comunicação concisa | Plugin de cliente | Bloqueado (cliente) | Claude Code/Codex | Baixo | — |
| 06 ESLint/Biome gates | Lint em dois papéis | ESLint only (Biome exigiria dep nova — vetado) | Atualizado (gates `quality/*` instalados) | `eslint.config.mjs` | Médio | Self-check + `npm run verify` verde |
| 07 Graphify | Grafo consultável do código | CLI externa (uv/pipx); knip cobre parte; sem necessidade concreta | Bloqueado (sem autorização/necessidade) | Máquina | Baixo | Reavaliar se o projeto crescer em grafo |
| 08 Obsidian memory | Memória externa em camadas | Sem MCP no cliente; docs versionados cobrem | Inaplicável | — | Baixo | — |
| 09 Claude memory | Memória entre sessões | Recurso do Claude Code | Bloqueado (cliente) | Claude Code | Baixo | — |
| 10 Hooks | Hooks do cliente | `.codex/hooks.json` existente (impeccable) | Reaproveitado (sem duplicação) | `.codex/` | Médio — hook executa no fluxo | Roda no Codex; fora do lint |
| 11 agent-browser | Automação de navegador | CLI global ausente; sem tarefa de browser agora | Inaplicável/bloqueado (máquina) | Máquina | Baixo | `agent-browser --version` quando houver |
| 12 Context7 | Docs de API atualizadas | MCP de cliente; indisponível — fontes oficiais via web | Bloqueado (documentado) | Cliente | Baixo | Limitação registrada aqui |
| 13 Anthropic skills | Artefatos (docx/pdf/pptx/xlsx) | Licença por skill (Office proíbe vendorização); cliente sem plugins | Inaplicável/bloqueado | Claude Code | Médio — licença | Ler `LICENSE.txt` por skill antes de copiar |
| 14 Chrome DevTools MCP | Diagnóstico de página viva | Sem MCP no cliente | Bloqueado (cliente) | Cliente | Baixo | — |
| 15 Codex workflow | Instruções/MCPs no Codex | `AGENTS.md` é a fonte comum; hooks preservados | Reaproveitado | Codex | Baixo | Descoberta de skills no Codex quando usado |
| 16 Skills Vercel | Catálogo web | 8 web + `find-skills` instaladas com lock | Reaproveitado (hashes conferidos) | `.agents/skills/` | Baixo | `skills-lock.json` consistente |

### Templates (templates/)

| Componente | Necessidade | Estado atual | Ação | Escopo | Risco | Critério de validação |
|---|---|---|---|---|---|---|
| AGENTS.md.template | Instruções compartilhadas | Conciliado: + comando dos gates, + §Delegação e revisão, + Ferramentas atualizadas; Next block intacto | Atualizado | `AGENTS.md` | Médio — carregado por todo agente | Dif curto; seções do template cobertas |
| CLAUDE.md.template | Ponte Claude | `@AGENTS.md` adicionado; particularidades mantidas | Atualizado | `CLAUDE.md` | Baixo | Import resolve no Claude Code |
| product.md.template | Escopo do produto | `PRODUCT.md` canônico próprio | Reaproveitado (mapeado) | — | Baixo | — |
| project-docs/manifest.json | Mapa de docs | Mapeamento 1:1 registrado abaixo (sem duplicar) | Reaproveitado (mapeado) | `docs/` | Baixo | Tabela de mapeamento |
| architecture.md.template | Estrutura/fronteiras | `docs/ARCHITECTURE.md` canônico | Reaproveitado (mapeado) | — | Baixo | — |
| design.md.template | Direção visual | `docs/design.md` canônico | Reaproveitado (mapeado) | — | Baixo | — |
| onboarding.md.template | Preparação local | `docs/onboarding.md` canônico | Reaproveitado (mapeado) | — | Baixo | — |
| quality.md.template | Checks/linhas de base | `docs/quality.md` canônico (atualizado) | Atualizado | `docs/quality.md` | Baixo | Números conferem com lint |
| setup.md.template | Fontes/evidências | Este arquivo (atualizado) | Atualizado | `docs/setup.md` | Baixo | — |
| project-docs/README.md.template | Índice de docs | `README.md` próprio | Reaproveitado (mapeado) | — | Baixo | — |
| next/.env.example | Variáveis de exemplo | `.env.example` próprio | Reaproveitado (mapeado) | — | Baixo | — |
| next/drizzle.config.ts.example | Config Drizzle | `drizzle.config.ts` próprio (Neon) | Reaproveitado (equivalente) | — | Baixo | `npx drizzle-kit generate` funciona |
| next/vitest.config.mts.example | Config Vitest | `vitest.config.ts` próprio (happy-dom) | Reaproveitado (equivalente) | — | Baixo | `npm test` verde |
| next/src/db/* (index, schema, test) | Client Drizzle | `src/lib/db/index.ts` próprio (Proxy + Neon pool) | Reaproveitado (equivalente funcional) | — | Baixo | `tests/server-boundary.test.ts` |
| next/src/lib/env-schema.ts/env.ts/env.test.ts | Validação de ambiente | `src/lib/config/env.ts` próprio | Reaproveitado (equivalente) | — | Baixo | `tests/config-env.test.ts` |
| next/src/lib/logger.ts (+test) | Logger estruturado | `src/lib/utils/log.ts` (`safeLog` com sanitização) | Reaproveitado (equivalente) | — | Médio — sanitização caseira | Referenciado pelo gate `no-direct-console` |
| next/src/lib/utils.ts.example | Helper `cn` | `cn` próprio em `src/lib` | Reaproveitado (equivalente) | — | Baixo | — |
| eslint/eslint.config.mjs.example | Perfil avançado | Adaptado: plugin quality + ordem de blocos + fronteiras reais | Atualizado | `eslint.config.mjs` | Médio | `npm run lint` 0 erros |
| eslint/eslint.typed.config.mjs.example | Tier type-aware | Não instalado: exigiria script novo em package.json (vetado) | Pendente (dono) | `eslint.typed.config.mjs` | Baixo | `npx eslint --config …` quando criado |
| eslint/next.config.mjs.example + next-app | Perfis leve/completo | Config própria já integra presets Next oficiais | Reaproveitado (decisão) | — | Baixo | — |
| eslint/eslint-rules/{index,core-rules,utils}.cjs | 3 regras prontas | Copiadas byte a byte (SHA-256 conferido) | Instalado | `eslint-rules/` | Baixo | `node scripts/verify-quality-rules.mjs` |
| eslint/eslint-rules/next-base.mjs | Baseline dos perfis Next | Config própria já faz esse papel | Reaproveitado (decisão) | — | Baixo | — |
| eslint/verify.mjs | Self-check das regras | Copiado byte a byte → `scripts/verify-quality-rules.mjs` (destino canônico do template) | Instalado | `scripts/` | Baixo | 3× ok, exit 0 |
| project/mcp.json.example | MCP por cliente | Nenhum MCP no cliente atual | Inaplicável (cliente) | — | Baixo | — |
| project/codex.config.toml.example | Config Codex | Nenhuma integração extra necessária | Inaplicável | — | Baixo | — |
| project/.graphifyignore.example | Exclusões do grafo | Graphify inaplicável | Inaplicável | — | Baixo | — |
| environment-manifest.json.example | Inventário da máquina | Escopo de máquina | Inaplicável (máquina) | — | Baixo | — |
| settings.json.example + hooks/hook-io.mjs.example | Hooks opcionais | `.codex/hooks.json` próprio já cobre | Reaproveitado (sem duplicação) | — | Baixo | — |
| rules/parallel-subagent-driven-development.md | Protocolo de ondas | Princípios incorporados (escopos disjuntos, commits serializados, revisão read-only) | Integrado (resumido em AGENTS.md; não vendado) | `AGENTS.md` | Médio | §Delegação e revisão |

### Scripts do próprio toolkit

| Componente | Necessidade | Estado atual | Ação | Escopo | Risco | Critério de validação |
|---|---|---|---|---|---|---|
| scripts/check-eslint.mjs | Validar gates em app descartável | Exige fixture + `eslint-plugin-import-x`; equivalente adotado | Reaproveitado (equivalente: self-check RuleTester) | Temp | Baixo | Self-check verde |
| scripts/validate-docs.mjs | Links/âncoras/JSON do toolkit | Validação da cópia, não do projeto | Reaproveitado (na cópia TEMP) | Temp | Baixo | Roda na cópia |
| scripts/validate-next.mjs | Validar base Next (Node 24 + rede) | Cria projeto temporário; pesado e fora do repo | Reaproveitado (na cópia TEMP) | Temp | Médio — rede/build | Roda na cópia |

### Skills

| Componente | Necessidade | Estado atual | Ação | Escopo | Risco | Critério de validação |
|---|---|---|---|---|---|---|
| 8 skills web Vercel + `find-skills` | Catálogo web | Já instaladas em `.agents/skills/` + lock | Reaproveitado | `.agents/skills/` | Baixo | Hashes do `skills-lock.json` |
| `vercel-react-native-skills` | RN/Expo | Projeto web, sem plataforma mobile | Inaplicável (decisão de plataforma) | — | Baixo | Instalar só se RN/Expo entrar |
| `mantis-*` (16) + `impeccable` | Segurança/design — fora do catálogo do toolkit | Instaladas por sessão anterior **sem entrada no lock** | Pendente (dono: lockar ou remover) | `.agents/skills/` | Médio — quebra a convenção do lock | `skills-lock.json` deve cobrir 100% das skills |

## Mapeamento de fontes canônicas (sem duplicação)

| Destino do manifesto do toolkit | Fonte canônica deste repo |
|---|---|
| `PRODUCT.md` | `PRODUCT.md` |
| `README.md` | `README.md` |
| `AGENTS.md` | `AGENTS.md` |
| `CLAUDE.md` | `CLAUDE.md` (ponte `@AGENTS.md`) |
| `docs/architecture.md` | `docs/ARCHITECTURE.md` |
| `docs/design.md` | `docs/design.md` |
| `docs/onboarding.md` | `docs/onboarding.md` |
| `docs/quality.md` | `docs/quality.md` |
| `docs/setup.md` | `docs/setup.md` (este) |
| — (extra do repo) | `docs/UI_ARCHITECTURE.md`, `docs/SECURITY.md`, `src/components/README.md` |

## Verificações (17/10/2026, antes → depois)

| Check | Antes (17/10) | Depois (gates instalados) | Evidência |
|---|---|---|---|
| Testes | 435/435 (37 arquivos) | **435/435** | `npm test` exit 0 |
| Typecheck | 0 erros | **0 erros** | `npx tsc --noEmit` exit 0 |
| Lint (geral) | 0 erros / 131 warns | **0 erros / 178 warns** | `npx eslint .` exit 0; +47 warns = 32 `quality/max-lines` (substitui 26 do `max-lines` antigo) + 45 console + 1 data-access, já líquidos |
| `npm run verify` | verde | **verde** | typecheck && lint && test, exit 0 |
| Self-check dos gates | inexistente | **3× ok, exit 0** | `node scripts/verify-quality-rules.mjs` |
| Cópia dos gates | — | **SHA-256 idêntico** (4 arquivos) | comparação origem↔cópia |
| Idempotência | — | **reexecução segura** | self-check re-roda sem estado; cópia é byte a byte (repetir não duplica) |

## Pendências e próxima entrega

1. **Burndown dos gates até `error`**: `no-direct-data-access` (1:
   mover busca do `Nav.tsx` para serviço/Server Component) → depois
   `no-direct-console` (45: migrar para `safeLog`; rotas de API
   primeiro) → por fim `max-lines` (32; usar prompt 09 do toolkit, um
   arquivo por vez, com testes rodando entre eles).
2. **`eslint.typed.config.mjs`** (tier type-aware): criar quando
   package.json estiver livre (adiciona apenas arquivo + uso manual; os
   scripts ficam a cargo do dono).
3. **Lock de `mantis-*`/`impeccable`**: registrar origem+hash no
   `skills-lock.json` (ou remover) — decidir com o dono.
4. Integrar Superpowers/Ponytail/Caveman/Context7/Graphify/agent-browser
   no Claude Code/Codex (comandos em `docs/tools/*` do toolkit).
5. Triagem do `npm audit` (4 críticas primeiro) — pode alterar lockfile.
6. Decisão sobre os relatórios `PRISMA — *.md` da raiz (mover p/ `docs/`?).
7. Diretórios com nomes corrompidos na raiz (`CUsersrayna…`, `cUsers…`)
   — mover/arquivar (parecem saída colada de sessão anterior).

## Revisão posterior sugerida: 5 ciclos

Mudança média (config + docs + regras vendadas; sem código de aplicação),
com verificação ampla: **5 ciclos** — (1) exatidão da matriz de cobertura
vs catálogo e vs código real; (2) gates: fronteira `src/components`/
`src/features`, eximido `log.ts`, ordem dos blocos no flat config;
(3) regressões: `npm run verify`, contagem de warns, idempotência do
self-check; (4) skills e `skills-lock.json` (gap mantis/impeccable);
(5) clareza/manutenção dos docs e links (AGENTS.md, CLAUDE.md, quality.md).

Prompt de continuação:

```text
Rode 5 ciclos de code review no estado atual do repositório. Focos:
1) matriz de cobertura do toolkit em docs/setup.md vs catálogo real e vs código;
2) quality gates: eslint.config.mjs (fronteiras @/lib/db, layers de
   apresentação, eximido src/lib/utils/log.ts, ordem dos blocos flat config)
   e cópia fiel de eslint-rules/*.cjs (SHA-256);
3) regressões: npm run verify + contagem por regra do lint + reexecução de
   node scripts/verify-quality-rules.mjs (deve ser idempotente);
4) skills locais e skills-lock.json (resolver gap mantis-*/impeccable);
5) clareza e consistência de AGENTS.md, CLAUDE.md, docs/quality.md e
   docs/setup.md (links válidos no Windows).
Registre achados com severidade, arquivo/linha e evidência; proponha
correções sem aplicá-las sem autorização. Não altere arquivos com
work-in-progress de outra sessão e não toque em src/features/landing-page,
src/app/pricing, src/features/auth, src/services/auth, src/components/ui
nem src/proxy.ts.
```
