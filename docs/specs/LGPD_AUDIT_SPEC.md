# LGPD Audit Pipeline B — spec de execução (23/10/2026)

Fonte: dono ("veja todas as skills da lgpd e veja se todo nosso sistema segue as leis brasileiras"). Cenário B (legacy retrofit) da skill lgpd-audit. Execute como o MAESTRO: leia C:\Users\rayna\.agents\skills\lgpd-audit\references\normative-reference.md UMA VEZ (prazos/artigos canônicos — nunca invente) e, em cada passo, leia o SKILL.md da filha em C:\Users\rayna\.agents\skills\lgpd-{nome}\ como fallback de ativação. Toda recomendação CITA o artigo da LGPD ou Resolução ANPD. Sem citação, sem recomendação.

## Estado existente (não refaça)
.lgpd/data-map.md (10 atividades, grep real, arquivo/linha citados) e .lgpd/legal-basis.md (bases por atividade, Art. 7º/11) — feitos no ciclo anterior. Comece lendo os dois + docs/SECURITY.md + .lgpd/ vazio do resto.

## Passos a executar (L0-L8, L10-L13 do pipeline B; L9 e L11 são CHECKPOINT do dono — NÃO publique política)
- L0: .lgpd/STATUS.md (formato canônico da skill; cenário B).
- L1: gap analysis completo → .lgpd/gaps.md (priorizado P1/P2/P3, cada gap com artigo + responsável + esforço). Gaps JÁ conhecidos (confirme e expanda): retention purges opt-in desligados; DSAR export sem team members/invites/billing_checkouts/posthog; delete de conta NÃO cancela assinatura Stripe ativa (cobrança após fim da relação = Art. 6º boa-fé + CDC); PostHog recebe EMAIL no identify (operador internacional, Res. 19/2024 transferência); sem runbook de incidentes (Art. 48 LGPD + Res. 15/2024: 3 dias úteis ANPD); encarregado não designado/published (Res. 18/2024); ROPA inexistente (Art. 37).
- L2: .lgpd/ROPA.md consolidado a partir do data-map (Art. 37: controlador, finalidade, categorias de titulares e dados, compartilhamento, segurança, prazos).
- L4: .lgpd/vendors.md — operadores reais (Neon Auth/DB, Vercel, Cloudflare R2, PostHog, Stripe) + qual tem DPA e o que falta.
- L5: .lgpd/gaps.md + proposta de retenção por categoria (logs de eventos de VSL, sessões, contas apagadas) — política escrita, purges ainda opt-in: recomendar prazo concreto.
- L6: .lgpd/anonymization.md — estado atual do analytics (viewer_id pseudônimo, page_url) + o que anonimizar.
- L7: .lgpd/dsar/workflow.md — como um titular pede acesso/exclusão hoje (rota /api/account/export existe com gaps) + correção do export (código, item 2 abaixo).
- L8: .lgpd/incidents/runbook.md — Art. 48 + Res. 15/2024: quem decide, prazos (3 dias úteis ANPD), o que registrar por 5 anos (.lgpd/incidents/log.md criado), integração com alertOperations (nosso canal) como detecção.
- L10: .lgpd/eca-digital.md — Lei 15.211/2025: plataforma é B2B (produtores adultos) mas VIEWERS podem ser menores; avaliar obrigações aplicáveis ao embed (não direcionada a menores? verificação de idade necessária?) — recomendação prática mínima honesta.
- L12: .lgpd/encarregado.md — draft de designação (dono como encarregado ou nomear; Res. 18/2024 exige canal publicado — apontar para /contact).
- L13: STATUS.md final + plano de remediação priorizado em gaps.md.

## CÓDIGO (2 fixes seguros, faça além dos docs)
1. Delete de conta cancela assinatura Stripe ANTES do wipe: src/app/api/account/delete/route.ts (leia o fluxo) — se profiles.stripeCustomerId e subscription ativa → getStripe().subscriptions.cancel(subscription_id, {prorate:false? cancel at period end vs imediato: IMEDIATO, conta está sendo apagada}) + alertOperations. Teste no padrão fake-db + mock stripe.
2. Export DSAR completa: /api/account/export incluir team_members/invites da conta, billing_churn_surveys (feedback é dado do titular!), e nota sobre posthog (dados no operador, link da política). Ler a rota atual primeiro e extender com o mesmo padrão. Testes.

## REGRA DE CHECKPOINT (respeite)
NÃO gere .lgpd/policies/privacy-policy-v*.md (exige revisão jurídica — checkpoint do dono) e NÃO publique nada; deixe no gaps.md como pendência com citação (Art. 9º).

## Regras gerais
NÃO toque em: features/landing-page, lib/billing (exceto o fix 1 acima que é account/delete), integrations, .github. Zero deps. PowerShell Set-Content PROIBIDO com acentos. tsc 0 + vitest 618+ + lint 0. Sem build, sem push. Resposta final: STATUS resumido, top-10 gaps com artigo, os 2 fixes de código, o que fica de decisão do dono (encarregado, política publicável, purges ON, jurídico).
