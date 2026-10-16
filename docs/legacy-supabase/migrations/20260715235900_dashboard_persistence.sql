create table public.ab_test_folders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 100),
  created_at timestamptz not null default now(),
  unique (user_id, name),
  unique (id, user_id)
);

create table public.ab_tests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  folder_id uuid,
  name text not null check (char_length(name) between 1 and 150),
  status text not null default 'draft' check (status in ('draft', 'active', 'paused', 'completed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id),
  foreign key (folder_id, user_id) references public.ab_test_folders(id, user_id) on delete set null (folder_id)
);

create table public.ab_test_variants (
  id uuid primary key default gen_random_uuid(),
  test_id uuid not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  video_id uuid not null,
  weight smallint not null default 50 check (weight between 1 and 100),
  created_at timestamptz not null default now(),
  unique (test_id, video_id),
  foreign key (test_id, user_id) references public.ab_tests(id, user_id) on delete cascade,
  foreign key (video_id, user_id) references public.videos(id, user_id) on delete cascade
);

create table public.account_security_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  allowed_domains text[] not null default '{}',
  updated_at timestamptz not null default now()
);

create index ab_test_folders_user_created_idx on public.ab_test_folders (user_id, created_at desc);
create index ab_tests_user_created_idx on public.ab_tests (user_id, created_at desc);
create index ab_tests_folder_idx on public.ab_tests (folder_id);
create index ab_test_variants_test_idx on public.ab_test_variants (test_id);
create index ab_test_variants_user_idx on public.ab_test_variants (user_id);

alter table public.ab_test_folders enable row level security;
alter table public.ab_tests enable row level security;
alter table public.ab_test_variants enable row level security;
alter table public.account_security_settings enable row level security;

create policy ab_test_folders_own_all on public.ab_test_folders for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy ab_tests_own_all on public.ab_tests for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy ab_test_variants_own_all on public.ab_test_variants for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy account_security_own_all on public.account_security_settings for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

grant select, insert, update, delete on public.ab_test_folders, public.ab_tests, public.ab_test_variants to authenticated;
grant select, insert, update on public.account_security_settings to authenticated;
