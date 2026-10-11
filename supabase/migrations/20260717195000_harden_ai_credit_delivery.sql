-- Entrega idempotente de créditos comprados.
-- A referência é estável por checkout e a carteira é criada caso uma conta antiga não a possua.

create or replace function public.apply_ai_credit_purchase(
  p_checkout_id uuid,
  p_provider_event_id text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  c record;
  total_credits integer;
begin
  select
    ch.user_id,
    p.credits + p.bonus_credits as credit_total
  into c
  from public.ai_credit_checkouts ch
  join public.ai_credit_products p on p.id = ch.product_id
  where ch.id = p_checkout_id
  for update of ch;

  if c.user_id is null then
    raise exception 'credit checkout not found';
  end if;

  total_credits := c.credit_total;

  insert into public.ai_credit_ledger (user_id, amount, reason, reference, metadata)
  values (
    c.user_id,
    total_credits,
    'purchase',
    p_provider_event_id,
    jsonb_build_object('checkoutId', p_checkout_id)
  )
  on conflict (reference) do nothing;

  if found then
    insert into public.ai_credit_wallets (user_id, balance, lifetime_purchased)
    values (c.user_id, total_credits, total_credits)
    on conflict (user_id) do update
    set balance = public.ai_credit_wallets.balance + excluded.balance,
        lifetime_purchased = public.ai_credit_wallets.lifetime_purchased + excluded.lifetime_purchased,
        updated_at = now();
  end if;
end;
$$;

revoke execute on function public.apply_ai_credit_purchase(uuid, text) from public, anon, authenticated;
grant execute on function public.apply_ai_credit_purchase(uuid, text) to service_role;
