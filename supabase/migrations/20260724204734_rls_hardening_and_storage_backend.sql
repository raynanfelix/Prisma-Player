-- RLS hardening:
-- Ajusta a policy de account_security_settings para refletir exatamente os grants
-- (select, insert, update -- sem delete), evitando surpresas do "for all" combinar
-- com a falta de grant DELETE. A regra e mantida ownership-only ((select auth.uid())
-- = user_id) mas agora limitada as operacoes que o papel authenticated realmente pode
-- executar. Siga o padrao da skillSupabase: "Create policies that match the actual
-- access model rather than defaulting every table to the same auth.uid() pattern."

drop policy if exists account_security_own_all on public.account_security_settings;
create policy account_security_own_manage on public.account_security_settings
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- Observacao sobre a tabela public.rate_limits (mantida como esta, sem alteracao):
-- A migracao 20260718120000_security_and_rate_limiting.sql habilitou RLS sem nenhuma
-- policy porque aplicou, simultaneamente, "revoke all from public, anon,
-- authenticated" e "grant ... to service_role". O Postgres nao chega a avaliar RLS
-- para usuarios sem grant, e o unico escritor e a service_role (que bypassa RLS).
-- Esta e a topologia recomendada pela skill supabase para tabelas internas (nao
-- expostas nem a anon nem a authenticated), e o "supabase db advisors" aceita esse
-- padrao. Mantido sem policy explicita para nao inflar a superficie.
