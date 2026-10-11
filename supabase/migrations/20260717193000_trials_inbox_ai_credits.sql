-- Acesso, onboarding, inbox e creditos Prisma IA.
-- Dados financeiros continuam restritos ao backend com service role.

create table public.account_access (
  user_id uuid primary key references auth.users(id) on delete cascade,
  onboarding_completed boolean not null default false,
  trial_status text not null default 'available' check (trial_status in ('available','active','used','expired')),
  trial_started_at timestamptz,
  trial_ends_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((trial_status = 'active' and trial_started_at is not null and trial_ends_at is not null) or trial_status <> 'active')
);

create table public.user_inbox (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('welcome','trial','billing','security','system')),
  title text not null check (char_length(title) between 1 and 120),
  message text not null check (char_length(message) between 1 and 600),
  action_label text,
  action_url text,
  read_at timestamptz,
  dismissed_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.ai_credit_products (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  credits integer not null check (credits > 0),
  bonus_credits integer not null default 0 check (bonus_credits >= 0),
  amount_cents integer not null check (amount_cents > 0),
  provider_product_id text unique,
  is_featured boolean not null default false,
  is_active boolean not null default true,
  display_order smallint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.ai_credit_wallets (
  user_id uuid primary key references auth.users(id) on delete cascade,
  balance integer not null default 0 check (balance >= 0),
  lifetime_purchased integer not null default 0 check (lifetime_purchased >= 0),
  lifetime_used integer not null default 0 check (lifetime_used >= 0),
  updated_at timestamptz not null default now()
);

create table public.ai_credit_checkouts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  product_id uuid not null references public.ai_credit_products(id),
  external_id text not null unique,
  provider_checkout_id text unique,
  checkout_url text,
  amount_cents integer not null check (amount_cents > 0),
  status text not null default 'creating' check (status in ('creating','pending','paid','expired','failed','refunded','disputed','cancelled')),
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.ai_credit_ledger (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  amount integer not null check (amount <> 0),
  reason text not null check (reason in ('purchase','plan_grant','usage','refund','adjustment')),
  reference text not null unique,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index user_inbox_unread_idx on public.user_inbox (user_id, created_at desc) where read_at is null and dismissed_at is null;
create index ai_credit_checkouts_user_idx on public.ai_credit_checkouts (user_id, created_at desc);
create index ai_credit_ledger_user_idx on public.ai_credit_ledger (user_id, created_at desc);

alter table public.account_access enable row level security;
alter table public.user_inbox enable row level security;
alter table public.ai_credit_products enable row level security;
alter table public.ai_credit_wallets enable row level security;
alter table public.ai_credit_checkouts enable row level security;
alter table public.ai_credit_ledger enable row level security;

create policy account_access_read_own on public.account_access for select to authenticated using ((select auth.uid()) = user_id);
create policy user_inbox_read_own on public.user_inbox for select to authenticated using ((select auth.uid()) = user_id);
create policy user_inbox_update_own on public.user_inbox for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy ai_credit_products_read_active on public.ai_credit_products for select to authenticated using (is_active);
create policy ai_credit_wallets_read_own on public.ai_credit_wallets for select to authenticated using ((select auth.uid()) = user_id);
create policy ai_credit_checkouts_read_own on public.ai_credit_checkouts for select to authenticated using ((select auth.uid()) = user_id);
create policy ai_credit_ledger_read_own on public.ai_credit_ledger for select to authenticated using ((select auth.uid()) = user_id);

grant select on public.account_access, public.ai_credit_products, public.ai_credit_wallets, public.ai_credit_checkouts, public.ai_credit_ledger to authenticated;
grant select, update (read_at, dismissed_at) on public.user_inbox to authenticated;
revoke insert, update, delete on public.account_access, public.ai_credit_products, public.ai_credit_wallets, public.ai_credit_checkouts, public.ai_credit_ledger from anon, authenticated;

insert into public.ai_credit_products (slug, name, credits, bonus_credits, amount_cents, is_featured, display_order)
values
  ('ai-start', 'Impulso', 50, 0, 1900, false, 1),
  ('ai-growth', 'Crescimento', 200, 40, 5900, true, 2),
  ('ai-scale', 'Escala', 600, 200, 12900, false, 3)
on conflict (slug) do update set name=excluded.name, credits=excluded.credits, bonus_credits=excluded.bonus_credits,
  amount_cents=excluded.amount_cents, is_featured=excluded.is_featured, is_active=true,
  display_order=excluded.display_order, updated_at=now();

-- Contas anteriores nao devem receber novamente uma tela de primeiro acesso.
insert into public.account_access (user_id, onboarding_completed)
select id, true from auth.users on conflict (user_id) do nothing;
insert into public.ai_credit_wallets (user_id)
select id from auth.users on conflict (user_id) do nothing;

create or replace function private.handle_prisma_account_created()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.account_access (user_id) values (new.id) on conflict (user_id) do nothing;
  insert into public.ai_credit_wallets (user_id) values (new.id) on conflict (user_id) do nothing;
  insert into public.user_inbox (user_id, kind, title, message, action_label, action_url)
  values (new.id, 'welcome', 'Bem-vindo a Prisma Player', 'Seu teste gratuito de 14 dias esta disponivel. Ative quando estiver pronto para publicar sua primeira VSL.', 'Ativar teste gratis', '/welcome');
  return new;
end;
$$;
revoke execute on function private.handle_prisma_account_created() from public, anon, authenticated;
drop trigger if exists on_auth_user_created_prisma_access on auth.users;
create trigger on_auth_user_created_prisma_access after insert on auth.users for each row execute procedure private.handle_prisma_account_created();

create or replace function public.apply_ai_credit_purchase(p_checkout_id uuid, p_provider_event_id text)
returns void language plpgsql security definer set search_path = '' as $$
declare c record; total_credits integer;
begin
  select ch.user_id, p.credits + p.bonus_credits as credit_total into c
  from public.ai_credit_checkouts ch join public.ai_credit_products p on p.id = ch.product_id
  where ch.id = p_checkout_id for update of ch;
  if c.user_id is null then raise exception 'credit checkout not found'; end if;
  total_credits := c.credit_total;
  insert into public.ai_credit_ledger (user_id, amount, reason, reference, metadata)
  values (c.user_id, total_credits, 'purchase', p_provider_event_id, jsonb_build_object('checkoutId', p_checkout_id))
  on conflict (reference) do nothing;
  if found then
    update public.ai_credit_wallets set balance = balance + total_credits,
      lifetime_purchased = lifetime_purchased + total_credits, updated_at = now() where user_id = c.user_id;
  end if;
end;
$$;
revoke execute on function public.apply_ai_credit_purchase(uuid, text) from public, anon, authenticated;
grant execute on function public.apply_ai_credit_purchase(uuid, text) to service_role;
