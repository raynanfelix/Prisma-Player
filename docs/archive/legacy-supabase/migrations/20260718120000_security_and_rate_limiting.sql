-- Rate limiting table for serverless environments (replaces in-memory Map)
create table if not exists public.rate_limits (
  key text primary key,
  count integer not null default 1,
  expires_at timestamptz not null
);

create index if not exists rate_limits_expires_at_idx on public.rate_limits (expires_at);

alter table public.rate_limits enable row level security;

drop policy if exists rate_limits_all on public.rate_limits;
revoke all on public.rate_limits from public, anon, authenticated;
grant select, insert, update, delete on public.rate_limits to service_role;

create or replace function public.cleanup_rate_limits()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.rate_limits where expires_at < now();
end;
$$;

revoke execute on function public.cleanup_rate_limits() from public, anon, authenticated;
grant execute on function public.cleanup_rate_limits() to service_role;

comment on table public.rate_limits is 'Rate limiting storage for API endpoints. Replaces in-memory Map for serverless environments.';
