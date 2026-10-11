-- Casos de suporte interno (sem envio externo: notas internas + contato via email do cadastro).

create table public.support_cases (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  subject text not null check (char_length(subject) between 3 and 140),
  category text not null default 'geral' check (category in ('geral','cobranca','tecnico','conta','reembolso','outro')),
  priority text not null default 'normal' check (priority in ('baixa','normal','alta','urgente')),
  status text not null default 'aberto' check (status in ('aberto','em_andamento','aguardando_cliente','resolvido')),
  assignee_admin_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index support_cases_status_updated_idx
  on public.support_cases (status, updated_at desc);
create index support_cases_user_idx on public.support_cases (user_id);

create table public.support_notes (
  id bigint generated always as identity primary key,
  case_id uuid not null references public.support_cases(id) on delete cascade,
  author_admin_id uuid references auth.users(id) on delete set null,
  body text not null check (char_length(body) between 1 and 2000),
  is_internal boolean not null default true,
  created_at timestamptz not null default now()
);
create index support_notes_case_idx on public.support_notes (case_id, created_at);

alter table public.support_cases enable row level security;
alter table public.support_notes enable row level security;
revoke all on public.support_cases from anon, authenticated;
revoke all on public.support_notes from anon, authenticated;
