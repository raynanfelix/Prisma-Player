# SQL somente-leitura — SQL Editor do Supabase

Sem escrita, sem DDL. Carga: Q1–Q4 leves; Q5 moderada (rode fora do pico).

## Q1. Tabelas órfãs e RLS (leve)
```sql
select tablename as tabela,
  (select count(*) from pg_policies where schemaname='public' and tablename=t.tablename) as policies
from pg_tables t where schemaname='public' order by 1;
```
Objetivo: confirmar zero tabelas Better Auth e RLS em tudo. Acesso: qualquer role.

## Q2. Tamanho e linhas por tabela (leve)
```sql
select relname as tabela,
  pg_size_pretty(pg_total_relation_size(oid)) as total,
  pg_size_pretty(pg_relation_size(oid)) as heap,
  pg_size_pretty(pg_indexes_size(oid)) as indices
from pg_class where relkind='r' and relnamespace='public'::regnamespace
order by pg_total_relation_size(oid) desc limit 30;
```
Objetivo: top consumidores. Combine com `select count(*)` nas 5 maiores.
Acesso: leitura; `count(*)` em tabelas gigantes pode demorar — use
`reltuples` como aproximação rápida se preciso.

## Q3. Crescimento mensal de eventos (leve)
```sql
select to_char(created_at,'YYYY-MM') as mes, count(*) as linhas
from public.video_events
where created_at > now() - interval '6 months'
group by 1 order by 1;
```
Repita para `player_events`, `payment_webhook_events`, `security_events`,
`ai_credit_ledger`. Objetivo: validar projeções.

## Q4. Checagens de integridade (leves)
```sql
-- assinaturas active sem período (higiene; app trata como sem acesso)
select count(*) from public.subscriptions where status='active' and current_period_end is null;
-- vídeos sem config / configs sem vídeo
select count(*) from public.videos v left join public.player_configs p on p.video_id=v.id where p.id is null;
-- convites expirados ainda pending
select count(*) from public.account_team_invites where status='pending' and expires_at < now();
-- funções DEFINER sem search_path (esperado: 0)
select proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='private' and prosecdef and 'search_path=' <> ANY(string_to_array(proconfig::text,',')) 
  and proconfig is not null;
```
Nota: a última é aproximada; `proconfig` nulo também é aceitável fora de DEFINER.

## Q5. Índices não usados (moderada, fora do pico)
```sql
select relname as tabela, indexrelname as indice, idx_scan as usos
from pg_stat_user_indexes where schemaname='public' and idx_scan < 50
order by pg_relation_size(indexrelid) desc limit 30;
```
Objetivo: candidatos a DROP (P2). Limitação: contador zera em restart/failover;
cruzar com 2 janelas antes de remover.
