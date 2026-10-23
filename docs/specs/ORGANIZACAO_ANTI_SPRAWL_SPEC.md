# Organização do projeto + anti-sprawl (23/10/2026)

DECISÕES DO DONO: docs consolidados em docs/ com subpastas por tipo; legado vai pra docs/archive/ (não apagar); CLAUDE.md reescrito pra realidade atual; anti-sprawl por regra + gate warn; assets FICAM como estão (imports estáticos no src — decisão B, NÃO mover imagens). SEM travessões em textos novos. Set-Content proibido com acentos.

## 1. Estrutura de docs
- `docs/specs/`: TODOS os arquivos SPEC_*.md que hoje estão em docs/ (mova os que existem: SECURITY_HARDENING, FIXES_POST_TESTE, IMPECCAVEL, BILLING_COMPLETO, IS_AGENTIC, AGENTIC_V2, LGPD_AUDIT, SECURITY_VALIDATION). Atualize referências cruzadas entre eles (grep por "docs/NOME" e corrija).
- `docs/reports/`: relatórios/validações (SECURITY_AUDIT_VALIDATION.md quando existir — o validador escreve em docs/reports/ ✓).
- `docs/archive/`: docs desatualizados/legado (menções a Supabase, migrações antigas, DEPLOY antigos, setup de fases passadas) + README.md índice explicando o que é cada um e por que foi arquivado. Mova, não apague.
- Raiz: SÓ README.md, CLAUDE.md, AGENTS.md, PRODUCT.md (se existir na raiz, avalie: é escopo de produto vivo → fica) e configs. Qualquer outro .md da raiz → docs/ apropriado.
- Pastas vazias do projeto (fora node_modules/.git/.next/.vercel): listar e remover (Remove-Item em dirs com zero arquivos).

## 2. CLAUDE.md reescrito (raiz, conciso e atual)
Realidade ATUAL: Next.js 16 + Drizzle/Neon (Lakebase Postgres) + Neon Auth gerenciado + Cloudflare R2 único + Stripe Checkout hospedado (billing completo: webhooks idempotentes, reconcile, churn survey) + PostHog + Vitest 5 (632+) + CI verify.yml. ZERO Supabase. Estrutura: apontar pra AGENTS.md (fonte canônica de regras) + listar docs vivos por caminho (docs/ARCHITECTURE.md, docs/SECURITY.md, docs/UI_ARCHITECTURE.md, docs/design.md, src/components/README.md, docs/quality.md, docs/onboarding.md, docs/setup.md, docs/neon-migration/, .lgpd/). Sem repetir o que AGENTS.md já diz — CLAUDE.md é ponteiro + mapa.

## 3. AGENTS.md + anti-sprawl (regra nova, seção curta)
Nova regra em "Acordos de trabalho": "ARQUIVO NOVO DE FEATURE EXIGE SPEC — todo componente/rota/módulo novo nasce de uma spec em docs/specs/ referenciada no commit (pattern já usado na sessão: spec → implementação → validação). Gate: scripts/check-spec.mjs." 

## 4. Gate check-spec (warn, não bloqueia)
`scripts/check-spec.mjs`: lê lista de arquivos novos (via `git diff --name-only --diff-filter=A` contra a merge-base com main quando existir, senão status --porcelain de untracked) filtrando src/features|src/app (exclui tests, docs, configs); se houver e a mensagem do commit (env COMMIT_MSG ou arg) não citar "spec", imprime WARN listando os arquivos + a regra; exit 0 SEMPRE (warn). Adicione o passo no .github/workflows/verify.yml (depois do quality step, passando a mensagem do commit do evento github). Teste simples (tests/check-spec.test.ts): com arquivo novo+sem spec → warn impresso; com spec citada → silêncio; sem arquivos novos → silêncio. Rodar `node scripts/verify-quality-rules.mjs` continua ok.

## 5. Purge de menções mortas (grep como fonte de verdade)
- `src/`: grep -i supabase → esperado ZERO; se achar algo vivo, reportar (não mexer sem evidência).
- `docs/` vivos (fora archive): menções a Supabase/AbacatePay como instruções ativas → atualizar pra realidade (Stripe) OU mover pra archive se o doc inteiro é histórico. .env.example: já está limpo? confira.
- Reportar contagem: quantos arquivos movidos, quantos atualizados, quantos arquivados.

## Regras
NÃO mover imagens/assets (decisão B do dono). NÃO tocar em código de feature (só docs, CLAUDE.md, AGENTS.md, scripts/check-spec.mjs, verify.yml, remoção de pastas vazias). Zero deps. tsc 0 + vitest 632+ (check-spec.test.ts incluído) + lint 0 + verify-quality-rules ok. Sem build, sem push. Resposta: mapa antes/depois da docs/, arquivados, atualizados, a regra anti-sprawl, e como o gate roda no CI.
