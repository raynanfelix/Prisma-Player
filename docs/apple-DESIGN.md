# Prisma Player — Apple Design System

Este documento complementa os tokens definidos em `src/app/globals.css`. O CSS
é a fonte de verdade; componentes não devem criar paletas paralelas.

## Direção visual

A Prisma combina a clareza da Apple com a precisão de Linear, Raycast, macOS,
iOS e Arc Browser:

- interface minimalista e premium;
- hierarquia evidente;
- bastante respiro;
- superfícies limpas;
- bordas suaves;
- blur e glassmorphism apenas quando melhorarem a hierarquia;
- sombras discretas;
- cantos consistentes;
- movimento fluido e funcional.

Menos é mais. Remova ruído antes de adicionar decoração.

## Uso dos tokens

- Use classes semânticas como `bg-background`, `bg-card`, `text-foreground`,
  `text-muted-foreground`, `border-border`, `bg-primary` e
  `text-primary-foreground`.
- Use os raios derivados de `--radius`; não introduza valores arbitrários.
- Use as sombras definidas no tema e evite sombras fortes ou coloridas.
- Use a família tipográfica global; uma página não deve carregar uma fonte
  isolada.
- Azul comunica ação, seleção ou informação. Vermelho comunica perigo ou
  falha. Verde comunica sucesso. Não use essas cores apenas como decoração.

## Layout e densidade

- Agrupe controles relacionados.
- Mantenha uma ação principal clara por contexto.
- Prefira disclosure progressivo a exibir todas as opções simultaneamente.
- Cards devem organizar informação, não transformar cada texto em uma caixa.
- Tabelas e dashboards devem privilegiar comparação, leitura rápida e estados
  vazios úteis.
- Em mobile, preserve a ação principal, elimine colunas dispensáveis e evite
  rolagem horizontal da página.

## Interação

- Estados de hover não podem ser a única forma de descobrir uma ação.
- O foco deve permanecer visível.
- Feedback deve ser imediato e escrito em linguagem humana.
- Modais são reservados para decisões focadas; fluxos extensos usam página ou
  painel lateral.
- Transições devem explicar mudança de estado, não competir com o conteúdo.

