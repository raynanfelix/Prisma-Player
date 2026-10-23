# Arquivo de docs legado

Docs desatualizados ou de fases concluídas, movidos e não apagados (decisão do
dono em docs/specs/ORGANIZACAO_ANTI_SPRAWL_SPEC.md). Nada aqui espelha o
runtime atual (Neon + Drizzle + Neon Auth + Cloudflare R2 + Stripe): não use
como instrução ativa; o valor é histórico.

| Item | O que é | Por que foi arquivado |
|---|---|---|
| auth-and-data-architecture.md | Decisão de arquitetura Clerk + Supabase (Third-Party Auth) | Aspiracional, nunca implementado; o auth real é Neon Auth gerenciado |
| auth-hardening/ | Sessão/JWT, MFA, matriz de rotas e achados do hardening da era Supabase Auth | Documenta `@supabase/ssr`, `getClaims` e MFA que saíram do produto; o estado atual vive em docs/SECURITY.md e na suíte BOLA |
| CHECKLIST-DEPLOY-VERCEL-SUPABASE.txt | Checklist de deploy Vercel + Supabase + AbacatePay | Deploy da era pré-Neon; a ativação atual é docs/neon-migration/DEPLOY.md |
| CODEBASE_ARCHITECTURE.md | Estrutura de pastas com `src/lib/supabase` | Estrutura antiga; a vigente está em docs/ARCHITECTURE.md |
| CONFIGURACAO_COMPLETA.md | Configuração da fase de escala (env `SUPABASE_*`, Worker KV, DNS) | Fase concluída, com chaves de ambiente mortas; o env atual está no `.env.example` |
| legacy-supabase/ | 37 migrations SQL + seed + edge function de health do período Supabase | Migrações pré-Drizzle; o schema vigente é `drizzle/schema.ts`, consolidado a partir delas |
| REFACTOR_V2_ARCHITECTURE.md | Arquitetura do refactor V2 | Fase concluída; a organização atual vive em docs/ARCHITECTURE.md |
| REFACTOR_V2_PHASE_2.md | Fase 2 do refactor V2 | Fase concluída |
| supabase-audit/ | Auditoria do schema Supabase (inventário, read/write maps, recomendações) | Auditoria da era Supabase; a escala atual é tratada em docs/SCALE_RUNBOOK.md |
| SYSTEM_DESIGN_SCALE.md | Design de escala (Postgres Supabase, fallback de storage, KV Worker) | Design da era Supabase; o Worker vivo (`cloudflare/prisma-embed-cache`) o cita como origem |
| vercel-production.md | Produção Vercel + Supabase (variáveis `SUPABASE_*`/`ABACATEPAY_*` e passos) | Variáveis não existem mais; o deploy atual é docs/neon-migration/DEPLOY.md |
