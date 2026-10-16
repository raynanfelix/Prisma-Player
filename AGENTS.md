# Prisma Player — instruções para agentes

Antes de alterar interface, leia integralmente:

- `docs/UI_ARCHITECTURE.md`
- `docs/apple-DESIGN.md`
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


<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
