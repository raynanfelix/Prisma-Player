# Stripe — Fase 2: overage de plays (fora do escopo da Opção A)

Decisão do dono (19/10/2026, docs/specs/STRIPE_INTEGRATION_SPEC.md item 8): o overage
de plays está FORA da fase 1. Hoje ele é INFORMATIVO no pricing
(`billing_plans.play_overage_millicents` aparece na vitrine e nos cálculos de
custo, mas NADA é cobrado por play excedente).

## O que a fase 1 entrega (e o que não)

| Conceito | Fase 1 (Opção A — Checkout hospedado) |
|---|---|
| Plano mensal/anual | Stripe Checkout `mode: "subscription"` (Prices por `lookup_key`) |
| Créditos Prisma IA | Checkout one-time + wallet/ledger via webhook |
| Plays excedentes | **Informativo** — medidos (`getMonthPlaysUsed`), nunca cobrados |

## Fase 2 = Metronome com Stripe Subscriptions

Quando o overage virar cobrança real, a rota é **Metronome** — nunca Billing
Meters (regra da skill `stripe-best-practices`/billing.md: qualquer integração
NOVA de usage-based billing usa Metronome; ter uma subscription existente
não é motivo para escolher Billing Meters).

O padrão recomendado é o **"Metronome with Stripe Subscriptions"**:

1. O plano flat (Iniciante/Pro/Escala) PERMANECE na subscription atual —
   Checkout e Customer Portal que já existem seguem funcionando sem migração.
2. O Metronome entra SÓ para o componente de uso: criar o customer Metronome
   com o `stripe_customer_id` (que já gravamos em `profiles.stripe_customer_id`
   no primeiro webhook) e meterar os plays (`getMonthPlaysUsed` já existe como
   fonte).
3. O Metronome empurra a fatura de uso para o MESMO Customer Stripe —
   sem mudança no fluxo de pagamento do usuário.
4. Não cancelar/recriar a subscription ao adicionar uso (regra da skill).

## Não fazer na fase 2

- Billing Meters API para o overage (decisão da skill: não é para
  integrações novas).
- Meterar uso DENTRO da subscription via `items` de price metered — perderia o
  portal/proration que já funcionam.
- Cobrar o excedente via pix avulso manual — sem idempotência/audit.

## Gatilho para começar a fase 2

Volume real de contas passando do `included_plays` com frequência que compense
a operacionalização (hoje medido em `getMonthPlaysUsed` + painel admin). Até
lá, o excedente segue como diferencial comercial do plano (o dono decide
case a case via `admin_audit_log.credit_adjustment`/suporte).
