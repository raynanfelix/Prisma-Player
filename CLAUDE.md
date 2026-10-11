# Prisma Player

As regras oficiais de desenvolvimento deste repositório estão em:

- `AGENTS.md`
- `docs/ARCHITECTURE.md` (fronteiras, guard, checklist de nova funcionalidade)
- `docs/SECURITY.md` (isolamento, padrão de rotas, testes de segurança)
- `docs/UI_ARCHITECTURE.md`
- `docs/apple-DESIGN.md`
- `src/components/README.md`

Leia esses arquivos antes de criar ou modificar qualquer interface. Preserve o
trabalho local existente e não instale bibliotecas sem uma necessidade concreta
e verificada.

Regras de backend (resumo): rota mutante usa `guard({ csrf, role, paid })`;
toda query filtra por `accountOwnerId` da sessão; módulo servidor novo recebe
`import "server-only"` + entrada em `tests/server-boundary.test.ts`; cores só
via tokens de `globals.css` (claro intacto, escuro preto, hover neutro,
selecionado `--color-selected`). Valide com `npm test`, `tsc --noEmit` e build.

