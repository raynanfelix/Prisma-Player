# Prisma Player — Arquitetura V2

## Objetivo

Reconstruir a aplicação por domínio sem interromper o produto nem alterar os
contratos públicos existentes. Rotas, payloads, regras de negócio, políticas de
acesso e tabelas continuam compatíveis durante toda a migração.

## Estratégia

A migração segue o padrão *strangler*: cada fluxo legado é envolvido por uma
interface estável e, em seguida, substituído internamente. Não existe uma fase
em que duas implementações escrevem no mesmo recurso sem uma fonte de verdade
explícita.

Ordem dos domínios:

1. fundação visual, providers, HTTP e contratos;
2. autenticação, conta e configurações;
3. biblioteca, upload, Studio e embed;
4. analytics, inteligência e testes A/B;
5. cobrança, administração e automações;
6. remoção do legado e endurecimento final.

Cada etapa precisa passar por typecheck, testes, lint dos arquivos alterados e
build de produção antes de substituir a anterior.

## Estrutura alvo

```text
src/
  app/                    # composição de rotas; sem regra de domínio
  components/
    ui/                   # primitives shadcn/Base UI
    shared/               # componentes transversais
    layouts/              # shells e estruturas de página
  features/
    <domínio>/
      components/
      hooks/
      model/
      server/
  providers/              # composição de providers globais
  services/
    http/
    analytics/
    email/
    storage/
    supabase/
    videos/
  lib/                    # infraestrutura interna e compatibilidade legada
  types/                  # contratos realmente transversais
  utils/                  # funções puras
  styles/                 # tokens e estilos globais
```

## Regras de dependência

- `app` pode importar `features`, `components`, `providers` e `services`.
- `features` podem importar `components/ui`, `services`, `types` e `utils`.
- `services` não importam componentes nem hooks.
- componentes de UI não conhecem API, Supabase ou regra de negócio.
- páginas não chamam `fetch`, SDKs ou bancos diretamente.
- acesso administrativo ao Supabase permanece exclusivamente no servidor.
- um domínio não importa internals de outro domínio; usa contratos públicos.

## Estado e dados

- Server Components são o padrão para leitura inicial.
- Estado local é o padrão para interação efêmera.
- Context é reservado a capacidades de aplicação (idioma, upload persistente).
- Cache de cliente só será adicionado onde revalidação, deduplicação e
  atualização otimista justificarem a dependência.
- URLs e filtros compartilháveis devem evoluir para estado de URL.

## Design system

Primitives partem de shadcn/Base UI e são adaptadas aos tokens Prisma.
Componentes gratuitos de Origin UI, Kokonut UI, Magic UI, Aceternity UI, COSS
UI, BKLit, React Aria e Motion Primitives só entram quando:

1. resolvem um requisito real;
2. são copiados para o projeto e adaptados aos tokens;
3. não trazem dependência comercial ou telemetria;
4. mantêm acessibilidade por teclado, foco e leitor de tela.

Os tokens semânticos são a fonte de verdade. Valores de cor e raio não devem
ser repetidos em páginas de produto.

## Compatibilidade

Durante a migração, arquivos em `src/lib` podem atuar como adaptadores. Novas
funcionalidades devem nascer na estrutura V2; código migrado não volta a chamar
serviços externos diretamente.

## Critérios de conclusão

- nenhuma página chama serviço externo diretamente;
- nenhum arquivo de produto concentra UI, rede e regra de negócio;
- fluxos críticos têm contratos tipados e testes;
- não há mocks em produção nem dados globais inventados;
- idiomas não dependem de mutação do DOM;
- layouts funcionam em 320 px, tablet e desktop;
- navegação completa por teclado e foco visível;
- lint, typecheck, testes e build passam no CI;
- dependências e arquivos legados sem uso são removidos.
