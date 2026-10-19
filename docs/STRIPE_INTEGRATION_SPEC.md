# Stripe — Opção A (Checkout Hospedado) — spec de implementação

Fonte: dono (19/10/2026) + skills stripe-best-practices (payments.md, billing.md, security.md). CONTRATO — implemente exatamente isto.

## Regras das skills (obrigatórias, sem exceção)

1. SDK `stripe@^23` (Node). Instanciar `new Stripe(key)` por instância — NUNCA api key global. RAK (`rk_`) no env, nunca `sk_` em código.
2. **NUNCA passar `payment_method_types`** em nenhuma chamada (dynamic payment methods — Pix/cartão/Link aparecem sozinhos conforme Dashboard). Se precisar allowlist: `allowed_payment_method_types`.
3. `checkout.sessions.create` com `integration_identifier: "prisma-player-" + 8 letras aleatórias` (API 2026-03-25+).
4. **Webhooks obrigatórios**: fulfillment SÓ no handler — `checkout.session.completed` + `checkout.session.async_payment_succeeded` (fulfill somente se `payment_status !== "unpaid"`), `checkout.session.async_payment_failed`, `customer.subscription.updated|deleted`, `invoice.paid`, `invoice.payment_failed` + risk-side: `charge.dispute.created`, `charge.refunded`, `radar.early_fraud_warning.created` (skill: integração de assinatura NÃO está completa sem eles). Verificar assinatura SEMPRE (`stripe.webhooks.constructEvent` com body BRUTO — `await request.text()`, não `request.json()`).
5. Billing APIs + Checkout `mode:"subscription"`; **1 Product por plano** (Iniciante/Pro/Escala), Prices mensal+anual do MESMO product (billing variants ✓); créditos: 1 Product por pacote. NUNCA usar objeto `plan` (deprecated) — só Prices.
6. OwnerId via `client_reference_id` na session (campo oficial) — metadata apenas como fallback.
7. `automatic_tax` DESLIGADO (Stripe Tax não cobre Brasil; nota no .env.example).
8. Overage de plays: FORA desta fase (hoje é informativo no pricing). Fase 2 = Metronome com Stripe Subscriptions (skill: nova UBB = Metronome, nunca Billing Meters). Documentar em docs/.

## Mapa dos planos → Stripe (lookup_key)

Prices criados com `lookup_key` (o código resolve por lookup, ZERO migration no seu DB):
- `plano_iniciante_mensal` 6790 BRL/mês · `plano_iniciante_anual` 53880 BRL (à vista)
- `plano_pro_mensal` 14790 · `plano_pro_anual` 117480
- `plano_escala_mensal` 34790 · `plano_escala_anual` 275880
- `creditos_ia_start` 1990 · `creditos_ia_pro` 8990 · `creditos_ia_escala` 32990 (one-time)
- Products: "Prisma Iniciante"/"Prisma Pro"/"Prisma Escala"/"Créditos IA Start|Pro|Escala" (metadata: `prisma_plan: <slug>`)

Entregar `scripts/stripe-seed.mjs` (roda com a RAK do dono: cria products/prices com lookup_keys, idempotente — lista antes de criar).

## Arquivos

1. `src/lib/billing/stripe/client.ts` — server-only: `getStripe()` retorna `new Stripe(process.env.STRIPE_SECRET_KEY)` (lazy, erro claro se env ausente); `resolvePriceByLookupKey(lookup)` com cache Map (TTL 10min, fallback: prices.list). Entrada em tests/server-boundary.test.ts PRIVILEGED + regex.
2. `POST /api/billing/checkout` — body `{ planSlug: "iniciante"|"pro"|"escala", billing: "monthly"|"annual" }`. csrfGuard + guard() + rate limit 10/min. Resolve lookup (`plano_${slug}_${billing}`), cria session `mode:"subscription"`, `client_reference_id: ownerId`, `customer: stripe_customer_id` (se existir em profiles), `subscription_data.metadata = { accountOwnerId }`, success_url `${origin}/dashboard/billing?checkout=success&session_id={CHECKOUT_SESSION_ID}`, cancel_url `${origin}/dashboard/billing?checkout=cancelled`, `integration_identifier`. Retorna `{ url }` (redirect do client).
3. `POST /api/billing/ai-credits/checkout` — body `{ packageSlug }` → lookup `creditos_ia_${slug}`, `mode:"payment"`, mesmo padrão, `payment_intent_data.metadata`.
4. `POST /api/billing/portal` — billingPortal.sessions.create (exige stripe_customer_id no profiles; sem customer → 409 sem_stripe_customer). Guard+csrf+ratelimit.
5. `POST /api/webhooks/stripe` — raw text + constructEvent (400 invalid_signature sem log de segredo). Idempotência: REUTILIZAR tabela `payment_webhook_events` (event_id = evt_xxx unique, status received/processed/failed) — mesma tabela que o admin UptimeCard lê. Dispatcher por event.type conforme regra 4. Ativações:
   - Session de plano ok → upsert `subscriptions` (status active, provider "stripe", provider_subscription_id = session.subscription, plan_id da billing_plans por slug OU direto), `profiles.stripe_customer_id = session.customer`, `current_period_end` da subscription retrieve.
   - Session de créditos ok → credits na `ai_credit_wallets` (balance +) e linha em `ai_credit_ledger` (razão: stripe_checkout, ref session.id).
   - `customer.subscription.deleted` → status canceled; `invoice.payment_failed` → status past_due (não cancela — dunning é do Stripe); `invoice.paid` de renovação → garante active + novo period_end.
   - Risk-side: log estruturado + status na payment_webhook_events (fase 1 não suspende automático — documentar).
6. Migration drizzle: `ALTER TABLE profiles ADD COLUMN IF NOT EXISTS stripe_customer_id text` (+ drizzle/schema.ts + bloco idempotente em docs/neon-migration/neon-schema.sql + SQL direto pro dono no relatório).
7. Página `src/app/dashboard/billing/page.tsx`: cards de plano ganham botão real `Assinar/Mudar para este plano` (chama checkout e `window.location = url`); pacotes de créditos idem `Comprar`; se assinatura ativa → botão `Gerenciar assinatura` (portal) substitui CTAs de plano; badge "Pagamentos em atualização" SAI; query `?checkout=success` mostra toast/aviso "Pagamento confirmado — processando" (a verdade vem do webhook). Client component pequeno `BillingCheckoutButtons.tsx` na pasta de features (padrão de botões existentes que foram removidos — recriar limpo no estilo shadcn).
8. `.env.example`: `STRIPE_SECRET_KEY` (nota: use RAK), `STRIPE_WEBHOOK_SECRET`, nota de tax BR.
9. Tests (padrão fake-db do repo): checkout route (mock do client stripe: 400 slug inválido, 500 sem env → 503 com clear_error, url no corpo), webhook (assinatura inválida → 400, evento repetido → 200 no-op, ativação de plano grava subscription + customer id, créditos somam wallet, payment_status unpaid NÃO fulfil). Suíte atual 439+ deve crescer e ficar verde.

## Fora de escopo
Overage metered/Metronome (fase 2), Embedded/Payment Element, Connect, Stripe Tax, admin UI nova (UptimeCard segue lendo a mesma tabela).

## Validação
tsc 0 · npm test verde (439+ novos) · eslint 0 · NÃO rodar build (Lead roda) · NÃO push. Landing/pricing/auth/assets intocáveis. PowerShell Set-Content PROIBIDO em arquivos com acentos (só edit/write/read tools).
