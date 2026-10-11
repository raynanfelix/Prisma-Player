-- Fecha corridas de check-then-write nas cotas de armazenamento e equipe.
-- A API continua oferecendo mensagens amigaveis; estes triggers sao a ultima
-- barreira atomica quando requisicoes concorrentes chegam a instancias distintas.

create or replace function private.enforce_video_storage_quota()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_used bigint;
  v_limit bigint;
begin
  perform pg_advisory_xact_lock(hashtextextended(new.user_id::text, 71001));

  select coalesce(max(bp.storage_gb), 5)::bigint * 1073741824
    into v_limit
  from public.subscriptions s
  join public.billing_plans bp on bp.id = s.plan_id
  where s.user_id = new.user_id
    and s.status = 'active'
    and (s.current_period_end is null or s.current_period_end > now());

  v_limit := coalesce(v_limit, 5 * 1073741824::bigint);
  select coalesce(sum(v.size_bytes), 0)::bigint
    into v_used
  from public.videos v
  where v.user_id = new.user_id
    and v.status <> 'failed'
    and v.id <> new.id;

  if new.status <> 'failed' and v_used + new.size_bytes > v_limit then
    raise exception using errcode = 'P0001', message = 'storage_quota_exceeded';
  end if;
  return new;
end;
$$;

revoke execute on function private.enforce_video_storage_quota() from public, anon, authenticated;
drop trigger if exists videos_atomic_storage_quota on public.videos;
create trigger videos_atomic_storage_quota
before insert or update of user_id, size_bytes, status on public.videos
for each row execute procedure private.enforce_video_storage_quota();

create or replace function private.team_seat_limit(p_team_id uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(max(bp.team_seats), 1)::integer
  from public.account_teams t
  left join public.subscriptions s
    on s.user_id = t.owner_id
   and s.status = 'active'
   and (s.current_period_end is null or s.current_period_end > now())
  left join public.billing_plans bp on bp.id = s.plan_id
  where t.id = p_team_id;
$$;

revoke execute on function private.team_seat_limit(uuid) from public, anon, authenticated;

create or replace function private.enforce_team_member_quota()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_count integer;
begin
  if new.status <> 'active' then return new; end if;
  perform pg_advisory_xact_lock(hashtextextended(new.team_id::text, 71002));
  select count(*) into v_count from public.account_team_members m
   where m.team_id = new.team_id and m.status = 'active' and m.id <> new.id;
  if v_count >= private.team_seat_limit(new.team_id) then
    raise exception using errcode = 'P0001', message = 'team_seat_limit_reached';
  end if;
  return new;
end;
$$;

revoke execute on function private.enforce_team_member_quota() from public, anon, authenticated;
drop trigger if exists account_team_members_atomic_quota on public.account_team_members;
create trigger account_team_members_atomic_quota
before insert or update of team_id, status on public.account_team_members
for each row execute procedure private.enforce_team_member_quota();

create or replace function private.enforce_team_invite_quota()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_members integer; v_invites integer;
begin
  if new.status <> 'pending' or new.expires_at <= now() then return new; end if;
  perform pg_advisory_xact_lock(hashtextextended(new.team_id::text, 71002));
  select count(*) into v_members from public.account_team_members m
   where m.team_id = new.team_id and m.status = 'active';
  select count(*) into v_invites from public.account_team_invites i
   where i.team_id = new.team_id and i.status = 'pending'
     and i.expires_at > now() and i.id <> new.id;
  if v_members + v_invites >= private.team_seat_limit(new.team_id) then
    raise exception using errcode = 'P0001', message = 'team_seat_limit_reached';
  end if;
  return new;
end;
$$;

revoke execute on function private.enforce_team_invite_quota() from public, anon, authenticated;
drop trigger if exists account_team_invites_atomic_quota on public.account_team_invites;
create trigger account_team_invites_atomic_quota
before insert or update of team_id, status, expires_at on public.account_team_invites
for each row execute procedure private.enforce_team_invite_quota();
