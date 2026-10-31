# Spec — Redesign do Painel Admin (referência Finexy)

## Objetivo
Redesenhar todas as telas de `/admin` mantendo 100% da funcionalidade e dos
dados atuais, com nova linguagem visual: rail de ícones fixo, topbar flutuante
branca arredondada com navegação em pílulas, cards brancos arredondados sobre
canvas `#F3F3F3` (`themeable-bg-canvas-parchment`), KPI hero com gradiente
verde→lima, gráficos animados (motion, `prefers-reduced-motion`), tabelas no
estilo "Recent Activities" (busca à direita, pills de status com ponto, ações
`…`).

## Tokens (fonte: globals.css / docs/design.md)
- Canvas da página: `themeable-bg-canvas-parchment`
- Cards: `bg-white dark:bg-white/[0.035]` + `themeable-border-hairline`, raio 22px
- Ação/hero: `#B9FF66` → gradiente escuro `#191A23`→`#3f5a12`-ish via utility
  local (gradiente permitido como composição de marca, não paleta paralela:
  usa os dois tokens de marca)
- Tinta: `themeable-text-ink` / `-muted-48`
- Seleção: tokens `--color-selected` (nada de cores novas)

## Arquivos novos (esta spec os autoriza)
| Arquivo | Papel |
|---|---|
| `src/components/admin/AdminKit.tsx` | Primitivos: AdminGreeting, AdminCard, AdminKpi (hero/default), AdminDotPill, AdminToolbar |
| `src/components/admin/AdminBarChart.tsx` | Gráfico de barras agrupadas animado (motion, scaleY, stagger, tooltip, legendas) |
| `src/components/admin/AdminShell.tsx` | REESCRITO (arquivo existente): rail de ícones + topbar flutuante + pílula-nav + chip de usuário + toggle de tema sol/lua no rail |

## Funcionalidade preservada (invariante)
- Todas as rotas atuais: /admin, users(+[id]), billing, finance, support(+[id]),
  growth, credits, content, system, team, seo, errors
- Busca da topbar (AdminTopbarSearch), skip-link, logout, guard requireAdmin
- Dados e mutações de cada página inalterados nesta fase
- Dark mode: superfícies escuras existentes; rail/topbar seguem tokens

## Acessibilidade / qualidade
- Rail: `nav aria-label`, `aria-current="page"`, tooltips via `title` +
  `aria-label`, foco visível (`focus-visible:ring`)
- Animações só transform/opacity, respeitam `useReducedMotion`
- Teto de 350 linhas por arquivo; sem `console` direto

## Fases
1. A: shell + kit + gráfico animado + Visão geral (`/admin`) ✔ esta entrega
2. B: users, finance, support, content, system
3. C: growth, credits, team, seo, billing, errors
