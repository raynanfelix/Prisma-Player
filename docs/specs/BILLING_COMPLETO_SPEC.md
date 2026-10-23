# Billing Completo — spec (20/10/2026)

Fonte: dono. Pacote de fechamento do billing. Valide tsc+vitest após cada item. Set-Content PROIBIDO com acentos.

## 0. DIAGNÓSTICO REAL no botão (mata o mistério)
`BillingCheckoutButtons.tsx` `requestCheckoutUrl`: os 502/503 genéricos somem — mostre o `message` REAL do backend (a rota 502 price_not_found já devolve message detalhada). Se response.message ausente, mantém fallback. Teste: 502 com message → mostra a message do backend.

## 1. Trial marca o plano atual na vitrine
`BillingPlansShowcase.tsx`: nova prop `trialActive: boolean` (page passa `access.trialStatus === "active"`). Quando trial: o card **Escala** ganha badge "Seu plano atual (teste)" e o botão dele vira **desabilitado** com label "Incluído no seu teste". Outros planos: botão normal "Assinar". (Trial = ALL_CAPABILITIES = nível Escala — já factual no card.)

## 2. Assinatura ativa: botão de troca por plano (upgrade/downgrade)
Quando `subActive` (provider stripe): cada card de plano ≠ atual ganha botão **"Mudar para este plano"** → chama `/api/billing/portal` (a config do portal com subscription_update fica pendente do claim do sandbox pelo dono — o botão já nasce pronto; portal sem update ainda hoje abre com faturas/cancel/cartão). Card do plano ATUAL: badge "Seu plano atual" + sem botão.

## 3. Tela "Faturamento" nova (em Configurações, nav nova)
`/dashboard/settings` → tab nova "Faturamento" (só com sessão dono; usa patterns do TeamPanel):
- **Invoices**: `GET /api/billing/invoices` NOVO (guard; `stripe.invoices.list({customer: profiles.stripeCustomerId, limit:12})`; sem customer → `{invoices: []}`); lista: data, valor, status (paid/void), link `hosted_invoice_url` (abre PDF no Stripe).
- **Método de pagamento**: `GET /api/billing/payment-method` NOVO (customer → `stripe.customers.retrieve` default_payment_method/card → devolve card {brand, last4, exp_month, exp_year}); sem → estado "Nenhum método salvo". Botão "Atualizar cartão" → `/api/billing/portal`.
- **Assinatura atual**: plano, status, `current_period_end` (do banco subscriptions + billing_plans).
- Estilo shadcn Prisma (cards brancos, pills, verde-lima em ação). Testes de rota (mock stripe) + render.

## 4. Cancelamento com pesquisa de churn (skill churn-prevention)
Novo componente `CancelSurvey.tsx` (na tela Faturamento, botão "Cancelar assinatura" quando ativa):
- Passo 1: pesquisa — "Por que está cancelando?" radio: preço, não uso, problemas técnicos, migrei de ferramenta, outro (textarea obrigatória se outro, opcional senão, 500 chars máx) + campo texto livre "o que podemos melhorar?" (opcional).
- POST `/api/billing/churn-survey` NOVO: guarda em tabela nova `billing_churn_surveys` (migration drizzle: id uuid, user_id text, reason text check in (...), feedback text nullable, created_at; RLS owner-only; + SQL idempotente pro dono em docs/neon-migration/neon-schema.sql + bloco separado no relatório).
- Depois de enviar: tela de "oferta honesta" — "Prefere pausar ou mudar de plano?" com 2 CTAs: "Mudar plano" (portal) e "Continuar com cancelamento" (portal `configuration[flow]`? não — portal normal com cancel enabled; o dono conclui no Stripe).
- NUNCA bloqueia o cancelamento (transparência): survey é 1 clique + abrir portal.

## 5. Trial 100% completo (revisão)
Greps de `trialStatus/trial` no access/cron/rotas: confirmar expiração (cron marca expired → acesso cai), aviso de fim próximo (inbox tem?), upgrade disponível sempre. Gap encontrado → listar e fixar barato; caro → pendência.

## 6. Pass de dados cross-user (auditoria rápida)
Grep das respostas de API que devolvem `config`/dados por conta: confirmar masking (integrations ok), player-configs (não devolvem token), account/export (só dono). Documentar resultado em `docs/SECURITY.md` seção "isolamento verificado" — sem alteração se tudo ok.

## Regras
NÃO tocar: landing/pricing/auth/assets/.github. Migration nova → SQL pro dono. Validação final: tsc 0, vitest 537+, lint 0. Sem build, sem push. Reportar: arquivos, testes, SQL do dono, pendências (claim sandbox → recriar portal config com subscription_update; erro real do checkout agora visível no botão).
