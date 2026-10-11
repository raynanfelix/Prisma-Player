# PRISMA — DISCOVERY REPORT

**Fase 0 — Discovery (análise)** · 08/08/2026 · Baseado em `PRISMA — OPTIMIZATION STATE.md`

> Análise diagnóstica da Prisma Player: **problemas observados**, **hipóteses**,
> **riscos**, **oportunidades**, **custos e gargalos**, **prioridades**. Tudo aqui é
> **read-only** — nenhuma mudança de código foi feita nesta fase.

---

## 1. Problemas observados (por área)

### 1.1 Player / embeds
- **CSP com `'unsafe-inline'` em `script-src`** no `next.config.ts` — documentado, porém amplo; risco de injeção de style/script sem nonce/hash.
- **Player sem ABR/transcoding:** Video.js servindo arquivo original (provável MP4/WebM único). Sem adaptive bitrate multi-rendição → perda de experiência em conexões ruins (comum no Brasil). Concorrentes usam ABR (Vidalytics "dozen formats", Panda "várias qualidades", Cloudflare/Bunny).
- **Identidade de viewer frágil:** `sessionId = crypto.randomUUID()` novo a cada load do embed; dedupe de `progress`/`complete` é só em memória (Set). Entre reloads, atribuição de conversão/eventos de um mesmo visitante é fraca (só `conversion` tem dedupe persistente em localStorage).
- **Sem conhecido anti-download além de R2 privado** — URLs presigned têm validade curta, mas não há DRM/watermark.

### 1.2 Analytics / dados
- **Ingest write-heavy:** eventos (`progress` nos marcos 10/25/50/75/90) fazem POST direto ao Postgres. Dedupe reduziam, mas o write path não usa batching em alta escala.
- **Dashboard analítico parcial:** resumo via `analytics-summarize` (com opção de IA NVIDIA); dependente de `video_live_sessions`/`analytics_events`.
- **Dedupe de conversão por localStorage** é por `playerId:transactionId` (bom), mas atribuição entre sessões depende de `sessionId` volátil.
- **Modelo de custo por play não existe** (diferencial), mas entrega (egress R2/CDN) é um **custo descoberto**.

### 1.3 Pipeline de vídeo
- **Upload multipart S3/R2 custom** está correto (partes 25 MiB, presigned 300s), mas **`tus-js-client` está no package.json como dependência órfã** (0 imports em `src/`) — remover ou adotar.
- **Sem encoding/transcrição/ABR/HLS aparente:** o player serve o arquivo de origem.
- **Anti-pirataria limitada:** R2 privado + presigned curta; sem DRM, sem marca d'água, sem domínios permitidos por policy forte.

### 1.4 Auth & billing
- **Auth real é Supabase e-mail/senha**; docs `auth-and-data-architecture.md` citam Clerk (aspiracional) → **divergência código × doc**.
- **Billing real é AbacatePay (BR)** — sem internacionalização. Webhooks usam `ABACATEPAY_WEBHOOK_SECRET`; revisar idempotência/validação de assinatura.
- Trial de 14 dias (pagina signup) com limites (`TRIAL_STORAGE_GB`).

### 1.5 Infra
- **Observabilidade fraca:** sem alertas de erro sobre `player-pixels`, manifest, loader; só logs Vercel.
- **Cron único diário** (`/api/cron`); rotinas de limpeza de sessões antigas dependem dele.
- **Sem cobrança por banda** → risco de custo quando tráfego escala.

### 1.6 Custo/negócio
- Egress R2/Cloudflare não é estimado. Com plano fixo, **custo unitário é função dos plays** enquanto receita é fixa → margem pode degradar em picos de tráfego pago.

---

## 2. Hipóteses (para a Fase 1 validar com dados)

| # | Hipótese | Como validar na Fase 1 |
| --- | --- | --- |
| H1 | Abandono em mobile/3G é alto por falta de ABR/HLS (rendição única MP4/WebM) | Analisar country/device nos logs Vercel + watch-time no Postgres |
| H2 | Latência de UI do dashboard é puxada por queries agregadas pesadas (Recharts) | Profiling + `EXPLAIN` dos índices de `analytics_events` |
| H3 | Egress (banda) é o maior custo unitário em escala | Planilha de banda R2/Cloudflare por período |
| H4 | Faltam índices em tabelas analíticas → queries lentas conforme os dados crescem | `EXPLAIN ANALYZE` no Supabase; revisão das migrations |
| H5 | Dedupe atual não evita re-escritura de conversão em revisit do embed (sessionId novo) | Teste com ID de viewer persistente/cookie |
| H6 | `tus-js-client` é dependência morta; remoção é segura | `grep` completo por imports (esperado 0) |
| H7 | Docs aspiracionais (Clerk) causam fricção em onboarding/agents | Busca por "Clerk"/"Better Auth" em docs e código |

---

## 3. Riscos

| Risco | Nível | Mitigação proposta (Fase 1+) |
| --- | --- | --- |
| Egress R2/CF escalando sem preço atrelado → custo variável descoberto | **Alto** | Modelar R$/GB × MRR no pricing fixo |
| Player sem ABR degrada retenção em redes móveis | **Alto** | Avaliar ABR (Bunny/Cloudflare Stream/HLS adaptivo) |
| Docs divergentes (Clerk vs Supabase) → decisões erradas em onboarding/agents | Médio | Sincronizar docs com o runtime |
| Ingest `progress` write-heavy direto ao Postgres | Médio-Alto | Batching/buffer + índice adequado ou fila |
| CSP `'unsafe-inline'` em `script-src` | Médio | Tighten com nonce/hash |
| `sessionId` random por load → atribuição fraca | Médio | Persistir viewer token + payload de consentimento |
| CAPI/TikTok tokens em env (documentado) | Baixo | Segredos seguros no Vercel; auditoria de rotação |
| Doc aspiracional vs código | Baixo-Médio | Limpeza na fase de docs |

---

## 4. Oportunidades (mercado — dados públicos 08/2026)

| Concorrente | Posicionamento | O que a Prisma deve fazer |
| --- | --- | --- |
| **VTurb** | Player BR de VSL; planos por plays (Basic R$97/mês 6.000 plays; Pro R$29/mês; $0.02/play extra; trial 14 dias) | **Diferencial defensivo:** pricing fixo (sem cobrança por play) é moeda forte; enfatizar "sem limite de plays". |
| **Panda Video** | Hospedagem BR completa: VSL (Smart Autoplay, progress fake, CTA no pause), DRM/anti-download, IA (tutor/dublagem/Legenda), analytics, bandwidth por faixa (Bronze R$87,90/mês) | Checar se player já tem Smart Autoplay/CTA-no-pause/business; se não, é oportunidade imediata de conversão. |
| **Pluma Vídeo** | Player BR price-fixed anual, otimizado para (não prejudicar o LCP), sem limites | Manter-embeds leves; medir/melhorar LCP dos embeds. |
| **Vidalytics** | Referência internacional de conversão: conversão em vídeo, heatmaps/segmentation, Smart Autoplay, AI Vids (analista), ABR, multi-CS | **Oportunidade-core:** analytics de conversão (onde no vídeo o viewer compra) + "VidsAI" — base atual é `/api/intelligence` (NVIDIA). |
| **Bunny / Cloudflare Stream** | Infra pay-per-use barata (~$0.005–0.01/GB entregue; $5/1k min armazenado; encoding gratis) | Já na stack (R2/CDN); usar encoding/ABR quando adotar F1. |
| **Wistia** | Marketing/analytics, heatmaps/A-B, planos flat | Heatmaps/A-B relevantes para planos superiores. |

### 4.1 Diferenciais que a Prisma já tem
- **Player first-party no domínio do cliente** (loader script + CMP/consentimento);
- **Pixels Meta CAPI + TikTok TTQ server-side** (embrião de oitivo competitivo);
- **Custo fixo** vs VTurb ("palavra por play") → preço previsível para o afiliado;
- **Analytics de conversão ligado no vídeo** (fundação para "VidsAI").

---

## 5. Custos (modelo de negócio)

- **Custo variável por play/GB:** armazenamento R2 + egress CDN (Vercel→CF). Como não há
  cobrança por play ao cliente, custo = f(plays) enquanto receita = f(plano mensal) →
  **margem bruta degrada em picos**.
- **Transcoding (se adotar ABR):** custo de egress adicional + CPU; gate em F1 quando
  volume justificar.
- **Infra de ingest:** Postgres write-heavy; com poucos eventos hoje é barato, mas tende à
  ser gargalo e/ou crescimento de custo de storage conforme dados acumulam.

---

## 6. Gargalos

1. **Postgres write-heavy em `analytics`** — cada marco de progresso faz `INSERT`.
2. **Sem transcoding/ABR** — qualidade para o viewer + volume de banda.
3. **Sem estimativa de custo/banda** — cegueira de margem bruta em escala.
4. **Identificação de viewer frágil** — perda de atribuição e de retenção entre visitas.
5. **Observabilidade fraca** — erros silenciosos em `player-pixels`/manifest/loader/app.
6. **Pricing fixo sem compensação de custo** de banda — risco ao crescimento.

---

## 7. Prioridades sugeridas (pré-Fase 1)

| Prio | Tema | Tipo | Nota |
| --- | --- | --- | --- |
| P0 | **Transcodificação/ABR na entrega** | Otimização perf-mobile | Alto impacto, custo módico quando usar índice RDS |
| P0 | **Estimativa de custo/banda no dashboard (Vídeo×Verba)** | Negócio/ops | Custo baixo, decisão de pricing |
| P1 | **Batching da camada de ingest (`analytics/_events`)** | Perf/custo | Reduz write-amplificação |
| P1 | **Viewer ID persistente + atribuição** | Analytics | Base para heatmap/conversão |
| P2 | **Remover dep `tus-js-client`** | Higiene | Risco ~0 |
| P2 | **Sincronizar docs com runtime** | Docs/dev | Evita decisões erradas |
| P2 | **Observabilidade/alertas** | Ops | Custos e erros silenciosos |
| P3 | **DRM/anti-download/watermark** | Feature | Quando segurança do cliente exigir |
| P3 | **IA de insights do vídeo ("Vid's AI")** | Product | Usa `/api/intelligence` NVIDIA |

> Nota de segurança básica (não é Fase 0, mas não custa): revisar assinatura/idempotência
> do webhook AbacatePay e o CSP como primeiras entregas de Fase 1 se não forem já cobertos.

---

## Anexo A — Fontes consultadas

- `PRISMA — OPTIMIZATION STATE.md` (inventário)
- Código-fonte do runtime (App Router, features, services, lib, supabase, R2)
- `docs/CODEBASE_ARCHITECTURE.md`, `docs/REFACTOR_V2_ARCHITECTURE.md`,
  `docs/REFACTOR_V2_PHASE_2.md`, `docs/SYSTEM_DESIGN_SCALE.md`, `docs/CLOUDFLARE_R2.md`,
  `docs/videojs-integration.md`
- `AUDITORIA_2026-07-29.md`, `mantis-summary.md`
- Pesquisa pública de concorrência (VTurb, Panda Video, Pluma Vídeo, Vidalytics, Bunny,
  Cloudflare Stream, Wistia, JMVStream) em 08/08/2026 — valores de planos são públicos e
  sujeitos a variação.

> **Limite da Fase 0:** todas as sugestões são para a Fase 1; esta fase não alterou código.