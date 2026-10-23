-- Evita que um usuario dispare varias analises da Prisma IA ao mesmo tempo.
-- A API tambem aplica rate limit, mas esta trava fecha a corrida entre requests simultaneas.
-- Se este arquivo for executado manualmente antes da fundacao da IA, nao quebra o SQL Editor.

do $$
begin
  if to_regclass('public.ai_analysis_jobs') is null then
    raise notice 'public.ai_analysis_jobs ainda nao existe. Rode primeiro a migration 20260717161300_intelligence_and_monitoring_foundation.sql.';
    return;
  end if;

  execute $sql$
    with ranked as (
      select
        id,
        row_number() over (partition by user_id order by created_at desc, id desc) as position
      from public.ai_analysis_jobs
      where status in ('queued', 'processing')
    )
    update public.ai_analysis_jobs
    set
      status = 'failed',
      error_code = 'superseded_active_job',
      completed_at = now()
    where id in (select id from ranked where position > 1)
  $sql$;

  execute $sql$
    create unique index if not exists ai_analysis_jobs_one_active_per_user_idx
    on public.ai_analysis_jobs (user_id)
    where status in ('queued', 'processing')
  $sql$;
end;
$$;
