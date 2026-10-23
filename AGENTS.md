# Prisma Player — instruções para agentes

Antes de alterar interface, leia integralmente:

- `docs/UI_ARCHITECTURE.md`
- `docs/design.md`
- `src/components/README.md`

Esses documentos definem a stack, o fluxo de pesquisa de componentes, o design
system e a organização oficial do frontend. Eles se aplicam a todo o
repositório.

Regras essenciais:

1. Preserve alterações locais do usuário e não faça refatorações destrutivas.
2. Reutilize componentes existentes antes de adicionar dependências ou criar
   novos componentes.
3. Componentes externos servem como base e devem ser adaptados aos tokens da
   Prisma; nunca copie componentes Premium/Pro.
4. O caminho `@/components/ui` continua sendo o destino padrão do shadcn CLI.
5. Componentes de outras origens devem ficar no subdiretório correspondente e
   não devem ser editados diretamente; crie um wrapper em `ui/custom`.
6. Valide responsividade, acessibilidade, TypeScript e build antes de concluir.

Regras de backend (resumo): DB é Drizzle ORM sobre Postgres gerenciado (Neon/
Lakebase) — client `db` e schema em `src/lib/db`; auth é Neon Auth gerenciado
(Managed Better Auth, sem MFA); storage único é Cloudflare R2. Rota mutante usa
`guard({ csrf, role, paid })`; toda query filtra por `accountOwnerId` da sessão;
módulo servidor novo recebe `import "server-only"` + entrada em
`tests/server-boundary.test.ts`. Valide com `npm test`, `tsc --noEmit` e build.

## Comandos canônicos

- Instalar: `npm install` — Desenvolver: `npm run dev`
- Lint: `npm run lint` — Tipos: `npm run typecheck`
- Testes: `npm run test` — Build: `npm run build`
- Verificar base: `npm run verify` (typecheck + lint + test)
- Regras locais de lint (gates): `node scripts/verify-quality-rules.mjs`
- Schema Drizzle: `npx drizzle-kit generate` (aplicar exige `DATABASE_URL_UNPOOLED`)
- Código não usado: `npx knip`

## Acordos de trabalho

- Leia código e instruções pertinentes antes de editar; declare hipóteses que alterem comportamento ou escopo.
- Menor mudança suficiente; reutilize padrões, componentes e dependências existentes.
- Execute os checks canônicos e teste regressões; correções precisam de reprodução quando viável.
- Continue trabalho autorizado; pergunte somente o indispensável. Publicação, custos e ações destrutivas exigem autorização específica.
- Um bloqueio afeta só as tarefas dependentes; conclua as independentes que forem seguras.
- ARQUIVO NOVO DE FEATURE EXIGE SPEC: todo componente, rota ou módulo novo nasce de uma spec em `docs/specs/`, referenciada na mensagem do commit (pattern já usado na sessão: spec → implementação → validação). Gate: `scripts/check-spec.mjs` (warn no CI, nunca bloqueia).

## Documentação e ferramentas

- Escopo do produto: `PRODUCT.md`. Checks: `docs/quality.md`. Preparação local: `docs/onboarding.md`. Setup e evidências: `docs/setup.md`.
- Quality gates (Vibe Coding Toolkit, rev. `f13bb35`): regras locais `quality/*` em `eslint-rules/` — teto de 350 linhas, `console` direto e fronteira de dados (`src/components`/`src/features` não importam o client `db`); severidades em warn com linha de base anotada em `eslint.config.mjs`; promover a `error` quando a contagem própria chegar a zero. Self-check: `node scripts/verify-quality-rules.mjs`.
- Skills locais: conjunto web Vercel + `find-skills` em `.agents/skills/` com lock versionado (`skills-lock.json`); atualizar via `npx skills update --project`. Skills instaladas fora do catálogo (ex.: `mantis-*`, `impeccable`) precisam de entrada no lock ou decisão do dono — ver `docs/setup.md`.
- Context7/RTK/Graphify não integrados ao cliente atual: use documentação oficial e registre a limitação em `docs/setup.md`.

## Delegação e revisão

- Delegue quando isolar contexto, especializar ou paralelizar compensar; tarefas pequenas ficam no agente principal. Sem elenco fixo de especialistas — papéis nascem do briefing da tarefa (objetivo, contexto mínimo, arquivos permitidos, dependências, aceite e checks).
- Prática em uso neste repo: subagentes em background por frente de trabalho, com escopos de arquivos disjuntos (um escritor por arquivo; lockfiles/config compartilhados têm responsável único) e validação de diff + checks pelo coordenador (Lead) antes de aceitar. Implementador não publica; o Lead valida e envia.
- Trabalho paralelo só na mesma frente quando os arquivos forem totalmente disjuntos e não houver dependência; na dúvida, serialize (degrada para execução normal, nunca para corrida de escrita).
- Após cada ciclo de implementação ou correção, sugira de 3 a 8 ciclos posteriores de code review, com focos e prompt de continuação (ver `docs/quality.md`). Sugerir não executa; novas rodadas dependem de pedido.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
