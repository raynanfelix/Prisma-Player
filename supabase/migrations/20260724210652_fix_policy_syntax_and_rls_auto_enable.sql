-- Fix: A migracao 20260724204734 usou "for select, insert, update", que nao e
-- sintaxe PostgreSQL valida (FOR aceita apenas um comando ou ALL). Revertemos a
-- policy quebrada e recriamos com "for all", que cobre SELECT/INSERT/UPDATE/DELETE.
-- Como o papel authenticated nao tem grant DELETE nesta tabela, o "for all" nao
-- concede nenhuma permissao extra -- apenas restringe o acesso via RLS.
--
-- Alem disso, revogamos EXECUTE na funcao SECURITY DEFINER rls_auto_enable(),
-- que estava exposta a anon/authenticated por padrao (Postgres concede EXECUTE
-- a PUBLIC em toda funcao nova). Vide secao "SECURITY DEFINER" na skill supabase.

-- 1. Recriar a policy de account_security_settings com sintaxe valida
drop policy if exists account_security_own_manage on public.account_security_settings;
drop policy if exists account_security_own_all on public.account_security_settings;

create policy account_security_own_all on public.account_security_settings
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- 2. Versoes antigas nunca chegaram a criar esta funcao. O bloco condicional
-- mantem a migration executavel tanto num banco limpo quanto num banco que a
-- possua por legado.
do $$
begin
  if to_regprocedure('public.rls_auto_enable()') is not null then
    execute 'revoke execute on function public.rls_auto_enable() from public, anon, authenticated';
  end if;
end;
$$;

-- 3. Observacao sobre "leaked password protection disabled" apontado pelo
--    supabase db advisors: esta configuracao fica no dashboard do Supabase em
--    Authentication > Settings > "Protect against credential stuffing".
--    Nao pode ser resolvida via migration SQL. O admin do projeto deve habilita-la
--    manualmente em https://supabase.com/dashboard/project/<ref>/auth/settings.
