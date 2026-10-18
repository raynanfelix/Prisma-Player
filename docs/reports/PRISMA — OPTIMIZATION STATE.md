# PRISMA — OPTIMIZATION STATE

**Fase 0 — Discovery (baseline read-only)** · Criado em 08/08/2026
**Projeto:** Prisma Player · **Repo raiz:** `C:\Users\rayna\Downloads\Prisma Player`

> Documento de **estado** (fatos medidos/capturados). Relatório analítico e roadmap
> vivem em `PRISMA — DISCOVERY REPORT.md` e `PRISMA — PRIORITIZED ROADMAP.md`.

---

## 1. Identidade do produto

| Campo | Valor |
| --- | --- |
| Nome | Prisma Player |
| Categoria | Player de VSL/hospedagem de vídeo brasileiro otimizado para conversão |
| Público | Infoprodutores e afiliados BR que rodam VSLs em landing pages |
| Proposta de valor | Player próprio (domínio do cliente), conversão e analytics first-party, escala sem surpresa de play |
| Concorrentes diretos BR | VTurb, Panda Video, Pluma Vídeo, JMVStream, Host VSL |
| Concorrentes globais | Vidalytics, Wistia, Bunny Stream, Cloudflare Stream, Vimeo |

## 2. Stack real (verificado no código)

- **Frontend/framework:** Next.js 16.2.12 (App Router), React 19.2.4, TypeScript strict
- **Estilo:** Tailwind CSS v4 + Base UI (shadcn/ui) + Motion (framer-motion) + Recharts/visx/cobe
- **Player:** Video.js via `@videojs/react` (v10) — embeds customizados
- **Backend/auth:** Supabase (Auth — e-mail/senha, Postgres, Storage)
- **Billing Brasil:** AbacatePay (assinaturas via cartão/PIX) — **Sem Stripe no billing real**
- **Pix celebration/pixels:** Meta CAPI + TikTok Events (server-side), Google gtag + Meta fbq + TikTok ttq (client-side no loader)
- **Analytics:** PostHog (eventos de produto) + analytics próprios (tabelas Supabase)
- **Storage/CDN:** Cloudflare R2 (bucket `videos` 1GB, `player-assets` 10MB) + Edge R2 
- **Orquestração:** Vercel (serverless + cron 1/dia) + `cloudflare/` (worker/functions auxiliares)
- **IA:** NVIDIA AI (NIM) — resumo/insights de analytics (`/api/ai`)
- **NÃO usa:** Prisma ORM, Redis, ClickHouse, ClickHouse, Kafka, `tus-js-client`

> Docs aspiracionais que NÃO refletem o runtime: `docs/auth-and-data-architecture.md`
> (cita Clerk — auth real é Supabase), `AUDITORIA_2026-07-29.md` (674 linhas, itens
> já corrigidos no código).

## 3. Estrutura do repo (topo da árvore)

- `src/` — aplicação (App Router)
- `src/app/api/` — 17 route groups (ver §5)
- `src/app/<page>` — about, admin, auth, checkout, dashboard, embed, login, pricing, privacy, reset-password, services, signup, studio, terms, welcome
- `src/features/*` — player, videos, analytics, folders, dashboard, admin, billing, marketing
- `src/lib/*` — supabase, storage(r2), api(guard), email, graph, ai, billing
- `src/services/*` — client.ts (fetch wrapper), videos, analytics, folders, dashboard, billing
- `src/middleware-utils`, `src/server`, `src/videojs`, `src/styles`
- `supabase/migrations/` — 29 migrations SQL + `seed.sql` + `functions/health` + `functions/*`
- `prisma/schema.prisma` — schema legado (não usado em runtime)
- `docs/` — documentação de arquitetura (parcialmente desatualizada)
- `tests/` — 7 testes (vitest): account-menu-click, analytics-summarize, api-request, client-api-service, config-env, embed-origin, player-assets
- `cloudflare/` — worker/functions
- `AUDITORIA_2026-07-29.md`, `mantis-summary.md` — auditorias recentes
- `vercel.json` — cron `/api/cron` diário ~12h + rewrites
- `next.config.ts` — CSP customizado (script-src 'unsafe-inline'), rewrites PostHog `/ingest/*`
- `API.md`, `CODE_OF_CONDUCT.md`, `CONTRIBUTING.md`, `LICENSE`, `PATENTS` (templates)

## 4. Envs (`/.env.example`)

Supabase (URL/PUBLISHABLE/SECRET/SERVICE_ROLE), EMBED_ORIGIN_SECRET, NEXT_PUBLIC_SITE_URL,
CRON_SECRET, TRUST_CLOUDFLARE_IP_HEADER, RESEND_API_KEY, REPORT_EMAIL_FROM,
META_CAPI_TOKENS_JSON + META_GRAPH_API_VERSION, TIKTOK_EVENTS_TOKENS_JSON + TIKTOK_EVENTS_API_URL,
ABACATEPAY_API_KEY + ABACATEPAY_WEBHOOK_SECRET, NVIDIA_API_KEY + NVIDIA_AI_MODEL +
NVIDIA_AI_BASE_URL, CLOUDFLARE_R2_* (ACCOUNT_ID, ENDPOINT, ACCESS_KEY_ID, SECRET_ACCESS_KEY,
BUCKET), R2_MAX_UPLOAD_BYTES, CLOUDFLARE_PURGE_URL/SECRET,
EMBED_CONFIG_RATE_LIMIT_MAX/WINDOW_MS, EMBED_MANIFEST_RATE_LIMIT_MAX/WINDOW_MS,
TRIAL_STORAGE_GB.

## 5. APIs (route handlers)

Cobertura por grupo em `/src/app/api`:

| Grupo | Rotas principais |
| --- | --- |
| `auth` | signup, login, logout, callback, forgot/reset, me |
| `billing` | checkout, webhook AbacatePay, subscription/create-cancel-update, invoices |
| `videos` | CRUD, upload, multipart (create/sign/complete/abort), manifest, thumbnail, deletar |
| `studio` | CRUD vídeo/metadados, config player |
| `embed` | manifest, config, origin-check |
| `player-loader/[id]` | script de embed no site cliente |
| `player-pixels` | digest de eventos + forwarding CAPI/Meta/TikTok |
| `analytics` | events ingest (beat), summary, funnels |
| `analytics-events` | injeção do batch |
| `ab-tests` / `ab-events` | testes A/B |
| `intelligence` | resumo IA (NVIDIA) do vídeo |
| `ai` | API de insights |
| `folders` | CRUD de pastas |
| `dashboard` | métricas do dashboard |
| `cron` | rotina diária (01:00) |
| `webhooks` | AbacatePay + outros |
| `billing` | operações billing |
| `account` | operações de conta |
| `dashboard-security` | segurança/limites |

**Autorização central:** `src/lib/api/guard.ts` — CSRF, sessão, papel, acesso pago, rate limit. Helper de API client em `src/services/client.ts`.

## 6. Banco de dados (Postgres via Supabase)

- 29 migrations SQL ordenadas por data + `seed.sql`. Tabelas órfãs do Better Auth dropadas
  em migrations posteriores (`drop_better_auth_tables`, `drop_orphan_better_auth_tables`).
- Buckets: `videos` (1GB), `player-assets` (10MB).
- RLS: tenant isolation via `own_all`/por-owner amplamente aplicado; storage policies.
- Tabelas principais (namespace): `videos`, `video_sessions` (live sessions), funções de
  SQL para embeds/manifesto, política RLS de player.
- Health: `supabase/functions/health` + `functions/*` edge.

## 7. Pipeline de vídeo (upload → delivery)

1. `VideoUploadProvider.tsx` → cliente → `/api/videos/[id]/multipart` (create/sign/complete/abort).
2. S3 multipart custom R2: partes 25 MiB (`VIDEO.MULTIPART_PART_SIZE`), presigned PUT 300s
   direto ao R2, `CacheControl: private, max-age=0, no-store`.
3. Upload finalizado → saída do R2 → manifest gerado → player `<video>`.
4. Entrega: R2 + Cloudflare Edge (rewrite do `cloudflare/` — de rede própria).

Nota: **tus-js-client está no package.json como dependência órfã** (0 imports em `src/`).

## 8. Analytics / eventos (fluxo)

- **Player (client):** `EmbedPlayer.tsx` emite `impression`, `play`, `complete`, `progress`
  (10/25/50/75/90), `cta_click`, `conversion` (value/currency/transactionId).
- **Identificador:** `sessionId = crypto.randomUUID()` por load do embed (sem bak.)
- **Dedupe client:** Set `${eventType}:${progressPercent}`.
- **Envio:** retry 3x + `keepalive`; heartbeat 15s → `video_live_sessions`.
- **Server:** `/api/player-pixels` persiste e forward Meta/TikTok; ingest no Postgres.
- **Loader:** `src/app/api/player-loader/[id]/route.ts` injeta player em sites do cliente;
  dispara `fbq`, `gtag`, `ttq` com consentimento/CMP agrupado `prisma-player:advertising-consent:v1`.
- **Conversão:** `track` → `window.PrismaPlayer`, dedupe `prisma-player:conversion:{playerId}:{transactionId}`
  (localStorage) + `conversion` CAPI.

## 9. Infra

- **Vercel:** serverless (App Router), cron `/api/cron` diário (00:00–01:00 UTC), rewrites
  PostHog (`/ingest/*`), proxy.ts na raiz.
- **Supabase:** Auth (email/pass), Postgres, Storage (buckets videos/player-assets), Edge
  Functions (health).
- **R2 + Cloudflare:** multipart upload, delivery via Cloudflare CDN pseudo-functions.
- **Monitoração:** PostHog (produto), logs Vercel. Sem alerta de erro configurado.

## 10. Estado de deuda técnica conhecida (do código; sem Fase 1 ainda)

- `tus-js-client` dep instalada mas não usada (candidata a remoção)
- CSP `script-src` com `'unsafe-inline'` documentado mas amplo
- Rouute `/api/analytics*` com `Cache-Control` → eficiência de ingest
- Concorrência: embeddings etária (`src/services/client.ts`) — ver report
- Docs aspiracionais divergentes do código (Clerk vs Supabase)

> Margem de erro: contagens exatas (nº de arquivos por pasta, nº de rotas) estão
> aproximadas e devem ser confirmadas com contagem ao entrar na FASE 1. Sites citados
> de documento com fontes internas e marketplace são dados públicos de concorrência.