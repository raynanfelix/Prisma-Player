# Pagamentos completos — ciclo de vida (23/10/2026)

POLÍTICAS DO DONO (confirmadas): past_due = 7 dias de tolerância → auto-cancel; reembolso = botão admin, janela 7 dias; cancelamento = fim de período (portal já faz). Stripe nativo pro resto (smart retries/dunning do Stripe rodam no meio-tempo). SEM travessões em textos novos. Set-Content proibido com acentos. Valide tsc+vitest por item.

## 1. Dunning: inbox quando pagamento falha
`src/lib/billing/stripe/webhook.ts` handler `invoice.payment_failed`: além do status past_due atual, criar mensagem de inbox pro usuário (padrão do notifyTrialsEndingSoon em lib/cron-tasks/tasks.ts: idempotente por actionUrl, CTA "Atualizar cartão" apontando pro portal). Texto PT-BR claro ("Seu pagamento falhou — atualize seu cartão para não perder o acesso; você tem 7 dias"). Teste: handler cria mensagem idempotente.

## 2. Grace de 7 dias → auto-cancel (cron)
`src/lib/cron-tasks/tasks.ts`: novo step `cancelPastDueSubscriptions`: subscriptions com status='past_due' E updated_at < now-7d E provider='stripe' → getStripe().subscriptions.cancel(provider_subscription_id, {prorate:false}) (o webhook customer.subscription.deleted que JÁ EXISTE sincroniza local). Confira se updated_at é setado quando o status muda no webhook handler — se não for confiável, use o timestamp do evento fallido gravado. Não cancele assinaturas AbacatePay legadas (só stripe). Testes: 7d+1 → cancel chamado; 6d → não; sem stripe env → skip silencioso; abacatepay → ignorada.

## 3. Lembretes dia 3 e dia 6 (cron, mesmo step)
Dentro do grace: past_due há 3d e 6d → mensagem inbox "lembrete" (idempotente por dia, actionUrl distinto por dia). Testes: dia 3 cria, dia 2 não, dia 6 cria, repetido não duplica.

## 4. Reembolso admin (janela 7 dias)
Rota NOVA `POST /api/admin/users/refund` (padrão das rotas admin: guard role admin + csrf + ratelimit): body {userId}; fluxo: profile → stripeCustomerId → último charge pago (stripe.charges.list customer, limit 5, primeiro com status=succeeded) → se charge.created < now-7d → 400 refund_window_expired; senão stripe.refunds.create({charge: id}) + alertOperations(kind refund_issued). Sem customer/charge → 404. O webhook `charge.refunded` que JÁ EXISTE alerta (confira; se só alerta, adicionar também mensagem de inbox pro usuário "Reembolso processado — até N dias úteis no cartão"). UI: `UserActions.tsx` botão "Reembolsar último pagamento" (só quando subStatus ativa/past_due e provider stripe) com AdminConfirm (motivo obrigatório — o AdminConfirm corrigido com ref de foco NÃO TOQUE nele, só use). Const `REFUND_WINDOW_DAYS = 7` em lib/billing. Testes: rota (window 400, sem charge 404, sucesso + refund.create chamado, não-admin 401/403).

## 5. Cancelamento fim-de-período: já coberto
Portal com subscription_cancel ✓ + CancelSurvey ✓. NADA novo aqui — só confirme no relatório.

## Regras
NÃO tocar: AdminConfirm.tsx (usar, não editar), landing, integrations, auth internals, .github, proxy.ts. Zero deps. tsc 0 + vitest 632+ + lint 0. Sem build, sem push. Resposta: arquivos, testes, políticas aplicadas, o que o dono valida manualmente.
