create table public.player_events (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  test_id uuid not null,
  variant_id uuid not null references public.ab_test_variants(id) on delete cascade,
  video_id uuid not null,
  session_id uuid not null,
  event_type text not null check (event_type in ('impression', 'play', 'progress', 'complete')),
  progress_percent smallint not null default 0 check (progress_percent in (0, 25, 50, 75, 100)),
  watched_seconds numeric(12,3) not null default 0 check (watched_seconds >= 0),
  created_at timestamptz not null default now(),
  foreign key (test_id, user_id) references public.ab_tests(id, user_id) on delete cascade,
  foreign key (video_id, user_id) references public.videos(id, user_id) on delete cascade,
  unique (test_id, variant_id, session_id, event_type, progress_percent)
);

create index player_events_owner_test_idx on public.player_events (user_id, test_id, created_at desc);
create index player_events_test_variant_idx on public.player_events (test_id, variant_id, event_type);

alter table public.player_events enable row level security;

create policy player_events_select_own on public.player_events for select to authenticated
  using ((select auth.uid()) = user_id);

grant select on public.player_events to authenticated;
grant usage, select on sequence public.player_events_id_seq to authenticated;
