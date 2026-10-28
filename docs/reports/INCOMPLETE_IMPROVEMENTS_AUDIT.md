# Auditoria de Incompletos & Melhorias — Prisma Player (2026-10-27)

Análise integral do código buscando **tudo que está incompleto, quebrado ou
merece melhoria** — qualquer natureza. Metodologia: varredura de superfície
(76 rotas, 69 arquivos de teste, schema, CI), conexão com as 3 auditorias
anteriores (escala, segurança externa validada, Superpowers paralela) e os
achados desta sessão de release.

**Estado da suíte no fechamento**: **783/783 passing** — pela primeira vez
100% verde (os 2 "baseline eternos" do route-guards eram falsos: um mock com
a premissa invertida do contrato do SDK, uma rota pública classificada como
guardada; ver A.1/A.2).

---

## A. Corrigido NESTA sessão (contexto dos incompletos)

| Item | O que era |
|---|---|
| A.1 | `tests/route-guards.test.ts` L236: mock do SDK modelava `auth.handler()` como função única, mas o contrato real (@neondatabase/auth `next/server/index.d.mts`: `export const { GET, POST } = auth.handler()`) é **factory que devolve o mapa de métodos**. O teste falhava desde o Front D sem significar bug de produção — o catch-all `/api/auth/[...path]` está correto. Mock corrigido para o mapa. |
| A.2 | L178: `GET /api/ab-tests/[id]` estava na família 401, mas é **pública por design** (sorteio A/B dentro do embed, rate-limited, valida UUIDs antes de tudo). Movida para a família de validação pública (400 invalid_request). |
| A.3 | Fallbacks hardcoded `prisma-player.vercel.app` em sitemap/robots/llms/openapi/layout → `https://app.prismaplayer.online` (5 arquivos). |
| A.4 | `VIDEO_EVENTS_RETENTION_DAYS=180` adicionada na Vercel (production + preview) — fechava o GAP-3 LGPD do launch audit. **Atenção**: requires redeploy para surtir efeito (o cron lê em runtime; production deploy já disparou). |

---

## B. Incompletos REAIS no código (prioridade do dono)

### B1. TODOs de conteúdo pendentes do dono (bloqueiam copy final)
| Arquivo | Pendência |
|---|---|
| `src/content/contact.ts:1` | "TODO(dono): trocar pelo e-mail oficial de contato antes da publicação final." |
| `src/lib/security/inline-scripts.ts:48` | TODO(dono): e-mail oficial de suporte (aparece no JSON-LD da landing) |
| `src/lib/markdown/pages.ts:202` | TODO(dono): e-mail oficial no rodapé Markdown |

Com o domínio novo, o e-mail institucional mudou para `@prismaplayer.online`
(o export DSAR já usa `privacidade@prismaplayer.online`) — decidir e aplicar
nos 3 pontos.

### B2. llms.txt duplicado no app — ✅ RESOLVIDO (27/10)
`public/llms.txt` (estático, marketing) e `public/llms-full.txt` **removidos
do app** — o route dinâmico `src/app/llms.txt/route.ts` (API/produto) ficou
como única superfície e gera o conteúdo inline (nunca leu os estáticos). As
versões de marketing já vivem no repo da landing (`public/llms*.txt`).

### B3. Realtime client morto — ✅ RESOLVIDO (27/10)
`src/lib/realtime/client.ts` **deletado** (arquivo não importado, lia
`NEXT_PUBLIC_NEON_REALTIME_URL` que nunca existiu). O `.env.example` foi
corrigido: documentava a URL pública e a `NEON_REALTIME_URL` (nome que
nenhum código lê) — agora documenta só `NEON_REALTIME_SECRET`, que é o que
o server sela, com nota para recriar o client caso a feature volte. O
server (`realtime/server.ts` + `/api/realtime`) permanece.

### B4. Envs PG* ressuscitadas pela integração Neon↔Vercel
Removi `PGHOST/PGUSER/PGPASSWORD/PGDATABASE/PGHOST_UNPOOLED` de ambos os
ambientes, e a integração **recriou o PGHOST do preview** (2h depois) — o
sync da integração Neon↔Vercel reinjeta as envs do branch database a cada
deploy de preview. Removi novamente. **Recomendação**: desativar o sync de
envs da integração (Vercel → Storage → Neon → manage) ou aceitar o ruído
(não quebra nada — o código só lê `DATABASE_URL`).

### B5. Branches paralelas órfãs no remoto — ✅ RESOLVIDO (27/10)
`posthog/instrumentation-c2f9a8` e `refactor/application-v2` tinham **zero
commits fora da main** (verificado com `git log origin/main..branch` antes
de deletar) — removidas do remoto via `git push origin --delete`. Obsoletas
por definição: a instrumentação PostHog saiu integralmente do produto.

---

## C. Segurança — achados TRUE ainda abertos (da validação da auditoria externa)

Prioridade pós-lançamento, já com mitigação de app-layer:
1. **M1 — escalonamento admin por convite**: convite com papel admin criado
   por admin é aceito pelo titular sem re-confirmação. Correção: exigir
   re-auth/confirm no accept de convites com papel elevado.
2. **M4 — TOCTOU de assentos + catch morto**: race no accept de convite
   contra a cota de assentos.
3. **M10 — nonce CSP quebra dark mode** nas rotas autenticadas (defeito
   confirmado, impacto menor — ThemeScript bloqueado pelo CSP nessas rotas).
4. **C1/C2** (embed wall + token CAPI): mitigados em app-layer; hardening
   definitivo pós-launch (HLS + rotação de tokens).
5. **V2/V4**: dependem do comportamento do Managed Better Auth (monitorar).

---

## D. Escala — o que falta do plano (auditoria de 26/10)

Já entregues: P0-1 (rate limit local), P0-2 (quota cache), P0-3 (teto de
streams + teste real), P1-4 (embed-config cache), P1-5 (pool bounds).

Pendentes:
| Item | Esforço | Ganho |
|---|---|---|
| P1-6 cache de plano no guard (2-3 queries/request autenticado) | 1h + wiring de reset nos testes | −2 queries/req |
| P1-7 `findIngestTarget` serial → Promise.all | 15min | −1 roundtrip/lote |
| P1-8 webhooks outbound sequenciais → concorrência limitada (ou QStash) | 2h | robustez em contas com webhook |
| P2-9 keyset pagination (folders 200, ab-tests 100, roadmap 500, analytics 500, live-logs 500 truncam sem cursor) | 1 dia | contrato honesto p/ contas grandes |
| P2-10 account/export: 17 queries paralelas (maxDuration + streaming) | 2h | DSAR de contas grandes |
| Rate limit local → Upstash shared store quando provisionar (troca 1 linha/call site) | 0.5d | precisão cross-instance |
| HLS (m3u8) — hoje MP4 progressivo: cada range request revalida tudo no server | projeto | −80% de carga no hot path |

---

## E. Cobertura de testes — 13 rotas P1/P2 ainda sem guard test
(da matriz D4): `admin/search`, `admin/seo/targets`, `dashboard-security`,
`cron` (secret gate), `account/profile`, `analytics/[videoId]/live-logs`
(SSE), `integrations/telegram-verify`, `player-loader/[id]`, `llms.txt`,
`auth/callback`, `support/notes` + confirmação de que as rotas movidas para
a família pública (ab-tests/[id]) têm teste próprio agora ✓.

---

## F. Config/infra pendentes DO DONO (CLI não alcança)
1. **Neon Console → Auth**: trusted origins `https://app.prismaplayer.online`
   (e apex) — urgente para login/callback no domínio novo.
2. **Google OAuth Console**: redirect URI
   `https://app.prismaplayer.online/api/auth/callback`.
3. **Stripe Dashboard**: endpoint de webhook
   `https://app.prismaplayer.online/api/webhooks/stripe` + Payment method
   domains (Link) para o domínio novo.
4. Tabelas extras em produção: `realtime_test` (resíduo — remover) e
   `support_notes` (origem desconhecida — investigar).

---

## G. Melhorias de qualidade (backlog saudável)
1. **ESLint baseline → error**: regra do repo é promover quando a contagem
   própria chega a zero — os fixes desta semana zeraram console direto nos
   arquivos tocados; rodar o inventário e promover o que zerar.
2. **knip**: 45 unused exports + config hints (KanbanOverlay/
   RoadmapTaskInput são da frente kanban — não tocar sem ela).
3. **OpenAPI**: documentar que os fluxos de cobrança são safe-to-retry e
   que o webhook é idempotente por `providerEventId` (contrato explícito).
4. **`vercel.json`**: avaliar `Attack Challenge Mode` sob demanda no dia do
   lançamento (o Security Checkpoint já respondeu 429 a clientes bot no meu
   teste — comportamento esperado, não bug).
5. **Monorepo de landing**: quando o repo separado for criado, registrar os
   2 repos no `docs/setup.md` e no CI (verify.yml cobre só o app).
6. **account/delete + stripe cancel**: mensagens já genéricas ✓; adicionar
   telemetria de falha de cancelamento (alertOperations já existe ✓ — ok).

---

## Veredito

**Lançamento 27/10: PRONTO.** Nenhum bloqueante novo. Os incompletos são:
conteúdo pendente do dono (B1), decisões de produto (B3, B5), config de
painel (F) e backlog pós-lançamento priorizado (C/D/E). A suíte está 100%
verde pela primeira vez (783 testes), tsc 0, quality gates 3/3.
