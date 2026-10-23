create extension if not exists pgcrypto;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  full_name text,
  phone text,
  avatar_url text,
  locale text not null default 'pt-BR' check (locale in ('pt-BR','es','en')),
  email_notifications boolean not null default true,
  security_notifications boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.video_folders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 100),
  created_at timestamptz not null default now(),
  unique (user_id, name),
  unique (id, user_id)
);

create table public.videos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  folder_id uuid,
  title text not null check (char_length(title) between 1 and 200),
  object_path text not null,
  mime_type text not null,
  size_bytes bigint not null check (size_bytes > 0),
  status text not null default 'draft' check (status in ('draft','processing','ready','failed','archived')),
  duration_seconds numeric(12,3),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, object_path),
  unique (id, user_id),
  foreign key (folder_id, user_id) references public.video_folders(id, user_id) on delete set null (folder_id)
);

create table public.player_configs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  video_id uuid not null,
  config jsonb not null default '{}'::jsonb,
  allowed_domains text[] not null default '{}',
  published boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (video_id),
  foreign key (video_id, user_id) references public.videos(id, user_id) on delete cascade
);

create table public.security_events (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  event_type text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index video_folders_user_created_idx on public.video_folders (user_id, created_at desc);
create index videos_user_created_idx on public.videos (user_id, created_at desc);
create index videos_user_status_created_idx on public.videos (user_id, status, created_at desc);
create index videos_folder_id_idx on public.videos (folder_id);
create index player_configs_user_id_idx on public.player_configs (user_id);
create index player_configs_video_id_idx on public.player_configs (video_id);
create index security_events_user_created_idx on public.security_events (user_id, created_at desc);

alter table public.profiles enable row level security;
alter table public.video_folders enable row level security;
alter table public.videos enable row level security;
alter table public.player_configs enable row level security;
alter table public.security_events enable row level security;

create policy profiles_select_own on public.profiles for select to authenticated using ((select auth.uid()) = id);
create policy profiles_update_own on public.profiles for update to authenticated using ((select auth.uid()) = id) with check ((select auth.uid()) = id);
create policy folders_own_all on public.video_folders for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy videos_own_all on public.videos for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy configs_own_all on public.player_configs for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy security_events_select_own on public.security_events for select to authenticated using ((select auth.uid()) = user_id);
create policy security_events_insert_own on public.security_events for insert to authenticated with check ((select auth.uid()) = user_id);

grant usage on schema public to authenticated;
grant select, update on public.profiles to authenticated;
grant select, insert, update, delete on public.video_folders, public.videos, public.player_configs to authenticated;
grant select, insert on public.security_events to authenticated;
grant usage, select on sequence public.security_events_id_seq to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('videos', 'videos', false, 1073741824, array['video/mp4','video/webm','video/quicktime','application/vnd.apple.mpegurl']),
       ('player-assets', 'player-assets', false, 10485760, array['image/jpeg','image/png','image/webp','text/vtt'])
on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

create policy storage_select_own on storage.objects for select to authenticated using (bucket_id in ('videos','player-assets') and owner_id = (select auth.uid()::text));
create policy storage_insert_own on storage.objects for insert to authenticated with check (bucket_id in ('videos','player-assets') and (storage.foldername(name))[1] = (select auth.uid()::text));
create policy storage_update_own on storage.objects for update to authenticated using (bucket_id in ('videos','player-assets') and owner_id = (select auth.uid()::text)) with check (bucket_id in ('videos','player-assets') and owner_id = (select auth.uid()::text));
create policy storage_delete_own on storage.objects for delete to authenticated using (bucket_id in ('videos','player-assets') and owner_id = (select auth.uid()::text));

create schema if not exists private;

create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, coalesce(new.email, ''), nullif(new.raw_user_meta_data ->> 'full_name', ''))
  on conflict (id) do nothing;
  return new;
end;
$$;

revoke execute on function private.handle_new_user() from public, anon, authenticated;
create trigger on_auth_user_created after insert on auth.users for each row execute procedure private.handle_new_user();
