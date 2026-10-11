# Arquitetura do código

O projeto usa organização por domínio. Uma funcionalidade deve ficar em `src/features/<domínio>`; `src/app` contém apenas páginas, layouts e handlers HTTP do Next.js.

## Estrutura

```text
src/
├── app/                         # Rotas públicas, dashboard e APIs
├── components/
│   ├── dashboard/               # Shell compartilhado da área autenticada
│   └── ui/                      # Primitivos visuais reutilizáveis
├── features/
│   ├── analytics/components/    # Leitura e visualização de métricas
│   ├── marketing/components/    # Página pública de vendas
│   ├── player/components/       # Player, embed e teste A/B
│   ├── studio/components/       # Editor de VSL
│   └── videos/components/       # Upload e biblioteca
└── lib/                         # Infraestrutura compartilhada (auth/Supabase)

supabase/
├── functions/                   # Edge Functions
└── migrations/                  # Histórico imutável do banco
```

## Limites de responsabilidade

- `app/api` autentica a requisição, chama o domínio e converte o resultado em HTTP. Não guarda segredo nem regra de negócio.
- `features/*/domain` não depende de React nem de detalhes visuais.
- `features/*/infrastructure` concentra gateways, storage e serviços externos.
- `components/ui` não conhece vídeo, regras comerciais ou analytics.
- URLs de `/embed`, `/api/embed` e `/api/player-loader` são contratos públicos e não devem mudar em reorganizações internas.

## Convenções

1. Componentes exclusivos de um domínio ficam dentro desse domínio.
2. Evite arquivos genéricos como `helpers.ts`; use nomes que descrevam a responsabilidade.
3. Nenhum segredo usa prefixo `NEXT_PUBLIC_`.
4. Alterações no banco entram em uma nova migration; migrations aplicadas não são reescritas.
5. Toda tabela exposta usa RLS e políticas de propriedade explícitas.
6. Antes de publicar: `npm run lint` e `npm run build`.

## Próximos módulos

- `features/ai`: Prisma IA, legendas, tradução e dublagem.
- `features/experiments`: testes de headline, autoplay, CTA, thumbnail e velocidade.
- `features/monitoring`: saúde da embed, alertas e detecção de fraude.
- `features/audience`: Audience Sync e destinos de remarketing.
