# Design e acessibilidade

## Direção

Produto brasileiro para criadores de oferta; interface em português, tom
direto, estética Apple-like. Mobile e desktop, com navegação lateral
colapsável no dashboard.

## Fontes canônicas (não duplicar aqui)

- `docs/apple-DESIGN.md` — direção visual, tokens e princípios.
- `docs/UI_ARCHITECTURE.md` — organização oficial do frontend e fluxo de
  pesquisa de componentes.
- `src/components/README.md` — estrutura de `src/components`.
- `src/app/globals.css` — fonte de verdade dos tokens de cor (claro intacto,
  escuro preto, hover neutro, selecionado `--color-selected`).

Este documento registra a direção e aponta para as fontes; valores
divergentes são corrigidos na fonte, não aqui.

## Interação

HTML semântico, navegação por teclado, foco visível e contraste adequado.
Controles e campos com nome; erros de validação junto ao campo; operações
assíncronas exibem espera e resultado (estados de loading/empty/error já
mapeados nos charts). Respeite `prefers-reduced-motion`.

## Regras de componentes

- `@/components/ui` é o destino padrão do shadcn CLI.
- Componentes externos servem de base e são adaptados aos tokens da Prisma;
  nunca copiar componentes Premium/Pro.
- Origens externas ficam no subdiretório correspondente; alterações via
  wrapper em `ui/custom`.

## Revisão de interface

Antes de concluir mudanças de UI, revise com a skill `web-design-guidelines`
(instalada em `.agents/skills/`). Registre aqui revisões feitas e o que
ainda não existe.
