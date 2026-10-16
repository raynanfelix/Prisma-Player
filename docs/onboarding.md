# Preparação local

## Pré-requisitos

- Node.js 20+ e npm (lockfile `package-lock.json`).
- Um projeto Neon (Lakebase Postgres) — a conexão sai do painel do Neon.
- Opcional: token Cloudflare R2 e demais integrações conforme `.env.example`.

## Primeira execução

```bash
npm install
Copy-Item .env.example .env.local   # bash: cp .env.example .env.local
```

Preencha no mínimo: `DATABASE_URL` (hostname com `-pooler`),
`DATABASE_URL_UNPOOLED` (sem `-pooler`), `NEON_AUTH_BASE_URL`,
`NEON_AUTH_COOKIE_SECRET` (`openssl rand -base64 32`), `NEXT_PUBLIC_SITE_URL`
e `EMBED_ORIGIN_SECRET`. A lista completa de variáveis e efeitos está
comentada em `.env.example`.

```bash
npm run dev   # http://localhost:3000
```

## Banco (Drizzle + Neon)

- Schema: `drizzle/schema.ts` (config em `drizzle.config.ts`).
- Gerar SQL: `npx drizzle-kit generate` (não conecta ao banco).
- Aplicar: `npx drizzle-kit push` (ou `migrate`) **exige** `DATABASE_URL_UNPOOLED`
  — o PgBouncer em modo transação não suporta operações de sessão de migration.
- Revise o SQL gerado antes de aplicar; nunca use produção como ambiente de teste.
- `supabase/migrations/` é legado pré-Drizzle; o schema vigente é o Drizzle.

## Verificar

- `npm run verify` — typecheck + lint + testes.
- `npm run test` roda a suíte offline (Vitest, sem banco real); testes de
  banco/HTTP exigem serviços reais e não fazem parte do check local.

## Agentes

Leia [AGENTS.md](../AGENTS.md); [CLAUDE.md](../CLAUDE.md) importa as mesmas
instruções. Skills locais e integrações: [setup.md](setup.md).

## Dificuldades conhecidas

- Nada registrado ainda. Sintoma + causa comprovada + correção verificada
  entram aqui quando ocorrerem.
