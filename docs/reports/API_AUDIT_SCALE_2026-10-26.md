# Auditoria Completa de API — Design, Segurança e Escala (2026-10-26)

**Escopo**: 76 rotas em `src/app/api/**` | **Skills aplicadas**: `api-and-interface-design`, `api-security-testing`, `api-design-principles`
**Cenário de carga auditado**: 120 mil usuários · 30 milhões de cliques em VSLs/dia · 10 mil acessos pesados simultâneos

---

## ⚡ ATUALIZAÇÃO (2026-10-26, sessão de correção): P0s CORRIGIDOS

Os 3 achados P0 **foram corrigidos nesta mesma data**, junto com os achados do code review (Standards/Spec). Validação: `tsc` 0 erros · suíte 777 passing + 2 baseline pré-existentes (route-guards L178/L236) · quality gates 3/3 ok.

| Fix | O que mudou | Evidência |
|---|---|---|
| **P0-3/D1 — teto de streams ressuscitado** | Query de contagem agora filtra `viewer_id = streamKey` (a MESMA dimensão da escrita), **exclui a própria sessão** (`session_id <>`), **sem join** com player_configs. O join anterior (`playerConfigs.id = videoLiveSessions.sessionId`) nunca casava → count sempre 0 → teto morto (regressão do commit 1649031, confirmada em vermelho com o SQL real: `video_id = $1 and player_configs.user_id = $2`). | `src/app/api/embed/[id]/route.ts` + teste de regressão que serializa a cláusula WHERE real via `PgDialect().sqlToQuery` (não count hardcoded) em `tests/embed-routes.test.ts` |
| **P0-2 — COUNT mensal fora do heartbeat** | `getMonthPlaysUsedCached` (LRU, TTL 60s) em `src/lib/access/quota-cache.ts`, consumido pelo ingest. O COUNT DISTINCT mensal não roda mais a cada 75s por sessão ativa. | `src/lib/analytics/ingest.ts` (quotaHeadersOf) |
| **P0-1 — rate limit fora do banco no hot path** | Novo `rate-limit-local` (janela fixa por instância, LRU 50k, mesmo formato 429 + headers IETF). **9 call sites públicos migrados**: embed config, session, stream, manifest, capi, analytics ×2, ab-events ×2. ~80M writes/dia saem do Postgres. Helpers puros extraídos para `rate-limit-shared.ts`. Trade-off documentado (teto real ≈ max × N instâncias) com alvo evolutivo Upstash. | `src/lib/security/rate-limit-local.ts`, `rate-limit-shared.ts` + 6 rotas |
| **P1-4 + D3 dedup** | `findPublishedPlayerConfig` existia em **4 cópias idênticas**; agora é 1 módulo compartilhado (`embed-config.ts`) com **cache LRU 10s** para config e vídeo, consumido pelas **5 portas** (config, stream, manifest, capi, session-mint). ~30 DB ops/play a menos no pico. | `src/lib/player/embed-config.ts` |
| **P1-5 — pool com bounds** | `max` explícito (env `PG_POOL_MAX`), `connectionTimeoutMillis: 10s`, `idleTimeoutMillis: 10s`. Fim da fila sem teto. | `src/lib/db/index.ts` |
| **Standards — console + erros duplicados** | `console.error` → `safeLog` nos 4 arquivos de embed tocados; `GENERIC_ERROR_MESSAGES` em `src/lib/errors.ts` consolidou as strings literalmente duplicadas em **13 arquivos** (família OTP em 7, auth fallbacks em 6), alinhando variações inconsistentes ("Solicite um novo código." vs "Tente novamente."). Strings contextuais únicas (~60) permanecem nos componentes donos do contexto — não eram duplicatas. | `src/lib/errors.ts` + 13 arquivos |
| **Fronteira de servidor** | 4 módulos novos registrados em `tests/server-boundary.test.ts` (PRIVILEGED + regex), conforme regra 7 do AGENTS.md. | `tests/server-boundary.test.ts` |

**Scope creep do review (landing page)**: verificado — mudança é apenas metadata SEO (title/description/keywords) alinhada ao llms.txt do mesmo commit, ratificada pelo dono no push aprovado. Documentado, não revertido.

**Novo DB ops/play estimado pós-fix**: ~61 → **~12** (config 1 + session 1 + streams ~1 lookup cacheado + ingest 4 com quota em cache) ≈ 3.600 ops/s no pico de 300 plays/s — dentro da capacidade do Neon com margem para autoscale.

---

## 1. Veredito Executivo

| Dimensão | Nota | Resumo |
|---|---|---|
| **Design de contrato (REST)** | B | Contratos consistentes, naming correto, OpenAPI publicado, erros uniformes. Falta paginação em metade das listas. |
| **Segurança (OWASP API Top 10)** | A- | BOLA fechada por filtro `accountOwnerId` + suíte de 12 testes cross-tenant; idempotência atômica no webhook Stripe; CSRF+rate limit no guard único. Nenhum achado crítico novo. |
| **Escala (30M cliques/dia)** | **D** | **NÃO AGUENTA O PATAMAR DE HOJE COM MARGEM.** O hot path faz ~61 operações de banco por play; no pico isso é 4–10× acima da capacidade do Neon (0.25–2 CU). 3 achados P0 exigem correção ANTES do tráfego crescer. |

**Conclusão**: a API está **correta e segura** para o tráfego atual (91 MB transferidos até agora = folga), mas **quebra no cenário que você descreveu**. Os três P0 abaixo são a diferença entre 300 plays/s de pico funcionar ou o banco cair.

---

## 2. A Matemática da Carga (onde a API realmente gasta)

Perfil por **play** de VSL (MP4 progressivo, sem HLS — documentado em `docs/videojs-integration.md`):

| Etapa | Requests | Ops de banco por request | Total |
|---|---|---|---|
| `GET /embed/[id]` (config) | 1 | 1 write rate-limit + 2 config + 1 video + 1 upsert live-session + 1 COUNT live-sessions | ~6 |
| `POST /embed/[id]/session` | 1 | 1 write rate-limit + 1 config | ~2 |
| `GET /embed/[id]/stream` (range requests do `<video>`) | **8–12** | 1 write rate-limit + 2 config + 1 video | **~32** |
| `POST /analytics-events` (heartbeat 75s em sessão de ~3min) | 2–4 | 2 writes rate-limit + 2 lookups + 1 upsert + 1 COUNT DISTINCT mensal + 1 insert | ~21 |

**~61 DB ops por play.**

- 30M cliques/dia → 347/s de média. Conversão clique→play real estimada 15–35% → **4,5M–10M plays/dia**.
- Pico (60–70% do tráfego em 6h úteis, 2,5–3× a média): **250–350 plays/s**.
- **Pico de banco: 15.000–21.000 ops/s** (61 × 300). Neon autoscale 0,25–2 CU entrega confortavelmente ~1.000–4.000 queries/s simples.
- **10 mil sessões simultâneas** = 133 lotes de heartbeat/s, cada um rodando um `COUNT(DISTINCT)` sobre o mês inteiro do dono (achado P0-2).

---

## 3. Achados — P0 (corrigir antes de crescer o tráfego)

### P0-1 · Rate limit 100% no banco no hot path público — o limitador É a carga

**Evidência**: `src/lib/security/rate-limit.ts:112-146` — cada check é um `INSERT ... ON CONFLICT DO UPDATE RETURNING` no Postgres. Aplicado a `embed-config` (L60), `embed-session` (L43), `embed-stream` (L67) e 2× em `analytics-events` (L42+L50).

**Impacto no seu cenário**: o stream responde a cada range request do `<video>` — 8–12× por play. Só essa rota gera ~80M writes/dia em `rate_limits` no patamar de 10M plays. O mecanismo de proteção contra abuso vira o maior gerador de abuso do próprio banco. Além disso `cleanupExpired` (L12-20) roda DELETE por instância (variável `lastCleanup` é por-instância em serverless — múltipla em N instâncias).

**Correção recomendada** (em ordem de preferência):
1. **Mover rate limit de rotas públicas de embed para fora do banco**: Vercel Firewall / Edge middleware com contador em memória por instância + `@upstash/redis` (skills `upstash` já no catálogo) para janela precisa cross-instância. DB-backed fica SÓ para rotas autenticadas (guard, login, checkout, admin) onde volume é 1000× menor.
2. Alternativa mínima: cache local por (IP+player) com janela de 60s em memória (como `vpn.ts` faz) e write-through amortizado — aceita supercontagem por instância, suficiente para anti-rajada.
3. Amostrar: o teto de 300/min/IP por player raramente precisa de precisão exata; check 1-em-5 com multiplicador.

### P0-2 · `COUNT(DISTINCT)` mensal por heartbeat — o assassino silencioso

**Evidência**: `src/lib/analytics/ingest.ts:92` (`quotaHeadersOf`) → `src/lib/access/service.ts:292-307` (`getMonthPlaysUsed`): `count(distinct session_id)` sobre `video_events` filtrando `user_id + event_type='play' + created_at >= mês`. Roda **em cada lote de ingest** (a cada 75s por sessão ativa).

**Impacto**: um dono com 100 mil plays/mês acumula 100 mil+ linhas; cada heartbeat varre esse índice inteiro. No seu cenário: 10k sessões simultâneas = 133 COUNT/s sobre índices que crescem o mês todo. Custo por query cresce linearmente com o mês — no dia 30 é ~30× o custo do dia 1. Esse é o achado com maior risco de **degradação progressiva imperceptível** (ninguém percebe até o banco deitar).

**Correção recomendada**:
1. **Cache do valor por owner, TTL 60s** (LRU como `access-cache.ts`) — o header é observabilidade, não precisa ser exato por lote.
2. Melhor: mover para o `after()` (não precisa ser síncrono) OU ler do **rollup diário que já existe** (`video_daily_stats`, schema L1300) + delta do dia.
3. Definitivo: contador incremental em tabela `play_counts(user_id, month, count)` atualizado com `INSERT ... ON CONFLICT DO UPDATE SET count = count + 1` no momento do play (1 write barato), e `getMonthPlaysUsed` vira leitura O(1).

### P0-3 · Teto de streams simultâneos está MORTO (bug funcional, regressão do commit 1649031)

**Evidência**: `src/app/api/embed/[id]/route.ts:173-183`:
```ts
.from(videoLiveSessions)
.innerJoin(playerConfigs, eq(playerConfigs.id, videoLiveSessions.sessionId))
```
`sessionId` é um UUID gerado pelo **cliente** (mintado em `POST /session`), nunca um ID de `player_configs`. O inner join não casa nenhuma linha → `count` sempre 0 → `effectiveActiveSessions >= maxStreams` **nunca** é verdade → `limitConcurrentStreams` nunca bloqueia. A correção M9 (Front D) introduziu esse join; antes a query funcionava por `viewerId`.

**Correção**: o upsert (L157-163) já grava `viewerId: streamKey` — a contagem correta é direta no índice existente `video_live_sessions_viewer_id_idx`:
```ts
db.select({ count: sql<number>`count(*)::int` })
  .from(videoLiveSessions)
  .where(and(
    eq(videoLiveSessions.videoId, playerConfig.videoId),
    eq(videoLiveSessions.viewerId, streamKey),
    gt(videoLiveSessions.lastSeenAt, freshSince),
  ))
```
Sem join, sem fallback, O(1) no índice. **Teste de regressão obrigatório**: 2 sessões do mesmo IP com `maxConcurrentStreams=1` → a segunda deve levar 409 (a suíte atual passou porque o teste mocka o banco e não exercita o SQL real).

---

## 4. Achados — P1 (escala, corrigir no pós-launch imediato)

### P1-4 · Zero cache de `playerConfig`/`video` nas 4 portas de embed
`findPublishedPlayerConfig` (idêntico em `embed/[id]/route.ts:48-54`, `stream/route.ts:45-51`, `manifest/route.ts:44-45`, `capi/route.ts:52-53`) roda **2 queries sempre** (busca por playerId E por videoId em paralelo — o segundo só é necessário quando o primeiro falha). Config publicado muda raramente. **Fix**: cache LRU em memória TTL 30–60s (padrão `access-cache.ts`, já aprovado pelo dono com trade-off documentado) + fallback: só rodar a segunda query se a primeira não achar. Economiza ~30 DB ops/play (2 queries × 12 range requests).

### P1-5 · Pool Postgres sem limites explícitos
`src/lib/db/index.ts:39` — `new Pool({ connectionString })`: usa default `max=10` por instância, sem `connectionTimeoutMillis`, sem `idleTimeoutMillis`. Sob rajada, a fila do pool cresce sem teto e o request fica pendurado até o timeout da plataforma (504 misterioso). **Fix**: `max: 5` (serverless: instâncias são barateadas pela plataforma, o limitador real é o Neon pooler), `connectionTimeoutMillis: 10_000`, `idleTimeoutMillis: 10_000`, e `statement_timeout` nas sessões do hot path. Com Vercel Fluid + `attachDatabasePool` já configurado, falta só o bound explícito.

### P1-6 · Guard faz `getAccountPlan` sem cache (+2–3 queries por request autenticado)
`src/lib/api/guard.ts:67` — o `access-cache.ts` de 30s só é usado no embed; o guard re-resolve plano em toda chamada de dashboard. Com 120k usuários e painéis que fazem chamadas múltiplas (overview, vídeos, analytics), cada tela = 10–20 requests × 3 queries de contexto. **Fix**: reaproveitar o mesmo cache de 30s para `getAccountPlan` (trade-off idêntico ao já aprovado: cancelamento propaga em ≤30s).

### P1-7 · `findIngestTarget` serial (`ingest.ts:170-188`)
2 queries sequenciais (video, depois player) em cada lote. **Fix**: `Promise.all` (padrão já usado no restante do código) ou 1 join por videoId.

### P1-8 · Entrega de webhook sequencial por evento (`ingest.ts:300-317`)
`for (const event ...) await deliverWebhook(...)` no `after()`. Conta com webhook lento + evento em rajada = função estoura duração e eventos se perdem. **Fix**: `Promise.allSettled` com concorrência limitada (5); estrutural: fila (QStash — skill `upstash` no catálogo).

---

## 5. Achados — P2/P3 (qualidade de contrato)

| # | Achado | Evidência | Fix |
|---|---|---|---|
| P2-9 | **Paginação inconsistente**: `videos` pagina (`VIDEO.LIST_PAGE_SIZE`), mas `folders` limit(200), `ab-tests` limit(100), `roadmap` limit(500), `analytics/[videoId]` limit(500), `live-logs` limit(500) — truncam sem cursor nem metadados | grep `\.limit\(` | Keyset pagination (`?before=<createdAt>`) nas listas grandes; retorno com `nextCursor` |
| P2-10 | `account/export` faz 17+ queries paralelas grandes (5000 vídeos, 2000 players, 500 ledger) num GET único | `account/export/route.ts:76-117` | Já tem rate limit 5/h ✅; considerar `maxDuration` explícito e streaming de resposta |
| P2-11 | `roadmap` GET sem filtro por dono | `roadmap/route.ts:15` | Confirmado BY DESIGN (board público de sugestões) — documentar no OpenAPI |
| P3-12 | **Sem versionamento** (`/api/v1` não existe) | — | API first-party, OK; MAS `player-loader` e o contrato do embed são consumidos por **sites de terceiros** = API pública de facto (Hyrum's Law em força total). Congelar contrato do embed como estável; mudanças só aditivas |
| P3-13 | `findPublishedPlayerConfig` busca por playerId e videoId sempre juntas (ver P1-4) | 4 rotas | Ordenar: playerId primeiro, videoId só se vazio |

---

## 6. Segurança — OWASP API Security Top 10 (2023)

| Item | Status | Evidência |
|---|---|---|
| **API1 BOLA** | ✅ Fechado | Filtro `accountOwnerId` em toda query (padrão do repo) + suíte BOLA 12 testes (`bola-cross-tenant.test.ts`) + guard com contexto de equipe |
| **API2 Auth quebrado** | ✅ | Neon Auth gerenciado; sessão via SDK; `getCurrentUserId` no guard; rotas mutantes exigem CSRF |
| **API3 Propriedade/objeto** | ✅ Corrigido nesta sessão | Máscara de `webhookUrl`/`alertWebhookUrl` (GET intelligence/controls + export LGPD); `filterConfigForEmbed` (C2); export com `videosMeta` |
| **API4 Consumo de recursos** | ✅ No design / ⚠️ no custo | Rate limit por sessão (120/min) + agregado por IP (600/min, M5) + limites de payload medidos por bytes reais; **mas** o custo do próprio rate limit é o P0-1 |
| **API5 Function-level authz** | ✅ | `role: "read"/"edit"/"manage"` no guard; admin routes usam `getCurrentAdminUser` + trilha `admin_audit_log` |
| **API6 Acesso ilimitado a fluxos de negócio** | ✅ | Checkout 10/min fail-closed; trial/quota no servidor; overage informativo documentado |
| **API7 SSRF** | ✅ | Webhooks outbound são URL do dono mas entregues pelo servidor com `deliverWebhook` (sem fetch de URL client-side em fluxo sensível); sem proxy de URL arbitrário |
| **API8 Misconfig de segurança** | ✅ | CSP com nonce via proxy; headers `no-store` consistentes; CORS sem reflexão arbitrária (RM-03) |
| **API9 Inventário** | ✅ | `openapi.json` publicado + llms.txt; 76 rotas mapeadas na matriz D4 |
| **API10 Uso inseguro de IA** | N/A | Sem endpoints de IA de terceiros expostos; `ai/analyze` tem wallet + rate limit |

**Idempotência (api-and-interface-design)**:
- ✅ **Stripe webhook: exemplar** — claim atômico `INSERT ON CONFLICT DO NOTHING` em `payment_webhook_events` com unique em `providerEventId` (`webhooks/stripe/route.ts:57-84`); reentrega → 200 no-op; falha → reprocessável. É exatamente o padrão "let the unique constraint pick the winner".
- ✅ Analytics ingest: dedupe `(video_id, session_id, event_type, progress_percent)` ON CONFLICT DO NOTHING + `.returning()` para não reenviar webhook duplicado.
- ✅ Checkout Sessions: safe-to-retry por design (sessão nova expira sozinha; cobrança só via webhook idempotente).
- ⚠️ Nenhum endpoint aceita `Idempotency-Key` header — para o fluxo atual não há necessidade (nenhuma cobrança direta partindo do POST), documentar isso no OpenAPI.

**Validação em fronteiras** ✅: `readJsonBody` com limite de bytes + `normalizeAnalyticsBatch` validando shapes; UUID regex antes de qualquer query; `isValidViewerId`. Erros sempre `{ error: "código_estável" }` com status correto (400/401/402/403/404/409/415/429/502/503) — **shape único em todas as 76 rotas** (verificado por amostragem).

**Hyrum's Law / contrato estável**: o EmbedPlayer (`player-loader/[id]`) é JavaScript consumido por sites de terceiros — cada campo da config pública é contrato de facto. O `filterConfigForEmbed` + OpenAPI congelam isso bem; manter disciplina aditiva.

---

## 7. O que já está excelente (não mexer)

1. **Rate limit atômico contra TOCTOU** (janela fixa com `INSERT ON CONFLICT RETURNING`) — o design é correto, só está no lugar errado para a escala (P0-1).
2. **Headers IETF RateLimit-*** + `Retry-After` + `RateLimit-Policy` — acima da média do mercado.
3. **Paywall em duas portas** (config E stream) com cache 30s aprovado — se um dono cancela, a mídia cai em ≤30s.
4. **Dedupe de eventos com `.returning()`** evitando webhooks duplicados — elegante.
5. **Pipeline de origem do embed** (originToken assinado + cookie de render + UA + domínio) — defesa em camadas consistente entre as 4 portas.
6. **OpenAPI publicado** (`/api/openapi.json`) — pronto para pentest autônomo com Strix (falta só: 2 tokens de tenants distintos + 1 admin).

---

## 8. Plano de Ação Priorizado

| Ordem | Item | Esforço | Ganho no pico |
|---|---|---|---|
| 1 | **P0-3 fix do teto de streams** (remover join, contar por `viewerId=streamKey`) + teste de regressão | 1h | Restaura feature cobrada |
| 2 | **P0-2 cache/rollup de `getMonthPlaysUsed`** (TTL 60s) | 2h | Remove o COUNT mensal × 133/s |
| 3 | **P1-4 cache LRU 30s de playerConfig/video** nas portas de embed | 3h | −30 DB ops/play |
| 4 | **P0-1 rate limit off-DB no embed** (Vercel Firewall ou Upstash) | 1–2 dias | −80M writes/dia |
| 5 | **P1-5 bounds do pool** (`max`, timeouts) | 30min | Elimina 504s misteriosos |
| 6 | **P1-6 cache de plano no guard** | 1h | −2 queries/request autenticado |
| 7 | P2-9 keyset pagination nas listas truncadas | 1 dia | Contrato honesto p/ contas grandes |
| 8 | P1-7/P1-8 paralelização e concorrência de webhooks | 2h | Robustez |

**Estimativa pós-fix**: 61 DB ops/play → **~12** (config 1 + session 1 + streams 2 (lookup cacheado, rate local) + ingest 4 (quota em cache, lookups cacheados)) ≈ 3.600 ops/s no pico de 300 plays/s — dentro da capacidade do Neon com margem para o autoscale.

## 9. Próximo Passo Recomendado (api-security-testing)

A API tem OpenAPI publicado — o pentest autônomo com Strix fica barato quando você fornecer:
1. URL de staging/produção
2. **2 tokens de tenants diferentes** (prova de BOLA cross-org)
3. **1 token admin** (prova de API5)
4. Rotas fora de escopo (billing/checkout, cron, account/delete)

Com isso rodo `strix -n -t https://app -t ./openapi.json` cobrindo o checklist OWASP acima com exploits reais, e o resultado vira PR comments + SARIF no code scanning.
