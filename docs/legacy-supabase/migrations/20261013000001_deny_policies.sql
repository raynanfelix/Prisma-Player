-- Silencia o linter `rls_enabled_no_policy` (INFO) sem mudar comportamento.
-- Estas tabelas são service-role only por desenho: RLS habilitada + revoke
-- total. A policy `USING (false)` / `WITH CHECK (false)` documenta a negação
-- explícita; anon/authenticated continuam negados e service_role continua
-- passando direto (bypass de RLS). Idempotente via DROP IF EXISTS.

do $$
declare
  t text;
begin
  foreach t in array array[
    'admin_audit_log',
    'payment_webhook_events',
    'rate_limits',
    'seo_targets',
    'support_cases',
    'support_notes',
    'video_daily_stats',
    'visibility_checks'
  ] loop
    execute format('drop policy if exists deny_all_external on public.%I', t);
    execute format(
      'create policy deny_all_external on public.%I for all to anon, authenticated using (false) with check (false)',
      t
    );
  end loop;
end;
$$;
