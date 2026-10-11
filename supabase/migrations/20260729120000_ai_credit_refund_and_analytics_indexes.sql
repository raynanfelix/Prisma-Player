-- 1. Estorno de crédito de IA.
--
-- O débito passou a acontecer ANTES da chamada ao provedor (antes era depois,
-- e uma falha no débito significava uma análise já paga à NVIDIA, não entregue
-- e não cobrada). Com o débito na frente, é preciso poder devolver quando o
-- provedor falha. A referência do estorno é derivada da referência do consumo,
-- então a UNIQUE de `reference` também garante idempotência: um mesmo job não
-- consegue ser estornado duas vezes.

create or replace function public.refund_ai_credit(p_user_id uuid, p_reference text)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare remaining integer;
begin
  -- Só estorna se o consumo correspondente existir de fato.
  if not exists (
    select 1 from public.ai_credit_ledger
    where user_id = p_user_id and reference = p_reference and reason = 'usage'
  ) then
    raise exception 'usage_not_found';
  end if;

  insert into public.ai_credit_ledger (user_id, amount, reason, reference, metadata)
  values (p_user_id, 1, 'refund', p_reference || ':refund', jsonb_build_object('refund_of', p_reference));

  update public.ai_credit_wallets
  set balance = balance + 1,
      lifetime_used = greatest(0, lifetime_used - 1),
      updated_at = now()
  where user_id = p_user_id
  returning balance into remaining;

  return coalesce(remaining, 0);
exception when unique_violation then
  -- Estorno já registrado: devolve o saldo atual sem creditar de novo.
  select balance into remaining from public.ai_credit_wallets where user_id = p_user_id;
  return coalesce(remaining, 0);
end;
$$;

revoke execute on function public.refund_ai_credit(uuid, text) from public, anon, authenticated;
grant execute on function public.refund_ai_credit(uuid, text) to service_role;

comment on function public.refund_ai_credit(uuid, text) is
  'Devolve 1 crédito de IA quando a análise falha após o débito. Idempotente pela UNIQUE de ai_credit_ledger.reference.';

-- 2. Índices para as contagens agregadas.
--
-- A lista de vídeos deixou de trazer todos os eventos de play para contar
-- sessões em JavaScript e passou a usar count() no Postgres. Sem este índice a
-- contagem vira um seq scan em `video_events`, que é a maior tabela do sistema.

create index if not exists video_events_video_event_type_idx
  on public.video_events (video_id, event_type);

create index if not exists video_events_video_created_idx
  on public.video_events (video_id, created_at desc);
