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

