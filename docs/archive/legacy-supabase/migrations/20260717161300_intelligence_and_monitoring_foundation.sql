-- Fundacao para Prisma IA, atribuicao, monitoramento, versoes e experimentos.
-- Tabelas publicas ficam com RLS e sem escrita direta do cliente.

alter table public.video_events
  add column if not exists page_url text,
  add column if not exists campaign_id text,
  add column if not exists creative_id text,
  add column if not exists ad_id text,
  add column if not exists utm_source text,
  add column if not exists utm_medium text,
  add column if not exists utm_campaign text,
  add column if not exists risk_score smallint not null default 0 check (risk_score between 0 and 100),
  add column if not exists risk_reasons text[] not null default '{}';

create index if not exists video_events_attribution_idx
  on public.video_events (user_id, video_id, campaign_id, creative_id, created_at desc);
create index if not exists video_events_risk_idx
  on public.video_events (user_id, video_id, risk_score, created_at desc)
  where risk_score >= 60;

create table public.ai_analysis_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  video_id uuid references public.videos(id) on delete cascade,
  analysis_type text not null check (analysis_type in ('performance','retention','funnel','copy','experiment')),
  status text not null default 'queued' check (status in ('queued','processing','completed','failed')),
  input_snapshot jsonb not null default '{}'::jsonb,
  result jsonb,
  model text,
  error_code text,
  credits_used integer not null default 0 check (credits_used >= 0),
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create table public.embed_monitors (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  video_id uuid not null,
  page_url text not null check (page_url ~ '^https://'),
  enabled boolean not null default true,
  last_status text not null default 'pending' check (last_status in ('pending','healthy','missing','blocked','error')),
  last_http_status smallint,
  last_checked_at timestamptz,
  consecutive_failures smallint not null default 0 check (consecutive_failures >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (video_id, page_url),
  foreign key (video_id, user_id) references public.videos(id, user_id) on delete cascade
);

create table public.video_versions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  video_id uuid not null,
  object_path text not null,
  mime_type text not null,
  size_bytes bigint not null check (size_bytes > 0),
  duration_seconds numeric(12,3),
  version_number integer not null check (version_number > 0),
  is_active boolean not null default false,
  created_at timestamptz not null default now(),
  unique (video_id, version_number),
  foreign key (video_id, user_id) references public.videos(id, user_id) on delete cascade
);
create unique index video_versions_one_active_idx on public.video_versions (video_id) where is_active;

create table public.conversion_templates (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  category text not null check (category in ('direct_response','webinar','lead_generation','product_launch')),
  description text not null,
  config jsonb not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.element_experiments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  video_id uuid not null,
  name text not null check (char_length(name) between 1 and 150),
  element_type text not null check (element_type in ('headline','autoplay','cta','thumbnail','speed')),
  status text not null default 'draft' check (status in ('draft','active','paused','completed')),
  winning_variant_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id),
  foreign key (video_id, user_id) references public.videos(id, user_id) on delete cascade
);

create table public.element_experiment_variants (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  experiment_id uuid not null,
  name text not null,
  config jsonb not null,
  weight smallint not null default 50 check (weight between 1 and 100),
  impressions bigint not null default 0,
  conversions bigint not null default 0,
  created_at timestamptz not null default now(),
  unique (experiment_id, name),
  foreign key (experiment_id, user_id) references public.element_experiments(id, user_id) on delete cascade
);

alter table public.ai_analysis_jobs enable row level security;
alter table public.embed_monitors enable row level security;
alter table public.video_versions enable row level security;
alter table public.conversion_templates enable row level security;
alter table public.element_experiments enable row level security;
alter table public.element_experiment_variants enable row level security;

create policy ai_analysis_jobs_read_own on public.ai_analysis_jobs for select to authenticated using ((select auth.uid()) = user_id);
create policy embed_monitors_read_own on public.embed_monitors for select to authenticated using ((select auth.uid()) = user_id);
create policy video_versions_read_own on public.video_versions for select to authenticated using ((select auth.uid()) = user_id);
create policy conversion_templates_read_active on public.conversion_templates for select to authenticated using (is_active);
create policy element_experiments_read_own on public.element_experiments for select to authenticated using ((select auth.uid()) = user_id);
create policy element_variants_read_own on public.element_experiment_variants for select to authenticated using ((select auth.uid()) = user_id);

grant select on public.ai_analysis_jobs, public.embed_monitors, public.video_versions,
  public.conversion_templates, public.element_experiments, public.element_experiment_variants to authenticated;
revoke insert, update, delete on public.ai_analysis_jobs, public.embed_monitors, public.video_versions,
  public.conversion_templates, public.element_experiments, public.element_experiment_variants from anon, authenticated;

create index ai_analysis_jobs_user_created_idx on public.ai_analysis_jobs (user_id, created_at desc);
create index embed_monitors_due_idx on public.embed_monitors (enabled, last_checked_at) where enabled;
create index element_experiments_video_idx on public.element_experiments (user_id, video_id, status);

insert into public.conversion_templates (slug, name, category, description, config)
values
  ('vsl-direta', 'VSL Direta', 'direct_response', 'Estrutura limpa com autoplay, progresso inteligente e CTA no pitch.', '{"smartAutoplay":true,"smartProgress":true,"resumeEnabled":true}'::jsonb),
  ('webinar-evergreen', 'Webinar Evergreen', 'webinar', 'Experiencia para apresentacoes longas com retomada e CTA tardia.', '{"smartAutoplay":false,"smartProgress":true,"resumeEnabled":true}'::jsonb),
  ('captura-lead', 'Captura de Lead', 'lead_generation', 'Player objetivo para campanhas de captura e remarketing.', '{"smartAutoplay":true,"smartProgress":false,"resumeEnabled":false}'::jsonb)
on conflict (slug) do update set name=excluded.name, category=excluded.category,
  description=excluded.description, config=excluded.config, is_active=true, updated_at=now();

create or replace function public.consume_ai_credit(p_user_id uuid, p_reference text, p_metadata jsonb default '{}'::jsonb)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare remaining integer;
begin
  update public.ai_credit_wallets
  set balance = balance - 1, lifetime_used = lifetime_used + 1, updated_at = now()
  where user_id = p_user_id and balance >= 1
  returning balance into remaining;
  if remaining is null then raise exception 'insufficient_credits'; end if;
  insert into public.ai_credit_ledger (user_id, amount, reason, reference, metadata)
  values (p_user_id, -1, 'usage', p_reference, p_metadata);
  return remaining;
exception when unique_violation then
  raise exception 'credit_already_consumed';
end;
$$;
revoke execute on function public.consume_ai_credit(uuid, text, jsonb) from public, anon, authenticated;
grant execute on function public.consume_ai_credit(uuid, text, jsonb) to service_role;
