# Design e acessibilidade — Prisma Player

## Direção

Produto brasileiro para criadores de oferta. Interface minimalista e premium,
hierarquia evidente, bastante respiro, superfícies limpas e movimento
funcional. A identidade é a da Prisma: **verde-lima como cor de ação e marca
sobre tinta escura** — não siga guias visuais de terceiros (Apple etc.); o
código é a referência.

## Fonte de verdade

- `src/app/globals.css` — todos os tokens (cores, tipografia, raios, sombras,
  animações). O CSS é a fonte; componentes não criam paletas paralelas.
- `docs/UI_ARCHITECTURE.md` — organização do frontend e fluxo de pesquisa de
  componentes.
- `src/components/README.md` — estrutura de `src/components`.
- Este documento traduz o sistema vigente; divergência entre aqui e o CSS é
  bug de documentação — corrija nos dois.

## Cores (tema claro)

| Papel | Token | Valor |
|---|---|---|
| Marca/ação (primary) | `--primary`, `--color-positivus-green` | `#B9FF66` (verde-lima) |
| Texto sobre primary | `--primary-foreground` | `#191A23` (tinta) |
| Tinta (texto/estrutura) | `--color-ink`, `--color-prisma-blue` | `#191A23` |
| Canvas | `--color-canvas` | `#ffffff` |
| Canvas alternativo | `--color-canvas-parchment` | `#F3F3F3` |
| Superfície suave | `--color-surface-pearl` | `#fafafc` |
| Chip | `--color-surface-chip` | `#d2d2d7` |
| Foco/ring | `--ring` | `#B9FF66` |
| Hairline | `--color-hairline` | `rgba(25,26,35,.2)` |
| Destrutivo | `--destructive` | oklch(0.577 0.245 27.325) |

## Cores (tema escuro)

- **Preto puro**: todas as superfícies colapsam para `#000000`
  (`--color-canvas`, `--card`, `--popover`, `--sidebar`…). Nada de cinza; a
  separação vem das hairlines (`rgba(255,255,255,.18)`).
- Texto: branco `#ffffff` / muted `#A1A1A6`.
- Primary continua `#B9FF66` com tinta por cima (`--primary-foreground: #191A23`).

## Regras de estado (definidas em UM lugar)

- **Selecionado/ativo**: `--color-selected` / `--color-selected-foreground` —
  claro = tinta `#191A23` sobre branco; escuro = verde-lima `#B9FF66` com tinta.
  Nada fora desses tokens repete esses valores.
- **Hover neutro**: sem fundo colorido; o feedback é o texto clarear
  (ex.: `--sidebar-accent: transparent` no escuro). Hover nunca é a única
  forma de descobrir uma ação.
- **Tema claro intacto**: não escureça superfícies claras para "dar estilo".

## Semântica de cor

- **Verde-lima** = ação, marca, seleção, foco. Não use como texto corrido.
- **Tinta** = texto e estrutura.
- **Vermelho** (`--destructive`) = perigo/falha.
- **Azul** aparece apenas como rampa sequencial de intensidade em data-viz
  (`--chart-scale-*`, `--choropleth-*`, matiz oklch ~250-255, inverte no
  escuro) — nunca como cor de ação.

## Como aplicar

- Classes semânticas shadcn: `bg-background`, `bg-card`, `text-foreground`,
  `text-muted-foreground`, `border-border`, `bg-primary`,
  `text-primary-foreground`.
- Utilitários themeáveis (definidos no globals.css): `themeable-bg-canvas`,
  `themeable-bg-canvas-parchment`, `themeable-bg-surface-pearl`,
  `themeable-text-ink`, `themeable-text-ink-muted-80`/`-48`,
  `themeable-text-body(-muted)`, `themeable-border-hairline`,
  `themeable-border-divider-soft`.
- Proibido: hex cru, `rgba()` ad-hoc, paletas paralelas por componente.

## Tipografia

- Display/sans: **Inter** (`--font-display`); serif opcional: Source Serif 4
  (`--font-serif`); corpo 17px/1.47, letter-spacing -0.374px.
- Escala utilitária: `text-hero` (56px, responsiva até 28px), `text-display-lg`
  (40px), `text-lead` (28px), `text-tagline` (21px), `text-body-strong` (17px),
  `text-caption`/`-strong` (14px), `text-fine` (12px).

## Formas, sombras e movimento

- Raio base `--radius: 0.625rem` com escala derivada (`sm`→`4xl`) e pill
  `--radius-pill: 9999px`. Não invente valores arbitrários.
- Sombras discretas: `--shadow-input/-hover/-focus`, utilitário `product-shadow`.
- Movimento: `--ease-silk` (cubic-bezier(0.2,0,0,1)); utilitários prontos
  `animate-fade-in(-delay-1/-2)`, `animate-slide-up`, `animate-dialog-backdrop`,
  `animate-dialog-panel`, `animate-status-pop`. Respeite
  `prefers-reduced-motion`.

## Layout

- Conteúdo do dashboard: `.dashboard-content` (max-width 1440px, padding
  20px 16px 0, centrado). Barra lateral colapsável; mobile preserva a ação
  principal e evita rolagem horizontal.

## Interação e acessibilidade

HTML semântico, foco visível, navegação por teclado, contraste adequado.
Controles com nome; erros junto ao campo; operações assíncronas exibem
espera/resultado (estados de loading/empty/error já mapeados nos charts).
Modais para decisões focadas; fluxos longos em página ou painel lateral.

## Regras de componentes

- `@/components/ui` é o destino padrão do shadcn CLI.
- Componentes externos são base a adaptar aos tokens da Prisma; nunca copie
  componentes Premium/Pro.
- Origens externas ficam no subdiretório correspondente; alterações via
  wrapper em `ui/custom`.

## Manutenção

Mudança visual = atualizar o token em `globals.css` e este documento na
mesma entrega. Antes de concluir mudanças de UI, revise com a skill
`web-design-guidelines` (`.agents/skills/`).
