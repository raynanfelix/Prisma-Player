# PRISMA — FASE 1 VALIDATION REPORT

> **Escopo:** Validação de hipóteses do `PRISMA — DISCOVERY REPORT.md` contra o código real.
> **Método:** 4 agentes de validação (Database/Security/Performance/General) + verificação manual do driver side.
> **Regra do MASTER PROGRAMA:** nenhuma mudança de **alto risco** foi feita nesta fase. Apenas **SAFE** (dependência morta atestada por dupla verificação).
> **Branch:** `fase1/validacao-hipoteses`

---

## 1. Correção de nomenclatura (crítico)

**A tabela `analytics_events` citada no DISCOVERY REPORT não existe.** A tabela de eventos analíticos real é **`video_events`** (migração `20260716011945`), complementada por `video_live_sessions` (20260719210000) e `player_events` (A/B, 20260716010629). Todas as leituras de "analytics_events" deste relatório devem ser interpretadas como `video_events`.

---

## 2. Vereditos consolidados

| Hipótese | Veredito | Evidência-chave |
|---|---|---|
| **H1** — Player serve MP4 único, sem ABR | ✅ **CONFIRMADO** | `<Video src={source.src}>` direto (`src/components/player/VideoPlayer.tsx:99`); fonte = URL assinada de objeto único (`src/app/api/embed/[id]/route.ts:84-86,101,111`). Zero `hls.js`/`m3u8`/`dash`; checkbox "HLS AES-128" em `VSLStudio.tsx:1286` é placebo de UI. |
| **H2** — Dashboard lento por queries agregadas pesadas (Recharts) | ❌ **REFUTADA** (como escrita) | Não existe agregação SQL em Postgres no dashboard — agregações rodam em **JS no servidor** (`src/lib/analytics/summarize.ts:88`); rota puxa até **50k linhas** (`MAX_EVENTS_PER_ANALYSIS=50000`, `src/lib/constants.ts:12`). Sintoma real = latência; causa real = transporte/row-count, não query agregada no banco. |
| **H4** — Faltam índices em tabelas analíticas | 🔶 **VALIDADA** (parcial) | **(a)** Índice `video_events_risk_idx (risk_score) WHERE risk_score>0` **nunca foi criado** — colisão de nome com `video_events_risk_idx` existente + `IF NOT EXISTS` trava por nome (20260719200000:16 vs 20260717161300:17). **(b)** Nenhuma consulta filtra só por `created_at`/`risk_score` sem índice (query global 90d `risk_score < 70` gera seq scan — benchmark em `20260719210000`). **(c)** Q9/Q7 filtram por `event_type` por índice prefixado. |
| **H-write** — evento analítico = request único ao Postgres, sem batching | ✅ **VALIDADA** | 1 `fetch` por evento (`EmbedPlayer.tsx:87,100,186,215`), `heartbeat` a cada 15s (`:193`), upsert **single-row** (`analytics-events/route.ts:83,91-97`); zero `sendBeacon`/fila/`insert([...])`/debounce (grep=0). Sessão de 5min ≈ **28-34 req / ~92 queries**; heartbeats ≈ 2/3 do volume. |
| **H6** — `tus-js-client` órfã | ✅ **CONFIRMADA** | 0 imports em `src/` (verificado 2x); upload real = R2 multipart (`src/app/api/videos/[id]/multipart/route.ts:5,34,42,53`). **Dep removida** (ver §4). |
| **H7** — docs citam Clerk, código usa BetterAuth (Supabase) | ⚠️ **PARCIAL** | Docs citam Clerk de fato (`docs/auth-and-data-architecture.md:1,8,12,18-20,25,29-32,55,60,64,66,69,76-78`), mas o runtime é **Supabase Auth nativo** (`@supabase/ssr`; `src/lib/auth/server.ts:2,6,19`), **não BetterAuth** — BetterAuth foi tentado e revertido (commit `155b02a`). |

---

## 3. Recomendações do discovery — status após validação

| Recom. | Status de risco | Veredito da validação |
|---|---|---|
| **R0.1** — endurecer webhook AbacatePay (assinatura, idempotência, replay) | 🔴 (billing) | **JÁ MITIGADO.** HMAC-SHA256 com `timingSafeEqual` + allowlist de 7 eventos + fail-closed (`src/app/api/webhooks/abacatepay/route.ts:41-65`; `src/lib/billing/abacatepay/webhook.ts:8-42`). Idempotência forte via upsert `onConflict:"provider_event_id", ignoreDuplicates` + claim transacional atômico (`route.ts:80-94`); replay estruturalmente inerte. **Opcional (defesa em profundidade):** falta `rateLimit` na rota e prefere HMAC sobre segredo na query string. |
| **R0.4** — CSP permissiva | 🟠 **REVIEW** | CSP boa em base (`object-src 'none'`, HSTS, `frame-ancestors 'self'` + embed `*`), mas `script-src 'unsafe-inline'` **sem nonce/hash** em `next.config.ts`. Não é buraco crítico (injection externa bloqueada), mas endurecer exige refatorar scripts de tema/JSON-LD p/ nonce. |
| **R0.3** — índices analíticos | 🟠 **REVIEW** | gaps confirmados em §2 (H4). Requer nova migration + EXPLAIN em dados reais antes de aplicar em produção. |

---

## 4. Mudança implementada nesta fase (SAFE)

**Remoção de `tus-js-client@4.3.1`** (H6 confirmada por 2 verifações):
- `package.json` / `package-lock.json` — dep removida.
- Verificação: `npm run typecheck` ✅ limpo; `npm test` ✅ **45/45 passando**; zero imports afetados.
- *Não houve nenhuma outra mudança de código.* (webhook/índices/CSP → aguardar fases de implementação com evidência/EXPLAIN.)

---

## 4. Próximos passos sugeridos (fora do escopo desta validação)

1. **Fase de performance (safe, alto valor):** batch de analytics no cliente (fila + flush 5s ou N eventos com `keepalive`) + `insert([...])` multi-row no server; idempotência já existe via `onConflict`/`ignoreDuplicates`. Heartbeats são o 1º alvo (2/3 do volume). Alinha com H-write.
2. **Fase de índices:** (a) criar `video_events_risk_idx` original (renomear p/ `video_feed_risk_idx`); (b) índice em `(created_at)` bruto ou na query `benchmark` global; (c) re-validar com `EXPLAIN ANALYZE` real.
3. **Fase de billing:** *sem ação de código necessária* — já mitigado; opcionais rate limiter + HMAC-only na webhook.
4. **Docs:** corrigir `docs/auth-and-data-structure.md` (Clerk → Supabase Auth), remover "HLS" do estúdio, e atualizar DISCOVERY/STATE com a correção de nome `video_events`.

---

## Anexo A — Triha de eventos (evidência H-write)

```
EmbedPlayer (src/features/player/components/EmbedPlayer.tsx)
  ├─ trackAnalytics() → POST /api/analytics-events  (keepalive:true; JSON ~300B)
  ├─ track()          → POST /api/ab-events
  └─ heartbeat()      → POST /api/analytics-events  (eventType:"heartbeat", intervalo 15s)

/api/analytics-events/route.ts
  ├─ 2 SELECTes paralelos (auth/origin + rate check) [userId, videoId] liveCtx
  ├─ upsert video_live_sessions ON CONFLICT (video_id, session_id)
  ├─ upsert video_events ON CONFLICT (video_id, session_id, event_type, progress_percent) DO NOTHING
  └─ after(): side-effects (webhook/pixel) só para o evento escrita
```