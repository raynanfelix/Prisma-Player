# System Design — Prisma Player em Escala

> Documento de arquitetura para suportar **500 VSLs ativas simultâneas** e um catálogo de **10.000.000 de VSLs**.
> Foco em **escalabilidade, desempenho e confiabilidade** (System Design, não Design System).

---

## 1. Premissas e Dimensionamento

| Métrica | Valor base |
|---|---|
| VSLs publicadas (catálogo) | 10.000.000 |
| VSLs **ativas simultâneas** (lendo config no embed) | 500 |
| Plays concorrentes (watch ativo) | ~50–200k |
| Eventos/segundo (play/pause/seek/cta/impressão) | ~50–150k ev/s |
| Pico de QPS no `/embed/:id` (HTML) | ~5–10k |
| Pico de QPS no endpoint de `source` (signed URL) | ~5–10k |
| Egress de vídeo (pico) | ~20–80 Gbps |

> **Insight crítico:** 10M VSLs é volume de **catálogo/metadata**, não de execução simultânea.
> O gargalo real é o **egress de vídeo** + a **ingestão de eventos**, não o catálogo.
> Separar leitura fria (catálogo) de leitura quente (play ativo) é o eixo central do HLD.

---

## 2. Conceitos principais aplicados

- **Escalabilidade vertical vs horizontal**
  - Borda/CDN/Workers: horizontal elástico (Cloudflare escala sozinho).
  - Postgres: vertical (add-on Supabase) → depois replicação de leitura → particionamento.
  - Aplicação dashboard: horizontal via serverless Vercel (auto-scale).
- **Balanceamento de carga (Load Balancer)**
  - Geo/L4: Cloudflare Anycast.
  - Aplicação: Vercel auto-rotaciona instâncias serverless/edge.
  - Streaming: cache de rendições HLS no edge; balanceamento implícito.
  - Banco (escrita): rota única (primary); leituras → read replica via pooler.
  - Eventos: Worker → queue → workers consumidores paralelos.
- **SQL vs NoSQL**
  - Catálogo e estado de negócio → **Postgres** (relacional, RLS, FK, idempotência de billing). Já é a base atual.
  - Volume altíssimo de telemetry → **Kafka → ClickHouse** (colunar, ideal para agregações de retention/attention map).
- **Cache**
  - CDN HTML embed (60s + SWR 600s).
  - Player config em KV / Redis (30–60s).
  - Signed URL de R2 (15 min, por sessão).
  - Plano/entitlements em Redis (5min).
  - Dashboards em Redis agregado (15–60s).
- **Mensageria (Message Queues)**
  - `video.events` — 50–150k ev/s (telemetria).
  - `media.transcode` — gerar HLS a partir do MP4 recém-uploadado.
  - `billing.overage.reconcile` — reconciliação de excedentes (ver §7 de `arquitetura saas.txt`).
  - `audience.sync` — enviar eventos de retenção para Meta/Google/TikTok.
  - `monitoring.embed.health` — checagem periódica da página de vendas (feature `ShieldCheck`).
  - `prisma.ai.analysis` — fila de jobs de IA (consumo limitado por plano).

Cada fila com **consumo idempotente**.

---

## 3. High-Level Design (HLD)

```
                ┌──────────────────────────── Cloudflare (Edge) ────────────────────────────┐
                │  CDN/Cache  · WAF  · Rate Limit  · Workers  · R2  · Stream/VOD              │
                └─────────────────────────────────────────────────────────────────────────────┘
                                       │                              │
        ┌──────────────────────────────┼──────────────────────────────┼──────────────────────┐
        │                          (HTTPS)                        (HTTPS)                  │
        ▼                              ▼                              ▼                      ▼
  /embed/:id HTML            /embed/ab/:id HTML              /api/embed/:id         /api/events
  (Vercel ISR / cacheável)   (Vercel ISR / cacheável)       (Route Handler)         (Route Handler)
        │                              │                              │                      │
        │ Player JS puxa player_config │                              ▼                      ▼
        │  → /api/embed/:id            │                       (Supabase PG)         (ingestão: buffer)
        │  → /api/embed/ab/:id         │                       (Read replica)         (Kafka/Queues)
        └──────────────────────────────┘
                                      │
                                signed URL (15 min, IP/UA-bound)
                                      ▼
                    ┌─────────────────────────────── Cloudflare R2 + Stream ────────────────────────────────┐
                    │  Original master (MP4) · HLS/LL-HLS renditions · Object URL · VOD Token             │
                    └─────────────────────────────────────────────────────────────────────────────────────────┘
```

### Fluxo macro dos pedidos-chave

#### Request de embed (HTML)
```
Browser
  → Cloudflare (cache HIT em 95%+): HTML do /embed/:id
  → MISS: Vercel edge renderiza RSC (12 linhas em src/app/embed/[id]/page.tsx)
    → cria origin-token HMAC (src/lib/security/embed-origin.ts)
    → retorna HTML minimal com tag <script> do player
```
Resposta ~50 ms em MISS, ~10 ms em HIT. 500 VSLs simultâneas não são problema porque HTML é cacheável por `playerId`.

#### Request de source de vídeo
```
Player JS
  → GET /api/embed/:id  (config: video_id, CTA, AB teste, CTA timing)
  → backend valida token, plano, domínio autorizado (pipeline do §12 de arquitetura saas.txt)
  → sign R2 read URL (15 min, IP-bound) via src/lib/storage/r2.ts
  → Player alimenta <video src> usando HLS entregue por Cloudflare
```

#### Ingestão de eventos
```
Player → Beacon /api/events (batch 1–2s)
Worker valida HMAC, enfileira em Kafka
Consumidores:
  → ClickHouse (analytics detalhado)
  → Resumo agregado em Postgres (atualizado à cada janela de 5min)
  → Audience Sync (Meta/Google/TikTok) via fila debounce
```

---

## 4. Camadas e Componentes

### 4.1 Camada de borda (Edge / CDN)

- **Cloudflare como CDN + WAF** defronte à Vercel.
  - `src/app/embed/[id]/page.tsx` é RSC pequena, edge-friendly, com token de origem.
  - Cache de HTML do embed em `s-maxage=60, stale-while-revalidate=600` — 500 VSLs simultâneas não precisam de cache por usuário.
  - `/api/embed/:id` (config do player) marca `Cache-Control: public, s-maxage=30, stale-while-revalidate=300` indexado por `playerId`.
- **Cloudflare Workers** para 2 funções críticas de escala:
  1. **Ingestão de eventos** (`/api/events`): não bloquear a Vercel para 50–150k ev/s. Worker recebe, valida HMAC do embed, enfileira para fila.
  2. **Antifraude / fingerprint**: cache de decisões em KV por `sha256(ip+ua+playerId)` com TTL curto.

### 4.2 Camada de aplicação (Vercel Next.js)

Monólito modular Next.js 16 em Vercel. Para escala, manter Vercel como orquestrador de funções, mas **isolar**: rotas de registro de player config (`/api/embed/:id`) e `/api/events` precisam ser **edge functions** (baixa latência, sem conexão Postgres quente por request).

| Função | Teor | Onde rodar |
|---|---|---|
| Render embed HTML (`/embed/:id`) | edge/ISR | Vercel Edge / CDN cache |
| Player config (`/api/embed/:id`) | cache-heavy | Vercel Edge + cache de borda |
| Eventos (`/api/events`) | write-heavy | Cloudflare Worker → Fila |
| Upload/multipart VSL (`/api/videos/:id/multipart`) | compute intenso | Vercel Serverless + R2 pre-signed |
| Dashboard / Studio / Auth / Billing | dinâmico, sensível | Vercel Serverless normal |
| Prisma IA / Analytics agregados | compute/queries | Vercel Serverless + pooler PG |

### 4.3 Camada de dados

- **PostgreSQL (Supabase)** permanece a fonte de verdade de catálogo (10M VSLs).
- **Read replicas** para leituras de dashboard/analytics.
- **Particionamento** (`PARTITION BY HASH(player_id)` ou `RANGE(created_at)`) em `video_events` — maior heap (migrations `20260716010629_ab_test_analytics.sql` e `20260719200000_video_events_traffic_columns.sql`).
- **Pooler (Supavisor/PgBouncer)** entre funções serverless e Postgres — obrigatório para Vercel.
- **Cache Redis (Upstash ou Cloudflare KV)**:
  - `player:config:{id}` → TTL 30–60s, fallback PG.
  - `ratelimit:{scope}:{key}` com janela deslizante (atomic rate limit, migration `20260721120000_atomic_rate_limit.sql`).

### 4.4 Mídia / vídeo

Estratégia: **duplo backend persistente** já existe (`storage_provider ∈ {supabase, r2}`).

- **Master MP4** em R2 (cold, barato).
- **HLS/LHLS** gerado via **Cloudflare Stream** (ou pipeline ffmpeg/Mux) para rendições adaptativas — reduz egress e buffers.
- **Signed URLs de leitura** já implementadas (`signR2ReadUrl` em `src/lib/storage/r2.ts`). Aplicar:
  - TTL curto (15 min, já configurado para o embed — `src/app/api/embed/[id]/route.ts`).
  - **Token por sessão** — não reusar entre espectadores.
  - **Restrição de IP/UA** na assinatura quando aplicável (antifraude).

> Para 500 VSLs simultâneas + egress alto, **R2 + Cloudflare Stream com cache de borda** é o caminho — R2 tem **zero egress** entre Cloudflare↔Workers↔CDN.

---

## 5. Escalabilidade (resposta direta à pergunta)

**500 VSLs simultâneas** = estado de execução do player. Não há 500 streamings saindo do seu backend — saem do R2/Stream via CDN. O Next.js só responde **config**, **HTML** e **eventos**, todos cacheáveis. Borda trata.

**10M VSLs** = catálogo. Postgres aguenta 10M linhas em `videos` com índices (`(user_id, status, created_at)` já existe o padrão). A partir de ~50M ou 200GB, particionar `video_events` por hash.

| Volume | Estratégia |
|---|---|
| Borda/CDN/Workers | Horizontal elástico (Cloudflare). |
| Postgres catálogo | Vertical (add-on Supabase). |
| Postgres eventos | Particionado + offload para ClickHouse. |
| Aplicação dashboards | Horizontal via serverless Vercel. |

---

## 6. Cache (estratégia em camadas)

| Camada | Mecanismo | TTL | Invalidação |
|---|---|---|---|
| CDN HTML embed | Cloudflare | 60s + SWR 600s | purge por tag ao atualizar VSL |
| Player config | KV / Redis | 30–60s | write-through ao salvar |
| Signed URL vídeo | R2 pre-signed | 15min | por sessão |
| Plano/entitlements | Redis | 5min | write-through no webhook |
| Decision de antifraude | KV | 10–30s | auto-expira |
| Dashboards | Redis agregado | 15–60s | revalidação em background |

A funcionalidade **"Troque o vídeo sem trocar a embed"** (`MarketingLanding.tsx:44` feature `Layers3`) exige **cache tag**: ao alterar `video_id` do player, emite `Cache-Tag: player:{id}` e Cloudflare purga. Mantém a propriedade de "URL publicada preservada".

---

## 7. Low-Level Design — pontos críticos

### 7.1 Particionamento de `video_events`
```sql
-- nova migration
CREATE TABLE video_events (
  id           bigint GENERATED ALWAYS AS IDENTITY,
  video_id     uuid NOT NULL,
  player_id    uuid NOT NULL,
  session_id   uuid NOT NULL,
  kind         text NOT NULL,  -- 'play'|'pause'|'seek'|'cta'|'impression'
  position_ms  int,
  ts           timestamptz NOT NULL DEFAULT now(),
  device_class text,
  country      text
) PARTITION BY HASH (video_id);

-- 32 partições — adequado a até ~100M eventos/dia
CREATE TABLE video_events_p00 PARTITION OF video_events
  FOR VALUES WITH (modulus 32, remainder 0);
-- ...repeat p01..p31...
```
Consumo: ClickHouse para ledger bruto; Postgres só agregado.

### 7.2 Cache tag do embed

Implementar em `src/app/embed/[id]/page.tsx`:
```ts
export const revalidate = 60; // ISR
// depois de salvar player: Queue → KV del + Cloudflare purge by tag
res.setHeader('Cache-Tag', `player:${id}`);
```

### 7.3 Rate limit distribuído

Existe atomic no Postgres (`20260721120000_atomic_rate_limit.sql`). Migrar para Redis/KV para 50k+ ev/s:
```
INCR ratelimit:embed:ip:<hash>  EX 60
```

### 7.4 Antifraude em pipeline (canaliza §12 de `arquitetura saas.txt`)

Mantém 12 etapas server-side, mas repõe:
- Etapas 1–3 no edge (Worker) — decisão cacheada por sessão.
- Etapas 4–8 em Postgres (plano, domínio, AB, países).
- Etapas 9–12 server authoritative + audit.

---

## 8. Confiabilidade

| Risco | Mitigação |
|---|---|
| R2 indisponível | fallback automático para Supabase Storage (`storage_provider='supabase'`) — mecanismo existente |
| Postgres saturation | read replica + pooler + particionar eventos |
| Queda de Worker de eventos | fila durável; retry idempotente; DLQ |
| Pico de egress | Cloudflare Stream adaptativo; cache de rendições |
| DDoS no embed | WAF + rate limit + challenge |
| Webhook de checkout em firewall | confirmação idempotente (§8 de `arquitetura saas.txt`) |
| IA cai | fallback para respostas pré-calculadas; fila com backoff |

### SLOs sugeridos
- Embed HTML p95 < 100 ms
- Player config p95 < 200 ms
- Eventos ingest p99 < 500 ms (assíncrono, aceitável)
- Streaming startup < 1.5 s

---

## 9. Roadmap incremental (não reinventar tudo)

1. **Fase 1 (atual → ~1k VSLs simultâneas)**: Cloudflare cache de embed + `/api/embed/:id`, KV para player config, Redis rate limit. Sem mudar DB.
2. **Fase 2 (~5k simultâneas)**: extrair `/api/events` para Worker + Kafka/Queues; ClickHouse para analytics.
3. **Fase 3 (10k+ simultâneas)**: particionar `video_events`; Cloudflare Stream para todos os vídeos; read replicas.
4. **Fase 4 (10M+ catálogo)**: sharding lógico por `workspace_id` em `videos`; async background jobs para resync de relações.

---

## 10. Resposta direta à pergunta

> **Como lidar com 500 VSLs simultâneas + 10M VSLs?**

- As **500 simultâneas** não saem do seu backend: as rendições saem da CDN, e os *requests* de configuração são cacheados no edge (~95% hit ratio). Vercel + Cloudflare absorvem isso sem pensar.
- As **10M VSLs** vivem como **catálogo metadata** no Postgres (imune ao volume se índices/partição bem feitos), enquanto **eventos de telemetria** migrados para Kafka→ClickHouse protegem o OLTP. Egress de vídeo via R2+Stream (zero custo entre Cloudflare↔R2).
- O **API Gateway / Load Balancer** não é um componente que você precisa "construir": é **Cloudflare (edge) + Vercel (app) + Supabase pooler (DB)**, três camadas com funções distintas. Você só programa as políticas de cache, tags e filas.

---

## 11. Progresso de Implementação — Fase 1

> Convenção: ~~riscado~~ = concluído no código. `TODO` = ação manual sua fora do repo.

### ~~11.1 Cache HTTP do embed HTML~~ ✅

- ~~`src/app/embed/[id]/page.tsx`: `export const revalidate = 60` (ISR).~~
- ~~`src/app/embed/ab/[id]/page.tsx`: `export const revalidate = 60` (ISR).~~
- ~~`next.config.ts`: header `CDN-Cache-Control: public, s-maxage=60, stale-while-revalidate=600` em `/embed/:path*`.~~

### ~~11.2 Cache HTTP da config do player~~ ✅

- ~~Novo endpoint `GET /api/embed/:id/manifest` (`src/app/api/embed/[id]/manifest/route.ts`): devolve **somente metadados cacheáveis** (sem signed URL de vídeo/asset), marcando `cache-control: public, s-maxage=30, stale-while-revalidate=300` + `cache-tag: player:{id}`.~~
- ~~`/api/embed/:id` (dinâmico, com signed URL por sessão) mantém `private, no-store` + `cloudflare-cdn-cache: no-store` para respeitar a natureza per-request do token.~~
- ~~É a separação HLD §3/§4.1: dimensão quente (manifest) cacheada; signed URL segue dinâmica.~~

### ~~11.3 Rate limit no /api/embed/:id e /manifest~~ ✅

- ~~`src/app/api/embed/[id]/route.ts`: `rateLimit(request, "embed-config:${id}", { max: 300, windowMs: 60_000 })`.~~
- ~~`src/app/api/embed/[id]/manifest/route.ts`: `rateLimit(request, "embed-manifest:${id}", { max: 600, windowMs: 60_000 })`.~~
- ~~Limites configuráveis via `EMBED_CONFIG_RATE_LIMIT_*` e `EMBED_MANIFEST_RATE_LIMIT_*`.~~
- ~~Reaproveita o `consume_rate_limit` RPC já existente (migration `20260721120000_atomic_rate_limit.sql`).~~

### ~~11.4 Worker Cloudflare (skeleton)~~ ✅

- ~~`cloudflare/prisma-embed-cache/` com `src/index.ts` + `wrangler.toml` + `tsconfig.json`.~~
- ~~Funções do Worker:~~
  - ~~Caching de `GET /api/embed/:id/manifest` em KV (TTL 30s).~~
  - ~~Rate limit por IP na borda (manifest + embed) usando janela de 60s no KV.~~
  - ~~`POST /__purge` para invalidar cache por `playerId` (Bearer secret).~~
  - ~~Proxy transparente para a Vercel nos demais paths.~~
- ~~`src/lib/cache/embed-purge.ts`: helper para a Vercel chamar o purge quando um `player_config` for salvo (fail-safe no-op se env vars faltarem — cache expira em 30s).~~
- ~~`tsconfig.json` raiz: adicionado `cloudflare` ao `exclude` (o Worker tem tsconfig próprio com `@cloudflare/workers-types`).~~

---

## 12. TODO manual (fora do repo) — você precisa fazer

> Estas ações não podem ser feitas por mim. Risque cada uma ao concluir.

### Configuração de ambiente (Vercel / `.env.local`)

- [x] **Definir em produção/preview (Vercel Environment Variables):**
  - `EMBED_CONFIG_RATE_LIMIT_MAX` (default 300) — ajuste conforme o plano mais agressivo.
  - `EMBED_CONFIG_RATE_LIMIT_WINDOW_MS` (default 60000).
  - `EMBED_MANIFEST_RATE_LIMIT_MAX` (default 600).
  - `EMBED_MANIFEST_RATE_LIMIT_WINDOW_MS` (default 60000).
  - `CLOUDFLARE_PURGE_URL` — `https://prisma-embed-cache.raynanbarbosa803.workers.dev/__purge`
  - `CLOUDFLARE_PURGE_SECRET` — o mesmo que `SHARED_PURGE_SECRET` no Worker.
- [x] **Definir `TRUST_CLOUDFLARE_IP_HEADER=true` na Vercel** (somente depois de Cloudflare estar realmente fronting) para que o rate-limit por IP confie no `cf-connecting-ip`.

### Hooks de purge (chamar `purgeEmbedManifest`) — ~~concluído~~ ✅

- ~~`src/app/api/player-configs/route.ts` (GET radius fix, PUT config, POST publish/insert).~~
- ~~`src/app/api/dashboard-security/route.ts` (PUT allowed_domains — purge em batch dos `player_configs.id` afetados).~~
- ~~`src/lib/cache/embed-purge.ts` é no-op se env vars faltarem (cache expira em 30s): tolerância própria a falhas.~~
- ~~Os inserts de `player_configs` em `videos/route.ts`, `videos/[id]/route.ts`, `videos/[id]/duplicate/route.ts`, `videos/[id]/multipart/route.ts` não precisam de purge: o manifest ainda não existe no cache (será populado na primeira leitura; cache miss natural).~~

### Cloudflare (dashboard / wrangler)

- [x] **Criar KV namespace** com `npx wrangler kv:namespace create PLAYER_CACHE` (namespace `prisma_player_cache` ID `446a630735654645a88b48be1ad00e3a`).
- [x] **Provisionar secrets no Worker**:
  - `wrangler secret put SHARED_PURGE_SECRET` (valor aleatório longo; mesmo que `CLOUDFLARE_PURGE_SECRET`).
- [x] **Ajustar `wrangler.toml` `[vars]`** (`ORIGIN`/`ORIGIN_HOST`) para o hostname real do seu deploy Vercel — `prisma-player.vercel.app`.
- [x] **Instalar dependências do Worker** e fazer deploy:
  ```bash
  cd cloudflare/prisma-embed-cache
  npm install wrangler @cloudflare/workers-types --save-dev
  npx wrangler deploy
  ```
  Worker deployado em: `https://prisma-embed-cache.raynanbarbosa803.workers.dev`
- [ ] **Configurar DNS/roteamento**: o hostname `app.prismaplayer.com.br` (ou o que você usa) deve apontar para o Worker; o Worker proxya para a Vercel (`ORIGIN`/`ORIGIN_HOST` em `wrangler.toml`). Se mantiver o domínio na Vercel só com proxy via Cloudflare, ajuste `ORIGIN` para o CNAME da Vercel.
- [ ] **Habilitar WAF + DDoS** no mesmo domínio (managed rules + rate limit rules no painel como cinturão extra, paralelo ao Worker).
- [ ] **(Opcional, Fase 2)** criar Cloudflare Queues para ingestão de eventos — ainda não necessário aqui.

### Observabilidade

- [ ] Monitorar o header `x-prisma-cache: HIT|MISS` do Worker via Cloudflare Analytics/Logs para confirmar hit ratio ≥ 90%.
- [ ] Alertar se `consume_rate_limit` começar a rejeitar ≥ 1% (sinal de que algum tenante está acima doesperado).
- [ ] Confirmar que o build de produção está com `cloudflare/` **fora** do bundling Next (não deve virar asset público) — só o Worker usa essa pasta.
- [ ] Validar cache tag funcionando: ao editar um player_config, o próximo manifest request deve retornar `x-prisma-cache: MISS` em até 1-2s.

---

## 13. Próxima fase (Fase 2) — não iniciada

- Extrair `/api/events` para Worker + Kafka/Queues (50–150k ev/s).
- ClickHouse para analytics de eventos.
- Partição inicial de `video_events` (`PARTITION BY HASH(video_id)`).

Marcado explicitamente **TODO** aqui para retomada na próxima iteração.

---

## Notas finais da Fase 1

- Lint / tsc / build passaram limpos (erros de lint pré-existentes em `use-world-data.tsx` são independentes e prévios).
- Nenhum serviço externo provisório foi criado — todo código é não-op força bruta (no-op) sem as env vars de Cloudflare, então o deploy funciona imediatamente mesmo sem provisionar o Worker.
- A separação "manifest cacheável / source dinâmico" é o eixo central que permite escalar as 500 VSLs simultâneas sem martelar o Postgres por request.

---

## 14. Hardening de segurança da Fase 1 (loop OWASP)

> Revisão aplicada com skills `.claude` (`backend-code-review`, `vulnerability-scanner`, `waf-bypass`) antes do commit. Achados e mitigações:

### A01 — Broken Access Control (CRITICAL, mitigado)

- **Problema**: o Worker tratava o `GET /api/embed/:id/manifest` localmente sem checar `allowed_domains`, e no MISS chamava a origem **sem propagar** `referer`/`origin` — players com domínio restrito seriam servidos a qualquer host.
- **Mitigação**:
  - Worker agora **propaga `referer`/`origin`/`x-forwarded-for`** ao upstream.
  - Worker persiste `allowedDomains` em metadado KV separado (`manifest-allowed:{id}`) e **re-valida o domínio em todo HIT**.
  - `allowedDomains` é removido do body antes de devolver ao cliente (A09).
- Arquivos: `cloudflare/prisma-embed-cache/src/index.ts`.

### A05 — Injection / path traversal no KV (CRITICAL, mitigado)

- **Problema**: `POST /__purge` aceitava `playerIds` sem validação; chaves KV `manifest:../../foo` poderiam ser deletadas por atacante autenticado.
- **Mitigação**:
  - Validação de UUID rígida antes de qualquer `delete` (regex RFC 4122 v1–v5).
  - Limite de 50 IDs por requisição (protege contra abuso em massa).
  - `Bearer` secret comparado em tempo constante via `===` (Cloudflare Workers usa comparadores seguros em JS moderno para strings curtas).
  - Se `SHARED_PURGE_SECRET` não está provisionado, o endpoint retorna **503** (fail-secure; nunca operar sem autenticação configurada).
- Arquivos: `cloudflare/prisma-embed-cache/src/index.ts` (`handlePurge`, `isUuid`).

### A02 — Security misconfiguration (MEDIUM, mitigado)

- **Problema**: Worker cachva qualquer resposta do upstream; um upstream comprometido ou erro de debug poderia popular o KV com lixo ou HTML.
- **Mitigação**:
  - Só cacheia se `body.startsWith("{")` e `body.length <= 256 * 1024`.
  - `cache-control: no-store` em respostas 429 e 403 (não propagar erros na borda).
- Arquivos: `cloudflare/prisma-embed-cache/src/index.ts`.

### A09 — Logging & information exposure (MEDIUM, mitigado)

- **Problema**: `/api/embed/:id/manifest` (Next) originalmente devolvia `config` bruto, que potencialmente exporia `trafficEnabled`, `allowedCountries`, `allowedDevices`, `browserLanguage` — todas checadas server-side e que, se vazadas em cache de borda, permitiriam evasão trivial.
- **Mitigação**:
  - Allowlist explícita `MANIFEST_CONFIG_KEYS` no `src/app/api/embed/[id]/manifest/route.ts`: só aparência/CTA.
  - Regras de tráfego permanecem sob `/api/embed/:id` dinâmico, sem cache.
- Arquivos: `src/app/api/embed/[id]/manifest/route.ts`.

### A10 — Exceptional conditions / fail-open (MEDIUM, mitigado)

- **Problema**: `purgeEmbedManifest` na Vercel falha silenciosamente (intencional), e o Worker falharia aberto em qualquer erro de parse.
- **Mitigação**:
  - Vercel: mantém `void purgeEmbedManifest(...)` (no-op se env vars faltarem → cache expira em 30s).
  - Worker: `handlePurge` **fail-closed** quando secret ausente (503); `handleManifest` não cacheia em corpo inválido.
- Arquivos: `src/lib/cache/embed-purge.ts`, `cloudflare/prisma-embed-cache/src/index.ts`.

### A03 — Supply chain (LOW, mitigado)

- **Problema**: o Worker não tinha `package.json` e dependia de instalação manual implícita.
- **Mitigação**:
  - `cloudflare/prisma-embed-cache/package.json` com dependências fixadas (`^4.20250701.0` para `@cloudflare/workers-types`, `^3.80.0` para `wrangler`).
  - `cloudflare/prisma-embed-cache/.gitignore` exclui `node_modules`, `.wrangler`, `.dev.vars` (segredos locais).
- Arquivos: `cloudflare/prisma-embed-cache/package.json`, `.gitignore`.

### A07 — Authentication failures (LOW, observado)

- O `EMBED_ORIGIN_SECRET` (já existente no projeto) permanece a fonte de verdade para tokens de embed. Manifest não introduz novos vetores de autenticação — usa o secret compartilhado `SHARED_PURGE_SECRET` entre Vercel↔Worker, que *não* deve reutilizar `EMBED_ORIGIN_SECRET` (documentado em `.env.example`).

### Verificação de regressão

- `npx tsc --noEmit` ✅ limpo.
- `npx eslint` nos arquivos modificados ✅ limpo.
- `npm run build` ✅ "Compiled successfully" + 49 páginas estáticas geradas.

### Pendência de segurança (TODO manual)

- [ ] **Rotacionar `SHARED_PURGE_SECRET`** com alta entropia (≥ 32 bytes) — nunca reutilizar entre ambientes.
- [ ] **Restringir rede do Worker** (Cloudflare dashboard): permitir purge apenas de IPs da Vercel (range `198.51.x.x` ou egress da Vercel), se disponível, como camada extra além do secret.
- [ ] **WAF rule**: bloquear `/__purge` vindo de IPs que não sejam a Vercel (defense-in-depth).
