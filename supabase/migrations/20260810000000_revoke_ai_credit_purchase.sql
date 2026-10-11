-- Estorno de compra de creditos Prisma IA (RH-01).
--
-- O fluxo de checkout.completed concede os creditos na carteira
-- (apply_ai_credit_purchase), mas checkout.refunded/disputed/lost apenas marcava
-- o checkout, permitindo uso gratuito apos estorno. Esta funcao reverte a
-- entrega de forma idempotente e conservadora:
--
--  * so age quando o checkout esta 'paid' E existe o lancamento de compra na
--    ai_credit_ledger (referencia `ai-credit:<checkout_id>`, o mesmo padrao
--    usado por apply_ai_credit_purchase). Sem compra registrada nao ha o que
--    estornar — um refund de algo nunca pago nao reverte nada;
--  * converte o lancamento de compra num estorno usando a MESMA referencia
--    (UNIQUE da ai_credit_ledger), entao entregas repetidas do webhook sao
--    idempotentes;
--  * decrementa o saldo da carteira com piso 0 (nunca negativo);
--  * marca o checkout como 'refunded'.

create or replace function public.revoke_ai_credit_purchase(p_checkout_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  ch_user_id uuid;
  ch_status text;
  credited int;
  reference_key text;
begin
  select user_id, status
  into ch_user_id, ch_status
  from public.ai_credit_checkouts
  where id = p_checkout_id
  for update;

  if ch_user_id is null then
    raise exception 'credit checkout not found';
  end if;

  -- Estorno so desfaz uma entrega que existiu de fato.
  if ch_status <> 'paid' then
    return;
  end if;

  reference_key := 'ai-credit:' || p_checkout_id::text;

  -- O valor creditado na compra vem do proprio lancamento (fonte da verdade).
  select amount
  into credited
  from public.ai_credit_ledger
  where reference = reference_key
    and reason = 'purchase';

  if credited is null then
    -- Checkout pago sem lancamento de compra: nao ha creditos a estornar.
    return;
  end if;

  -- Reversao na MESMA referencia da compra (UNIQUE) para idempotencia: a
  -- segunda chamada apenas reafirma o mesmo lancamento de estorno.
  insert into public.ai_credit_ledger (user_id, amount, reason, reference, metadata)
  values (
    ch_user_id,
    -credited,
    'refund',
    reference_key,
    jsonb_build_object('checkoutId', p_checkout_id, 'revoked', true)
  )
  on conflict (reference) do update
    set amount = excluded.amount,
        reason = excluded.reason,
        metadata = excluded.metadata;

  update public.ai_credit_wallets
  set balance = greatest(0, balance - credited),
      updated_at = now()
  where user_id = ch_user_id;

  update public.ai_credit_checkouts
  set status = 'refunded',
      updated_at = now()
  where id = p_checkout_id;
end;
$$;

revoke execute on function public.revoke_ai_credit_purchase(uuid) from public, anon, authenticated;
grant execute on function public.revoke_ai_credit_purchase(uuid) to service_role;

comment on function public.revoke_ai_credit_purchase(uuid) is
  'Estorna credito de IA comprado apos refund/dispute/lost. Idempotente pela UNIQUE de ai_credit_ledger.reference (mesma chave do lancamento de compra).';
