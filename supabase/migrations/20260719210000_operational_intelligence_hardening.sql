-- Inteligencia operacional: viewers realmente ativos, webhooks separados e benchmark anonimo.

alter table public.intelligence_controls
  add column if not exists alert_webhook_enabled boolean not null default false,
  add column if not exists alert_webhook_url text
    check (alert_webhook_url is null or alert_webhook_url ~ '^https://'),
  add column if not exists last_report_sent_at timestamptz;

create table if not exists public.video_live_sessions (
  video_id uuid not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  session_id uuid not null,
  country_code text not null default 'XX' check (char_length(country_code) = 2),
  device_type text not null default 'other' check (device_type in ('desktop','mobile','tablet','other')),
  progress_percent smallint not null default 0 check (progress_percent between 0 and 100),
  last_seen_at timestamptz not null default now(),
  primary key (video_id, session_id),
  foreign key (video_id, user_id) references public.videos(id, user_id) on delete cascade
);

create index if not exists video_live_sessions_active_idx
  on public.video_live_sessions (video_id, last_seen_at desc);

alter table public.video_live_sessions enable row level security;
drop policy if exists video_live_sessions_read_own on public.video_live_sessions;
create policy video_live_sessions_read_own on public.video_live_sessions
for select to authenticated using ((select auth.uid()) = user_id);
grant select on public.video_live_sessions to authenticated;
revoke insert, update, delete on public.video_live_sessions from anon, authenticated;

create or replace function public.get_global_video_benchmark()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with per_video as (
    select
      e.video_id,
      count(distinct e.session_id) filter (where e.event_type = 'impression') as impressions,
      count(distinct e.session_id) filter (where e.event_type = 'play') as plays,
      count(distinct e.session_id) filter (where e.event_type = 'complete') as completes,
      count(distinct e.session_id) filter (where e.event_type = 'conversion') as conversions
    from public.video_events e
    where e.created_at >= now() - interval '90 days'
      and coalesce(e.risk_score, 0) < 70
    group by e.video_id
  ), qualified as (
    select * from per_video where plays >= 10
  ), totals as (
    select
      count(*)::integer as sample_videos,
      coalesce(sum(impressions), 0)::bigint as impressions,
      coalesce(sum(plays), 0)::bigint as plays,
      coalesce(sum(completes), 0)::bigint as completes,
      coalesce(sum(conversions), 0)::bigint as conversions
    from qualified
  )
  select jsonb_build_object(
    'sampleVideos', sample_videos,
    'samplePlays', plays,
    'qualified', sample_videos >= 3 and plays >= 100,
    'playRate', case when impressions > 0 then round(plays * 100.0 / impressions, 1) else 0 end,
    'completion', case when plays > 0 then round(completes * 100.0 / plays, 1) else 0 end,
    'conversion', case when plays > 0 then round(conversions * 100.0 / plays, 1) else 0 end
  ) from totals;
$$;

revoke execute on function public.get_global_video_benchmark() from public, anon, authenticated;
grant execute on function public.get_global_video_benchmark() to service_role;
