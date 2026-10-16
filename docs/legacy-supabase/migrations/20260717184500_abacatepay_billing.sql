-- Billing AbacatePay: PIX mensal avulso e cartao recorrente.
-- Nenhum dado de cartao e armazenado pela Prisma.

create table public.billing_plans (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  description text not null,
  amount_cents integer not null check (amount_cents > 0),
  currency text not null default 'BRL' check (currency = 'BRL'),
  interval text not null default 'monthly' check (interval = 'monthly'),
  included_plays integer not null check (included_plays >= 0),
  storage_gb integer not null check (storage_gb >= 0),
  prisma_ai_analyses integer not null check (prisma_ai_analyses >= 0),
  team_seats integer not null default 1 check (team_seats > 0),
  play_overage_millicents integer not null default 800 check (play_overage_millicents >= 0),
  provider_pix_product_id text unique,
  provider_card_product_id text unique,
  is_featured boolean not null default false,
  is_active boolean not null default true,
  display_order smallint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.billing_customers (
  user_id uuid primary key references auth.users(id) on delete cascade,
  provider text not null default 'abacatepay' check (provider = 'abacatepay'),
  provider_customer_id text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.billing_checkouts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  plan_id uuid not null references public.billing_plans(id),
  provider text not null default 'abacatepay' check (provider = 'abacatepay'),
  checkout_type text not null check (checkout_type in ('pix', 'card_subscription')),
  external_id text not null unique,
  provider_checkout_id text unique,
  checkout_url text,
  amount_cents integer not null check (amount_cents > 0),
  currency text not null default 'BRL' check (currency = 'BRL'),
  status text not null default 'creating' check (status in ('creating','pending','paid','expired','failed','refunded','disputed','cancelled')),
  paid_at timestamptz,
  receipt_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  plan_id uuid not null references public.billing_plans(id),
  source_checkout_id uuid references public.billing_checkouts(id) on delete set null,
  provider text not null default 'abacatepay' check (provider = 'abacatepay'),
  billing_method text not null check (billing_method in ('pix', 'card')),
  provider_subscription_id text unique,
  status text not null default 'pending' check (status in ('pending','active','past_due','suspended','cancelled','expired')),
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.payment_webhook_events (
  id bigint generated always as identity primary key,
  provider text not null default 'abacatepay' check (provider = 'abacatepay'),
  provider_event_id text not null unique,
  event_name text not null,
  provider_object_id text,
  payload jsonb not null,
  status text not null default 'received' check (status in ('received','processing','processed','ignored','failed')),
  processing_error text,
  received_at timestamptz not null default now(),
  processed_at timestamptz
);

create index billing_checkouts_user_created_idx on public.billing_checkouts (user_id, created_at desc);
create index billing_checkouts_status_created_idx on public.billing_checkouts (status, created_at);
create index subscriptions_status_period_idx on public.subscriptions (status, current_period_end);
create index payment_webhook_events_status_received_idx on public.payment_webhook_events (status, received_at);

alter table public.billing_plans enable row level security;
alter table public.billing_customers enable row level security;
alter table public.billing_checkouts enable row level security;
alter table public.subscriptions enable row level security;
alter table public.payment_webhook_events enable row level security;

create policy billing_plans_read_active on public.billing_plans for select to anon, authenticated using (is_active);
create policy billing_customers_read_own on public.billing_customers for select to authenticated using ((select auth.uid()) = user_id);
create policy billing_checkouts_read_own on public.billing_checkouts for select to authenticated using ((select auth.uid()) = user_id);
create policy subscriptions_read_own on public.subscriptions for select to authenticated using ((select auth.uid()) = user_id);

grant select on public.billing_plans to anon, authenticated;
grant select on public.billing_customers, public.billing_checkouts, public.subscriptions to authenticated;
revoke all on public.payment_webhook_events from anon, authenticated;

insert into public.billing_plans (
  slug, name, description, amount_cents, included_plays, storage_gb,
  prisma_ai_analyses, team_seats, is_featured, display_order
)
values
  ('prisma-prime', 'Prime', 'Tudo para publicar e otimizar sua primeira operacao de VSL.', 9700, 30000, 200, 30, 1, false, 1),
  ('prisma-growth', 'Prime Growth', 'Mais volume, colaboracao e inteligencia para escalar campanhas.', 19700, 100000, 500, 150, 5, true, 2),
  ('prisma-scale', 'Prime Scale', 'Capacidade para equipes e operacoes de alto volume.', 39700, 300000, 1000, 500, 15, false, 3)
on conflict (slug) do update
set name = excluded.name,
    description = excluded.description,
    amount_cents = excluded.amount_cents,
    included_plays = excluded.included_plays,
    storage_gb = excluded.storage_gb,
    prisma_ai_analyses = excluded.prisma_ai_analyses,
    team_seats = excluded.team_seats,
    is_featured = excluded.is_featured,
    is_active = true,
    display_order = excluded.display_order,
    updated_at = now();
