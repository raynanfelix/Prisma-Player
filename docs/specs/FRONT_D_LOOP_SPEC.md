# Front D — O Loop final de qualidade (24/10/2026, pré-lançamento 27/10)

Fonte: dono ("rode a frente D por completo"). Estado: HEAD ~eef72b0+ (verificar log), 726+ testes, tsc 0 (EXCETO o erro do kibo-ui/kanban: src/components/kibo-ui/kanban/index.tsx(204,16) — 'Transform' usado como valor — FRENTE PARALELA de outra sessão do dono: NÃO TOQUE em kibo-ui, package.json, package-lock, docs/specs/ROADMAP_KANBAN_SPEC.md, src/lib/roadmap.ts, tests/roadmap.test.ts, AdminShell, app-shared; se esses arquivos estiverem modificados no tree, NÃO commite — isole via pathspec como o Lead fez). Regras gerais: Set-Content PROIBIDO com acentos; zero deps; sem build; sem push (Lead comita); SEM travessões em textos novos; commit(s) com pathspec citando esta spec.

## D1 — M9: teto de streams deixado pelo SEC-A (a única pendência técnica real)
src/app/api/embed/[id]/route.ts:173-206 conta streams por viewerId AUTO-DECLARADO (rotável). Fix: chavear o contador por (embedId, hash do IP) com janela deslizante existente (mesma família do rate-limit) — rotação de identidade deixa de zerar; embed legítimo com múltiplos viewers atrás de NAT: o teto continua generoso (o número atual é por config do player — mantenha o valor, mude a chave). Teste: mesma janela, 2 viewerIds do mesmo IP → o teto somado ainda bloqueia.

## D2 — Textos AbacatePay remanescentes (~15 pontos em prisma-legal.ts, markdown/pages.ts, llms.txt, UserActions.tsx, admin/system, admin/finance, dashboard/billing, admin users routes)
Grep -i abacatepay em src/: cada menção vira realidade atual (Stripe) OU é removida se for histórico morto de UI. ATENÇÃO: prisma-legal.ts é CONTEÚDO LEGAL (termos/privacidade) — se a menção descreve o processador de pagamento antigo, troque por "Stripe" (o processador atual) com a mesma estrutura de texto; se o texto é do dono e ambíguo, reporte no relatório em vez de chutar. admin/system e admin/finance: cards de monitoramento do antigo gateway — o UptimeCard do webhook pode virar "Stripe Webhooks" (mesmos dados de payment_webhook_events que o admin já lê). NÃO toque nos textos de RITUAL legal aprovados sem necessidade (menção histórica factual pode ficar se o parágrafo já fala do passado).

## D3 — knip + dedup (higiene de código)
npx knip: lista atual (exit 1 pré-existente). Corrija os itens SEGUROS: exports/arquivos mortos reais (ex.: resolveIntegrationsForVideo/listProviderInstances sem consumidores — decidir: remover ou wire; dashboard/security antigo; componentes shadcn não usados = FICAR (shadcn CLI repo pattern, knip entende? se falso positivo, configure knip.json entry patterns). Duplicações: grep por funções utilitárias duplicadas óbvias (formatters, date helpers) e consolide SE o risco for baixo e os testes cobrirem. NÃO delete nada que a suíte ou o build precise. Relatório do que ficou e do que virou pendência.

## D4 — Varredura de rotas e telas (o "testa todas as rotas" do dono)
Inventário: listar TODAS as rotas (build output do último build) e cruzar com testes existentes (grep do path nos tests/). Para cada rota SEM teste: (a) se é página server-side simples → smoke de render happy-dom SE barato; (b) se é API mutante → teste de guarda (401/403/400) no padrão fake-db. Meta: 100% das rotas API com pelo menos 1 teste de guarda. Reporte a matriz rota→teste no relatório. TELAS: cada página do dashboard/admin renderiza sem erro (happy-dom nos islands críticos: billing, settings, studio, videos, admin pages) — priorize as que não têm nenhum teste hoje.

## D5 — Smoke final de ponta a ponta (documentar, não executar pagamento real)
docs/reports/LAUNCH_SMOKE.md: checklist executável do dia 27 (assinatura real sandbox→live, embed com muro novo, delete de conta, refund admin, dunning cron, dispute). O dono executa.

## Regras
NÃO toque: landing, kibo-ui/kanban (frente paralela), package.json/lock, lib/billing (exceto D1 se tocar webhook/stream — avalie), auth internals, .github (o gate check-spec já existe). tsc 0 + vitest (726+, sobe com os novos) + lint 0 + verify-quality-rules ok ao final. Commits POR FRENTE D1-D4 com pathspec (a sessão kanban paralela pode estar no tree — isole SEMPRE, lição do d5541b1).
