create table public.video_events (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  video_id uuid not null,
  session_id uuid not null,
  event_type text not null check (event_type in ('impression', 'play', 'progress', 'complete', 'cta_click', 'conversion')),
  progress_percent smallint not null default 0 check (progress_percent in (0, 10, 25, 50, 75, 90, 100)),
  watched_seconds numeric(12,3) not null default 0 check (watched_seconds >= 0),
  country_code text not null default 'XX' check (char_length(country_code) = 2),
  device_type text not null default 'desktop' check (device_type in ('desktop', 'mobile', 'tablet', 'other')),
  os_name text not null default 'Other',
  browser_name text not null default 'Other',
  traffic_source text not null default 'Direto',
  created_at timestamptz not null default now(),
  foreign key (video_id, user_id) references public.videos(id, user_id) on delete cascade,
  unique (video_id, session_id, event_type, progress_percent)
);

create index video_events_owner_video_created_idx on public.video_events (user_id, video_id, created_at desc);
create index video_events_video_type_created_idx on public.video_events (video_id, event_type, created_at desc);
create index video_events_live_idx on public.video_events (video_id, created_at desc) where event_type in ('impression', 'play', 'progress');

alter table public.video_events enable row level security;

create policy video_events_select_own on public.video_events for select to authenticated
  using ((select auth.uid()) = user_id);

grant select on public.video_events to authenticated;
