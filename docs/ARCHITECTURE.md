# Arquitetura — Prisma Player

Next.js 16 (App Router) em repositório único. Backend separado **logicamente**
dentro do mesmo app: rotas API finas + `src/lib`/`src/services` no servidor.
Sem Server Actions. Sem segundo servidor.

## Estrutura

```text
src/
├── app/                 # Rotas HTTP (adaptadores finos) + páginas
│   ├── api/             # Route Handlers: auth → guard → serviço → resposta
│   ├── dashboard/       # Páginas autenticadas (Server + Client Components)
│   ├── embed/           # Páginas públicas do player (token + cookie de render)
│   └── admin/           # Exige requireAdmin() + AAL2
├── features/            # Domínios: videos, player, embeds, studio, analytics,
│                        # teams(account), billing, auth, inbox, intelligence…
├── components/          # UI compartilhada (ui/ = shadcn/Base UI, dashboard/, charts/)
├── lib/                 # BACKEND: auth, autorização, serviços, persistência,
│                        # integrações, segurança. Tudo privilegiado tem
│                        # `import "server-only"` na primeira linha.
├── services/            # Clientes HTTP do frontend (*/client.ts) + exceções
│                        # server-side nomeadas `server-*` (ex.: ads/server-events)
├── proxy.ts             # Sessão Supabase + CSP com nonce + cookie de render
├── supabase/            # Migrations, RLS, triggers atômicos de quota, seed
tests/                   # Vitest: unidade, regressão, fronteira, IDOR/paywall
docs/                    # Arquitetura, segurança, design system
```

## Fronteiras

| Camada | Pode | Nunca pode |
|---|---|---|
| Client Components (`"use client"`, `services/*/client.ts`) | UI, fetch às `/api/*`, validação de UX | Importar `lib/**` privilegiado, ler secrets, decidir autorização |
| Route Handlers | `guard()` → serviço → `NextResponse` | Regra de negócio inline, confiar em ID do cliente |
| `lib/**` servidor | Service-role, secrets, RLS bypass consciente | Ser importado pelo cliente (`server-only` quebra o build) |
| `lib/billing/catalog.ts`, `lib/player/pixels.ts`, `lib/analytics/*` (puros) | Importados por ambos os lados | Receber secrets (não têm) |

`tests/server-boundary.test.ts` trava a fronteira: todo módulo da lista
privilegiada precisa declarar `server-only`, e nenhum `"use client"` pode
importá-los. Quebrou o teste = PR bloqueado.

## Fluxo de requisição

```
Browser → proxy.ts (sessão + nonce CSP + cookie pp_embed)
  → Server Component (requireUser/requireAdmin) ou /api/* (guard())
  → guard(): CSRF → sessão → getTeamAccountContext → getAccountPlan
  → serviço lib/* com createAdminClient + filtro user_id = accountOwnerId
  → Supabase (RLS como rede de segurança; triggers atômicos p/ quotas)
```

Identidade sempre da sessão. `user_id`/`owner_id`/`team_id` do body são
ignorados para autorização. UUID identifica, não autoriza.

## Autenticação e autorização

- Supabase Auth (email/senha) via `@supabase/ssr`. Sem Better Auth/Clerk.
- `guard(request, { csrf, role: read|edit|manage, paid })` é a porta única
  (`src/lib/api/guard.ts`). `paid:true` em toda escrita e entrega de valor.
- Equipes: `getTeamAccountContext` — equipe própria sempre vence; dono =
  `accountOwnerId`; toda query escopa por ele.
- Admin: `requireAdmin()` + AAL2 (MFA).
- CSRF: `csrfGuard` em toda mutação com cookie; webhooks usam HMAC;
  telemetria pública usa `validateOrigin` + tokens HMAC amarrados.

## Dados e armazenamento

- Service-role em todo acesso servidor; RLS decorativa porém íntegra.
- Quotas com dupla barreira: pré-check amigável na API + trigger atômico
  (`pg_advisory_xact_lock`) no banco. Nunca só contagem prévia.
- Storage: R2 (principal) + Supabase Storage. Paths montados no servidor
  (`<owner>/<uuid>-<nome>`); `ownedAssetPaths()` filtra `config.assets`.
- `included_plays` = cota com overage cobrado (não bloqueio); medida via
  `getMonthPlaysUsed()` e exposta em headers + overview.

## Nova funcionalidade (checklist)

1. Rota mutante? `guard({ csrf: true, role, paid })` + rate limit.
2. Query nova? `.eq("user_id", account.accountOwnerId)` sempre.
3. Novo módulo servidor com secret/DB? `import "server-only";` + entrada na
   lista de `tests/server-boundary.test.ts`.
4. Novo estado selecionado/hover? Usar `--color-selected` e hovers neutros
   (ver `docs/apple-DESIGN.md` + tokens em `globals.css`).
5. Teste: comportamento em `tests/` + `npm test` + `tsc --noEmit` + build.

## Admin (`/admin`, `/api/admin/*`)

- Layout exige `requireAdmin()` (papel + MFA); proxy também barra `/admin`.
- APIs admin usam `adminGuard()` (sessão + papel, CSRF, rate limit
  `failClosed`) e operam cross-tenant por desenho.
- Toda mutação de suporte grava `admin_audit_log` (quem, o quê, em quem).
- Ações manuais (plano, status, trial, créditos) NÃO tocam o provedor
  (AbacatePay): conciliar cobrança lá. Avanços de plano/assim por diante
  valem a partir da escrita no banco + triggers de quota.
- SEO: `seo_targets` + `visibility_checks` (taxa = citados ÷ execuções);
  base técnica verificada em runtime (robots, sitemap, llms.txt, pricing).
