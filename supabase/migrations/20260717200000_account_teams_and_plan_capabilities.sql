-- Equipes e capacidades comerciais dos planos Prisma.
-- O proprietario da equipe continua sendo o titular da assinatura.

alter table public.billing_plans
  add column if not exists automatic_reports boolean not null default false,
  add column if not exists audience_sync boolean not null default false,
  add column if not exists outgoing_webhooks boolean not null default false,
  add column if not exists private_benchmark boolean not null default false,
  add column if not exists portfolio_comparison boolean not null default false,
  add column if not exists conversion_drop_alerts boolean not null default false;

update public.billing_plans set
  automatic_reports = slug in ('prisma-growth', 'prisma-scale'),
  audience_sync = slug in ('prisma-growth', 'prisma-scale'),
  outgoing_webhooks = slug in ('prisma-growth', 'prisma-scale'),
  private_benchmark = slug = 'prisma-scale',
  portfolio_comparison = slug = 'prisma-scale',
  conversion_drop_alerts = slug = 'prisma-scale';

create table public.account_teams (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null unique references auth.users(id) on delete cascade,
  name text not null default 'Minha equipe' check (char_length(name) between 1 and 100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.account_team_members (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.account_teams(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'viewer' check (role in ('owner','admin','editor','analyst','viewer')),
  status text not null default 'active' check (status in ('active','suspended')),
  joined_at timestamptz not null default now(),
  unique (team_id, user_id)
);

create table public.account_team_invites (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.account_teams(id) on delete cascade,
  email text not null check (email = lower(email) and char_length(email) between 3 and 320),
  role text not null default 'viewer' check (role in ('admin','editor','analyst','viewer')),
  invited_by uuid not null references auth.users(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','accepted','revoked','expired')),
  expires_at timestamptz not null default (now() + interval '7 days'),
  accepted_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (team_id, email)
);

create index account_team_members_user_idx on public.account_team_members (user_id, status);
create index account_team_members_team_idx on public.account_team_members (team_id, status);
create index account_team_invites_team_idx on public.account_team_invites (team_id, status, created_at desc);
create index account_team_invites_email_idx on public.account_team_invites (email, status);

alter table public.account_teams enable row level security;
alter table public.account_team_members enable row level security;
alter table public.account_team_invites enable row level security;

create or replace function private.is_account_team_member(p_team_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.account_team_members
    where team_id = p_team_id and user_id = (select auth.uid()) and status = 'active'
  );
$$;
revoke execute on function private.is_account_team_member(uuid) from public, anon, authenticated;

create policy account_teams_read_member on public.account_teams for select to authenticated
  using (private.is_account_team_member(id));
create policy account_team_members_read_member on public.account_team_members for select to authenticated
  using (private.is_account_team_member(team_id));
create policy account_team_invites_read_member on public.account_team_invites for select to authenticated
  using (private.is_account_team_member(team_id));

grant select on public.account_teams, public.account_team_members, public.account_team_invites to authenticated;
revoke insert, update, delete on public.account_teams, public.account_team_members, public.account_team_invites from anon, authenticated;

insert into public.account_teams (owner_id, name)
select u.id, coalesce(nullif(p.full_name, ''), 'Minha equipe')
from auth.users u left join public.profiles p on p.id = u.id
on conflict (owner_id) do nothing;

insert into public.account_team_members (team_id, user_id, role)
select t.id, t.owner_id, 'owner' from public.account_teams t
on conflict (team_id, user_id) do nothing;

create or replace function private.handle_prisma_team_created()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_team_id uuid;
begin
  insert into public.account_teams (owner_id, name)
  values (new.id, coalesce(nullif(new.raw_user_meta_data ->> 'full_name', ''), 'Minha equipe'))
  returning id into v_team_id;
  insert into public.account_team_members (team_id, user_id, role)
  values (v_team_id, new.id, 'owner');

  update public.account_team_invites i set status = 'accepted', accepted_by = new.id, updated_at = now()
  where i.email = lower(new.email) and i.status = 'pending' and i.expires_at > now();
  insert into public.account_team_members (team_id, user_id, role)
  select i.team_id, new.id, i.role from public.account_team_invites i
  where i.accepted_by = new.id and i.status = 'accepted'
  on conflict (team_id, user_id) do nothing;
  return new;
end;
$$;
revoke execute on function private.handle_prisma_team_created() from public, anon, authenticated;
drop trigger if exists on_auth_user_created_prisma_team on auth.users;
create trigger on_auth_user_created_prisma_team after insert on auth.users
for each row execute procedure private.handle_prisma_team_created();
