# PRISMA — PRIORITIZED ROADMAP

**Fase 0 · Discovery (plano)** · 08/08/2026 · Baseado no `PRISMA — DISCOVERY REPORT.md`

> Roadmap priorizado de recomendações para Fases 1–3. Cada item tem impacto, esforço,
> dependência e critério de saída. **Nada aqui foi implementado** — a Fase 0 é
> estritamente read-only e este roadmap é **proposta para aprovação**.

---

## Princípios

1. **Baseline primeiro** — validar as hipóteses H1–H7 (Discovery) com dados reais antes de mudar código.
2. **Migrations imutáveis** — toda mudança de schema entra como migration nova.
3. **Impacto > esforço** — priorizar retenção/conversão/margem.
4. **Respeitar a stack atual** (Vercel + Supabase + R2/Cloudflare) — sem refactor destrutivo.
5. **Zero mudança de código enquanto esta Fase 0 não for aprovada.**

---

## P0 — Fundações (Fase 1)

| # | Item | Impacto | Esforço | Deps | Critério de saída |
| --- | --- | --- | --- | --- | --- |

| R0.1 | **Revisar segurança do webhook de billing** (assinatura AbacatePay, idempotência, replay) | Crítico (fraude) | M (2–3d) | — | Payload inválido → 4xx; duplicado → processa só 1ª |
| R0.2 | **Estimador de custo/banda no dashboard** (egress R2/CDN por mês) | Alto (margem) | M (3–5d) | — | Dashboard mostra R$/GB e tendência 30/90d |
| R0.3 | **Review de índices analíticos** (`EXPLAIN ANALYZE` em `analytics_events`, `video_live_sessions`) | Médio | M (2–4d) | — | Queries < 200ms em 30d |
| R0.4 | **Tighten do CSP** — reduzir `'unsafe-inline'` de `script-src` com nonce/hash | Alto (segurança) | M (2–5d) | Teste embeds | Embeds continuam funcionando |

## P1 — Otimização (Fase 1/2)

| # | Item | Impacto | Esforço | Deps | Critério de saída |
| --- | --- | --- | --- | --- | --- |
| R1.1 | **Batching da ingestão analítica** (buffer de eventos → insert em lote) | Médio-alto (custo/perf) | M (3–4d) | — | Insert/s reduzidos; dashboard fluido |
| R1.2 | **Viewer ID persistente** (cookie/localStorage) p/ atribuição entre visitas | Alto (analytics) | M–A (3–6d) | R0.3 | Mesmo viewer mantém identidade/atribuição |
| R1.3 | **Transcoding/ABR/HLS** — múltiplas rendições (Bunny/Cloudflare ou próprio) | Alto (mobile) | A (5–10d) | R0.2/R0.3 | Player bom em 3G; retenção móvel sobe |
| R1.4 | **Docs sync ao runtime** (Clerk→Supabase real) | Baixo-médio | S–M (2–3d) | — | Docs sem menção aspiracional não rotulada |

## P2 — Resiliência e higiene (Fase 2)

| # | Item | Impacto | Esforço | Deps | Critério |
| --- | --- | --- | --- | --- | --- |
| R2.1 | **Remover `tus-js-client`** (dep órfã) | Baixa (higiene) | S (0,5d) | H6 = 0 imports | Lockfile limpo; `tsc` verde |
| R2.2 | **Observabilidade e alertas** (`player-pixels`, manifest, loader, cron) | Alto (ops) | M (3–5d) | — | Alerta em falha; 5xx rastreáveis |
| R2.3 | **Retenção em `video_live_sessions`** no cron (expirar dados antigos) | Baixo (custo) | S (0,5–1d) | R0.1 | Dados > N dias limpos |
| R2.4 | **Anti-download/watermark** (marca d'água opcional) | Médio (produto) | A (5–10d) | R1.3 | Disponível para Premium |

## P3 — Produto e diferenciação (Fase 3+)

| # | Item | Impacto | Esforço | Deps | Critério |
| --- | --- | --- | --- | --- | --- |
| R3.1 | **Smart Autoplay + CTA-no-pause** (paridade Panda/VTurb) | Conversão | M | player estável | Entrega + teste A/B |
| R3.2 | **IA de insights ("VidsAI")** usando `/api/intelligence` (NVIDIA) | Conversão/diferencial | M (5–10d) | R1.2, analytics | Insights automáticos por vídeo |
| R3.3 | **Heatmap/A-B de conversão** | Produto | M | R1.2, batching | Heatmap de `cta_click`/`conversion` por seg |
| R3.4 | **Pricing por faixa de plays** (validação) | Negócio | M (estudo) | R0.2 | Margem bruta viável documentada |

---

## Sequência recomendada

```
Fase 1 → R0.1 → R0.2 → R0.3 → R0.4
Fase 2 → R1.1 → R1.2 → R1.3 → R1.4
Fase 3 → R2.1 → R2.2 → R2.3 → R2.4
Fase 4 → R3.1 → R3.2 → R3.3 → R3.4
```

## Justificativa da ordem de priorização

- **R0.1 (billing) vem antes de tudo**: replay/fraude de webhook atinge receita e segurança diretamente.
- **R0.2 (medição de banda) precede R1.3 (ABR)**: ABR só compensa se o egress for o custo dominante — medir antes.
- **R1.2 (viewer ID) é pré-requisito de R3.2/R3.3**: sem atribuição persistente, "VidsAI" e heatmap perdem o fundamento.
- **R2.4 (anti-download/watermark) é Premium**: não bloqueia MVP; entra junto com ABR.

## Aprovação

Revisar e aprovar o roadmap junto do Discovery Report antes de abrir a Fase 1. Reestimar
HPEs com dados reais na Fase 1.