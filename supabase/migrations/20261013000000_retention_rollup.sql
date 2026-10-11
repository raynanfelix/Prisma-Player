-- Retenção, rollup e higiene (aditivo, idempotente, não destrutivo).
-- Purges destrutivos SÓ rodam se o cron da aplicação passar a variável
-- correspondente (ver src/app/api/cron/route.ts); sem env, nada é apagado.
-- Rollup é insert-only e pode rodar sempre.

-- 1. Rollup diário por vídeo (fonte para dashboards; cru continua intacto).
create table if not exists public.video_daily_stats (
  video_id uuid not null references public.videos(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  day date not null,
  impressions integer not null default 0 check (impressions >= 0),
  plays integer not null default 0 check (plays >= 0),
  completes integer not null default 0 check (completes >= 0),
  conversions integer not null default 0 check (conversions >= 0),
  watch_seconds numeric not null default 0 check (watch_seconds >= 0),
  sessions integer not null default 0 check (sessions >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint video_daily_stats_pkey primary key (video_id, day)
);
create index if not exists video_daily_stats_user_day_idx
  on public.video_daily_stats (user_id, day desc);
alter table public.video_daily_stats enable row level security;
revoke all on public.video_daily_stats from anon, authenticated;

create or replace function public.rollup_video_daily_stats(p_days_back integer default 7)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_days integer := greatest(1, least(coalesce(p_days_back, 7), 31));
  v_rows integer := 0;
begin
  insert into public.video_daily_stats
    (video_id, user_id, day, impressions, plays, completes, conversions, watch_seconds, sessions, updated_at)
  select
    video_id,
    user_id,
    (created_at at time zone 'utc')::date as day,
    count(*) filter (where event_type = 'impression'),
    count(*) filter (where event_type = 'play'),
    count(*) filter (where event_type = 'complete'),
    count(*) filter (where event_type = 'conversion'),
    coalesce(sum(watched_seconds) filter (where event_type = 'progress'), 0),
    count(distinct session_id),
    now()
  from public.video_events
  where created_at >= date_trunc('day', now() - (v_days || ' days')::interval)
  group by video_id, user_id, day
  on conflict (video_id, day) do update set
    impressions = excluded.impressions,
    plays = excluded.plays,
    completes = excluded.completes,
    conversions = excluded.conversions,
    watch_seconds = excluded.watch_seconds,
    sessions = excluded.sessions,
    updated_at = now();
  get diagnostics v_rows = row_count;
  return v_rows;
end;
$$;
revoke execute on function public.rollup_video_daily_stats(integer) from public, anon, authenticated;
grant execute on function public.rollup_video_daily_stats(integer) to service_role;

-- 2. Purges em lote com teto (chamadas só com env explícita no cron).
create or replace function public.purge_old_video_events(p_days integer default 400)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cut timestamptz := now() - (greatest(30, coalesce(p_days, 400)) || ' days')::interval;
  v_total bigint := 0;
  v_batch integer;
  v_loops integer := 0;
begin
  loop
    delete from public.video_events where ctid in (
      select ctid from public.video_events where created_at < v_cut limit 5000
    );
    get diagnostics v_batch = row_count;
    v_total := v_total + v_batch;
    v_loops := v_loops + 1;
    exit when v_batch = 0 or v_loops >= 200;
  end loop;
  return v_total;
end;
$$;
revoke execute on function public.purge_old_video_events(integer) from public, anon, authenticated;
grant execute on function public.purge_old_video_events(integer) to service_role;

create or replace function public.purge_old_player_events(p_days integer default 400)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cut timestamptz := now() - (greatest(30, coalesce(p_days, 400)) || ' days')::interval;
  v_total bigint := 0;
  v_batch integer;
  v_loops integer := 0;
begin
  loop
    delete from public.player_events where ctid in (
      select ctid from public.player_events where created_at < v_cut limit 5000
    );
    get diagnostics v_batch = row_count;
    v_total := v_total + v_batch;
    v_loops := v_loops + 1;
    exit when v_batch = 0 or v_loops >= 200;
  end loop;
  return v_total;
end;
$$;
revoke execute on function public.purge_old_player_events(integer) from public, anon, authenticated;
grant execute on function public.purge_old_player_events(integer) to service_role;

-- 3. Webhook payload: após o período operacional, mantém metadados e apaga o blob.
create or replace function public.scrub_old_webhook_payloads(p_days integer default 90)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cut timestamptz := now() - (greatest(7, coalesce(p_days, 90)) || ' days')::interval;
  v_total bigint := 0;
begin
  update public.payment_webhook_events
  set payload = '{}'::jsonb
  where received_at < v_cut
    and status in ('processed', 'ignored')
    and payload <> '{}'::jsonb;
  get diagnostics v_total = row_count;
  return v_total;
end;
$$;
revoke execute on function public.scrub_old_webhook_payloads(integer) from public, anon, authenticated;
grant execute on function public.scrub_old_webhook_payloads(integer) to service_role;

-- 4. Security events: retenção configurável (LGPD minimização; padrão desligado no app).
create or replace function public.purge_old_security_events(p_days integer default 365)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cut timestamptz := now() - (greatest(30, coalesce(p_days, 365)) || ' days')::interval;
  v_total bigint := 0;
begin
  delete from public.security_events where created_at < v_cut;
  get diagnostics v_total = row_count;
  return v_total;
end;
$$;
revoke execute on function public.purge_old_security_events(integer) from public, anon, authenticated;
grant execute on function public.purge_old_security_events(integer) to service_role;

-- 5. Inbox: seed usa kinds tip/alert que o CHECK original rejeita (o insert
-- de 4 linhas falhava atomicamente e o seed nunca persistia). Estende o
-- CHECK e trava welcome duplicado na race do primeiro GET.
alter table public.user_inbox drop constraint if exists user_inbox_kind_check;
alter table public.user_inbox add constraint user_inbox_kind_check
  check (kind in ('welcome', 'trial', 'tip', 'alert', 'billing', 'security', 'system'));
create unique index if not exists user_inbox_welcome_uidx
  on public.user_inbox (user_id, kind) where kind = 'welcome';

-- 6. Teams via JWT: a função só enxerga o próprio vínculo (auth.uid
-- interno), então liberar EXECUTE não vaza nada e conserta leituras
-- autenticadas diretas que hoje podem falhar na policy.
grant execute on function private.is_account_team_member(uuid) to authenticated;
