# Prisma Player

Player de vendas para VSLs: hospede vídeos, configure players embutíveis com
segurança de domínio, rode testes A/B e acompanhe conversões — em português.

Stack: Next.js 16 (App Router) · React 19 · TypeScript · Tailwind 4 ·
Drizzle ORM + Neon Postgres (Lakebase) · Neon Auth (Managed Better Auth) ·
Cloudflare R2 (storage) · Cloudflare Worker (cache de borda) · Vercel (deploy + crons).

## Executar

Requisitos: Node.js 20+ e npm.

```bash
npm install
Copy-Item .env.example .env.local   # bash: cp .env.example .env.local
npm run dev
```

Mínimo para desenvolvimento: `DATABASE_URL` (Neon, hostname com `-pooler`),
`DATABASE_URL_UNPOOLED` (migrations), `NEON_AUTH_BASE_URL`,
`NEON_AUTH_COOKIE_SECRET` e `NEXT_PUBLIC_SITE_URL`. A lista completa com
comentários está em `.env.example`.

## Verificar

- `npm run verify` — typecheck + lint + testes
- `npm run build` — build de produção

## Documentação

- [Produto e escopo](PRODUCT.md)
- [Preparação local](docs/onboarding.md)
- [Estrutura e decisões](docs/ARCHITECTURE.md)
- [Design e acessibilidade](docs/design.md)
- [Checks de qualidade](docs/quality.md)
- [Instruções para agentes](AGENTS.md)
- [Setup e evidências](docs/setup.md)
- [Segurança](docs/SECURITY.md) · [UI](docs/UI_ARCHITECTURE.md)

## Próxima entrega

Zerar os 13 erros de lint (`npm run lint`) sem alterar comportamento —
lista priorizada em [docs/quality.md](docs/quality.md).
