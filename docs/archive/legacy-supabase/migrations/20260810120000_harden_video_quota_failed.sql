-- RM-04 (MEDIUM): storage-quota bypass via status='failed'.
--
-- Dois cintos de seguranca:
--  1. Guarda de transicoes de status: nenhum JWT de usuario (authenticated, via
--     PostgREST /rest/v1/videos) pode mover um video PARA 'failed' nem DEVOLVER
--     um video de 'failed' para um estado contavel. So o service_role (o cliente
--     admin do servidor, createAdminClient) faz essas transicoes legitimamente:
--       - abort de multipart        -> processing -> failed  (multipart/route.ts)
--       - finalize PATCH /api/videos -> processing -> failed / ready
--     A checagem usa auth.role(), o claim "role" do JWT que o PostgREST le para
--     o GUC request.jwt.claim.role — o mesmo schema `auth` que a regra de RLS
--     desta base ja usa em ((select auth.uid()) = user_id). O claim "role" de um
--     JWT nao pode ser forjado pelo cliente (o token e assinado pelo servidor).
--  2. Cobranca de TODOS os bytes armazenados: v_used passa a somar size_bytes de
--     TODAS as linhas do usuario (sem excluir status='failed'). Um objeto que
--     esta no R2 custa dinheiro e conta para o plano, independente do status.
--     A exclusao "v.id <> new.id" continua (linha em transacao/insercao nao
--     participa da propria soma). O checador v_used + new.size_bytes > v_limit
--     passa a valer para todos os status — remove o pulo de new.status = 'failed'.
--     Isto deixa o pre-check do servidor (getStorageUsedBytes em
--     src/lib/access/service.ts) com o mesmo total do banco.
--
-- A estrutura atomica (pg_advisory_xact_lock por user_id) e mantida intacta.

-- ---------------------------------------------------------------------------
-- Parte 2: soma/checagem de cota contando todos os status
-- ---------------------------------------------------------------------------
create or replace function private.enforce_video_storage_quota()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_used bigint;
  v_limit bigint;
begin
  perform pg_advisory_xact_lock(hashtextextended(new.user_id::text, 71001));

  select coalesce(max(bp.storage_gb), 5)::bigint * 1073741824
    into v_limit
  from public.subscriptions s
  join public.billing_plans bp on bp.id = s.plan_id
  where s.user_id = new.user_id
    and s.status = 'active'
    and (s.current_period_end is null or s.current_period_end > now());

  v_limit := coalesce(v_limit, 5 * 1073741824::bigint);

  -- Todos os bytes armazenados contam: o objeto no R2 existe e custa dinheiro
  -- mesmo com status='failed'. A propria linha (new) fica de fora da soma.
  select coalesce(sum(v.size_bytes), 0)::bigint
    into v_used
  from public.videos v
  where v.user_id = new.user_id
    and v.id <> new.id;

  -- Aplica a todos os status (inclusive 'failed'): nao e possivel "escapar"
  -- bytes da cota mudando o status.
  if v_used + new.size_bytes > v_limit then
    raise exception using errcode = 'P0001', message = 'storage_quota_exceeded';
  end if;
  return new;
end;
$$;

revoke execute on function private.enforce_video_storage_quota() from public, anon, authenticated;
drop trigger if exists videos_atomic_storage_quota on public.videos;
create trigger videos_atomic_storage_quota
before insert or update of user_id, size_bytes, status on public.videos
for each row execute procedure private.enforce_video_storage_quota();

-- ---------------------------------------------------------------------------
-- Parte 1: guarda de transicoes de status (o bypass em si)
-- ---------------------------------------------------------------------------
create or replace function private.guard_video_status_transitions()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role text := auth.role();
  v_counting_states constant text[] := array['draft', 'processing', 'ready', 'archived'];
begin
  -- Chamadas feitas com a service_role key (unico caminho legitimo de transicao
  -- de status neste app) passam sem checagem.
  if v_role = 'service_role' then
    return new;
  end if;

  -- Qualquer outro papel (authenticated/anon via REST, ou funcoes sem JWT)
  -- nao pode:
  --  (a) marcar 'failed' a partir de qualquer outro valor; nem
  --  (b) devolver um 'failed' para um estado contavel (draft/processing/ready/archived).
  if tg_op = 'INSERT' then
    if new.status = 'failed' then
      raise exception using errcode = 'P0001', message = 'forbidden_status_transition';
    end if;
  elsif new.status is distinct from old.status then
    if new.status = 'failed' and old.status is distinct from 'failed' then
      raise exception using errcode = 'P0001', message = 'forbidden_status_transition';
    end if;
    if old.status = 'failed' and new.status = any (v_counting_states) then
      raise exception using errcode = 'P0001', message = 'forbidden_status_transition';
    end if;
  end if;

  return new;
end;
$$;

revoke execute on function private.guard_video_status_transitions() from public, anon, authenticated;
drop trigger if exists videos_guard_status_transitions on public.videos;
create trigger videos_guard_status_transitions
before insert or update of status on public.videos
for each row execute procedure private.guard_video_status_transitions();