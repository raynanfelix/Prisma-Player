-- Remove as tabelas criadas pela tentativa de migração para o Better Auth.
--
-- A migração foi revertida no commit 155b02a: a autenticação voltou a ser
-- Supabase Auth e nenhuma linha do código lê estas tabelas. Mantê-las significa
-- guardar dados de sessão e credenciais duplicados que ninguém observa — a pior
-- combinação possível para uma tabela de autenticação.
--
-- O arquivo original da migração (20260127000000_better_auth_tables.sql) é
-- mantido no histórico de propósito: apagá-lo quebraria a integridade do
-- histórico de migrações em bancos onde ele já foi aplicado.

drop table if exists public.better_auth_verifications cascade;
drop table if exists public.better_auth_accounts cascade;
drop table if exists public.better_auth_sessions cascade;
drop table if exists public.better_auth_users cascade;
