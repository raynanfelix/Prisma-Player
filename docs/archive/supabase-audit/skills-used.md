# Skills utilizadas (reais, por equipe)

Execução: 5 subagentes `explore` paralelos (A–E) + consolidação pela equipe F
neste contexto. Limitação informada: sem acesso ao banco/produção; tudo
estático.

| Equipe | Skills lidas e aplicadas | Contribuição |
|---|---|---|
| A (banco) | `supabase-postgres-best-practices` (categorias schema/segurança), `postgresql-table-design` (tipos, constraints, índices, FK sem índice, particionamento), `sql-code-review` (checklist schema/RLS) | Inventário completo, validação DEFINER+search_path, regras de tipos/índices |
| B (backend) | `supabase-postgres-best-practices` (query), `sql-code-review` (N+1, upserts, idempotência) | Write-map, loops N-query, limites, idempotência, cron |
| C (front) | `vercel-react-best-practices` (já carregada em sessão anterior; hooks/efeitos), `analytics` (eventos, dedup, batching) | Read-map, polling, downloads redundantes, cache |
| D (segurança) | `security-audit` (boundary+resultado, RLS, service_role, PII) | RLS tabela-a-tabela, DEFINER, PII por tabela, LGPD, logs |
| E (storage) | `cloudflare` (produto R2) | Buckets, expirações, duplicação, egress, quotas que freiam custo |
| F (consolidação) | `systematic-debugging` (causa antes de concluir), `tdd` (critérios de teste nas recomendações) | Correção de 5 claims, P0–P3, projeções, SQL, validação |

**Não utilizadas** (indisponíveis ou inaplicáveis): `mantis-*` (não instaladas
neste ambiente), `neon-postgres` (banco é Supabase, não Neon), `sql-reporting`
(warehouse; irrelevante), `playwright-best-practices`/`webapp-testing`
(sem browser aqui), skills de marketing/copy/ ads (fora do escopo).
