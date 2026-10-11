-- Operação assistida do painel admin + monitoramento de visibilidade (SEO/IA).
-- Tudo aqui é service-role only: sem policies para anon/authenticated.

create table public.admin_audit_log (
  id uuid primary key default gen_random_uuid(),
  admin_user_id uuid not null references auth.users(id) on delete cascade,
  action text not null check (action in (
    'plan_change', 'subscription_suspend', 'subscription_reactivate',
    'trial_extend', 'trial_reset', 'credit_adjust'
  )),
  target_user_id uuid references auth.users(id) on delete set null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index admin_audit_log_target_created_idx
  on public.admin_audit_log (target_user_id, created_at desc);
create index admin_audit_log_admin_created_idx
  on public.admin_audit_log (admin_user_id, created_at desc);

create table public.seo_targets (
  id uuid primary key default gen_random_uuid(),
  keyword text not null check (char_length(keyword) between 2 and 200),
  locale text not null default 'pt-BR',
  notes text not null default '',
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.visibility_checks (
  id bigint generated always as identity primary key,
  target_id uuid not null references public.seo_targets(id) on delete cascade,
  platform text not null check (platform in (
    'google-aio', 'chatgpt', 'perplexity', 'gemini', 'copilot'
  )),
  cited boolean not null default false,
  runs smallint not null default 1 check (runs between 1 and 10),
  checked_at timestamptz not null default now()
);
create index visibility_checks_target_idx
  on public.visibility_checks (target_id, checked_at desc);

alter table public.admin_audit_log enable row level security;
alter table public.seo_targets enable row level security;
alter table public.visibility_checks enable row level security;

revoke all on public.admin_audit_log from anon, authenticated;
revoke all on public.seo_targets from anon, authenticated;
revoke all on public.visibility_checks from anon, authenticated;
