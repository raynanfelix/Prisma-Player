-- Controles operacionais da Inteligencia e bootstrap resiliente de novas contas.
-- Falhas em modulos auxiliares nunca devem impedir a criacao do usuario no Auth.

create table if not exists public.intelligence_controls (
  user_id uuid primary key references auth.users(id) on delete cascade,
  automatic_reports_enabled boolean not null default false,
  report_frequency text not null default 'weekly' check (report_frequency in ('daily','weekly','monthly')),
  report_email text,
  audience_sync_enabled boolean not null default false,
  audience_provider text not null default 'meta' check (audience_provider in ('meta','google','tiktok','kwai')),
  audience_retention_threshold smallint not null default 75 check (audience_retention_threshold in (25,50,75,90,100)),
  outgoing_webhooks_enabled boolean not null default false,
  webhook_url text check (webhook_url is null or webhook_url ~ '^https://'),
  webhook_events text[] not null default array['play','cta_click','conversion'],
  conversion_alerts_enabled boolean not null default false,
  conversion_drop_threshold smallint not null default 20 check (conversion_drop_threshold between 5 and 90),
  updated_at timestamptz not null default now()
);

alter table public.intelligence_controls enable row level security;

drop policy if exists intelligence_controls_read_own on public.intelligence_controls;
create policy intelligence_controls_read_own on public.intelligence_controls
for select to authenticated using ((select auth.uid()) = user_id);

grant select on public.intelligence_controls to authenticated;
revoke insert, update, delete on public.intelligence_controls from anon, authenticated;

-- Um unico bootstrap substitui os tres triggers anteriores e usa upserts idempotentes.
create or replace function private.bootstrap_prisma_account()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_team_id uuid;
begin
  begin
    insert into public.profiles (id, email, full_name)
    values (new.id, coalesce(new.email, ''), nullif(new.raw_user_meta_data ->> 'full_name', ''))
    on conflict (id) do nothing;
  exception when others then
    raise warning 'profile bootstrap failed for %: %', new.id, sqlerrm;
  end;

  begin
    insert into public.account_access (user_id) values (new.id)
    on conflict (user_id) do nothing;
    insert into public.ai_credit_wallets (user_id) values (new.id)
    on conflict (user_id) do nothing;
    insert into public.intelligence_controls (user_id, report_email)
    values (new.id, new.email)
    on conflict (user_id) do nothing;
    insert into public.user_inbox (user_id, kind, title, message, action_label, action_url)
    select new.id, 'welcome', 'Bem-vindo a Prisma Player',
      'Seu teste gratuito de 14 dias esta disponivel. Ative quando estiver pronto para publicar sua primeira VSL.',
      'Ativar teste gratis', '/welcome'
    where not exists (
      select 1 from public.user_inbox where user_id = new.id and kind = 'welcome'
    );
  exception when others then
    raise warning 'access bootstrap failed for %: %', new.id, sqlerrm;
  end;

  begin
    insert into public.account_teams (owner_id, name)
    values (new.id, left(coalesce(nullif(new.raw_user_meta_data ->> 'full_name', ''), 'Minha equipe'), 100))
    on conflict (owner_id) do update set updated_at = now()
    returning id into v_team_id;
    insert into public.account_team_members (team_id, user_id, role)
    values (v_team_id, new.id, 'owner')
    on conflict (team_id, user_id) do nothing;

    update public.account_team_invites
    set status = 'accepted', accepted_by = new.id, updated_at = now()
    where email = lower(coalesce(new.email, ''))
      and status = 'pending' and expires_at > now();
    insert into public.account_team_members (team_id, user_id, role)
    select team_id, new.id, role
    from public.account_team_invites
    where accepted_by = new.id and status = 'accepted'
    on conflict (team_id, user_id) do nothing;
  exception when others then
    raise warning 'team bootstrap failed for %: %', new.id, sqlerrm;
  end;

  return new;
end;
$$;

revoke execute on function private.bootstrap_prisma_account() from public, anon, authenticated;
drop trigger if exists on_auth_user_created on auth.users;
drop trigger if exists on_auth_user_created_prisma_access on auth.users;
drop trigger if exists on_auth_user_created_prisma_team on auth.users;
drop trigger if exists on_auth_user_created_prisma_bootstrap on auth.users;
create trigger on_auth_user_created_prisma_bootstrap
after insert on auth.users for each row execute procedure private.bootstrap_prisma_account();

-- Backfill seguro para contas que ficaram parcialmente criadas antes desta correcao.
insert into public.intelligence_controls (user_id, report_email)
select id, email from auth.users on conflict (user_id) do nothing;
