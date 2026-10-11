-- Remove as tabelas orfas da tentativa de migracao para o Better Auth.
--
-- A migracao 20260729130000_drop_better_auth_tables.sql removeu as tabelas
-- public.better_auth_* mas deixou para tras as tabelas "user", "session",
-- "account" e "verification" criadas em 20260127000000_better_auth_tables.sql.
-- Elas nunca tiveram RLS habilitado e a tabela "account" guarda credenciais
-- (password, accessToken, refreshToken, idToken) que nenhum codigo le.
--
-- Nenhuma outra migracao, trigger, policy ou grant referencia estas tabelas,
-- e o codigo usa Supabase Auth (auth.users), nao Better Auth. Portanto sao
-- removidas com seguranca junto da funcao de trigger que so elas usavam.

drop table if exists public."verification" cascade;
drop table if exists public."account" cascade;
drop table if exists public."session" cascade;
drop table if exists public."user" cascade;

drop function if exists public.update_updated_at_column();
