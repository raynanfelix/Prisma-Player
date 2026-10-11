# Auditoria Técnica — Prisma Player (29/07/2026)

Base: código real do repositório na branch `main` (commit `155b02a`). Tudo abaixo tem arquivo e linha.
Onde não deu para confirmar só lendo código, está marcado `NÃO FOI POSSÍVEL CONFIRMAR PELO CÓDIGO`.

---

## A. RESUMO EXECUTIVO

O Prisma Player é um SaaS de player de VSL com embed, analytics, testes A/B, equipe, créditos de IA
e cobrança via AbacatePay. O código é **acima da média** em higiene de segurança de infraestrutura:
tem CSRF por origem, rate limit atômico no banco, tokens HMAC para embed, guarda de SSRF em webhooks,
RLS com policies de ownership, idempotência atômica no webhook de pagamento e chaves de serviço
isoladas com `server-only`. Isso não é comum em projetos deste porte.

O problema não está na "camada de segurança" — está na **camada de negócio**.

Os três riscos maiores são:

1. **O paywall não existe no servidor.** O bloqueio de trial/assinatura é feito por um componente
   React (`AccessGate`) que roda no navegador. Nenhuma rota de API verifica se o usuário tem acesso
   pago. Qualquer pessoa com trial vencido continua usando o produto inteiro chamando as APIs
   diretamente — ou simplesmente com o DevTools aberto.
2. **Nenhum limite de plano é aplicado.** `storage_gb`, `included_plays`, `prisma_ai_analyses` existem
   na tabela `billing_plans` e são apenas *exibidos*. Só `team_seats` é realmente verificado. Um usuário
   do plano mais barato pode subir 20 GB por vídeo, sem teto, e você paga o R2.
3. **Uma credencial real está commitada no Git** (`BETTER_AUTH_API_KEY` em `.env.example`, commit
   `bcf9f5e`). Apagar o arquivo não resolve — precisa ser revogada.

Há ainda um bug silencioso que enfraquece o rate limit público do embed em 60×, uma brecha de leitura
cross-tenant no bucket de assets, e problemas de escala em analytics que aparecem por volta de alguns
milhares de eventos por vídeo.

Maturidade geral: **protótipo avançado bem construído, não pronto para produção paga**. A engenharia
está boa; o que falta é fechar o negócio (paywall, quotas), observabilidade e testes.

**Pontos genuinamente corretos** (não são elogio vazio, são decisões que evitaram bugs reais):
- `src/lib/supabase/admin.ts` com `import "server-only"` — a service key não pode vazar para o browser.
- Chaves de FK compostas em `supabase/migrations/20260715220249_prisma_production_core.sql`
  (`videos.folder_id,user_id → video_folders.id,user_id`) impedem no banco o IDOR de mover vídeo para
  pasta alheia, mesmo com a rota PATCH não validando isso.
- `consume_rate_limit` (RPC) elimina a race condition do padrão read-then-update.
- O claim atômico `pending/failed → processing` no webhook da AbacatePay é a forma certa de idempotência.
- `requireAdmin()` exige AAL2 (MFA) — muita gente esquece disso.

---

## B. STACK ATUAL

| Camada | Tecnologia |
|---|---|
| Framework | Next.js **16.2.10**, App Router, React **19.2.4** |
| Runtime | Node.js (Vercel serverless). Webhook fixa `runtime = "nodejs"` |
| Linguagem | TypeScript 5, `strict: true`, target ES2017 |
| Banco | Supabase / PostgreSQL, 24 migrations |
| Acesso a dados | `@supabase/supabase-js` + `@supabase/ssr` (sem ORM) |
| Auth | Supabase Auth (email/senha), cookies via `@supabase/ssr` |
| Autorização | Manual em cada rota + `getTeamAccountContext` (RBAC de 5 papéis) + RLS como rede de segurança |
| Storage | Cloudflare R2 (principal, via AWS SDK S3) + Supabase Storage (fallback/assets) |
| Pagamentos | AbacatePay (PIX + cartão recorrente) |
| E-mail | Resend (`RESEND_API_KEY`) |
| IA | NVIDIA NIM (`src/lib/ai/nvidia.ts`) |
| Analytics/Obs. | PostHog (client + node), proxy `/ingest` |
| Cache de borda | Cloudflare Worker (`cloudflare/prisma-embed-cache`) |
| Jobs | Vercel Cron, 1×/dia (`vercel.json` → `/api/cron`) |
| Deploy | Vercel |
| UI | Tailwind v4, shadcn, Base UI, Motion, Recharts, visx, video.js |
| Testes | **nenhum** |
| CI | **nenhum** (não há `.github/workflows`) |

---

## C. ARQUITETURA ATUAL

```
Navegador ──► Next.js App Router (Vercel)
              ├─ proxy.ts (ex-middleware) → updateSession → redirect /login
              ├─ Server Components (dashboard, admin) → createAdminClient (service role)
              ├─ Route Handlers /api/*          → createAdminClient (service role)
              └─ Client Components ("use client", 133 de 188 .tsx)
                        │ fetch
                        ▼
Site do cliente ─► <script /api/player-loader/:id> ─► <iframe /embed/:id>
                        │
                        ├─ GET /api/embed/:id/manifest  (cacheável na CDN, config pública)
                        ├─ GET /api/embed/:id           (dinâmico: domínio, país, device, URL assinada)
                        └─ POST /api/analytics-events   (exige eventToken HMAC)

AbacatePay ─► POST /api/webhooks/abacatepay ─► subscriptions / ai_credit_wallets
Vercel Cron ─► GET /api/cron ─► relatórios, alertas, limpeza de sessões
```

Ponto arquitetural central: **quase tudo usa a service role key** (`createAdminClient`), que ignora a
RLS. Isso é uma escolha legítima (permite o modelo de equipe, onde o membro lê dados do dono), mas
significa que **a RLS não protege nada em produção** — cada `.eq("user_id", account.accountOwnerId)`
esquecido é um vazamento completo. Auditei todas as 37 rotas: os filtros de ownership estão presentes
(bom), com as exceções listadas na seção E.

Exceções que usam o cliente com RLS: `/api/ab-tests` e `/api/ab-tests/[id]` DELETE — inconsistente com
o resto, e por isso testes A/B **não funcionam para membros de equipe** (a RLS filtra por `auth.uid()`,
não pelo dono da conta).

---

## D. MAPA FRONTEND / BACKEND

| Zona | O que é | Onde está hoje | Situação |
|---|---|---|---|
| **CLIENT** | Player, studio, gráficos, formulários | `src/features/*`, `src/components/*` | OK. Nenhum secret vaza. |
| **SERVER** | Rotas de API, Server Components, `src/lib/*` | `src/app/api/*`, `src/lib/*` | OK. `server-only` em admin/team-context/access. |
| **SHARED** | Tipos, constantes, i18n, catálogo de planos | `src/lib/constants.ts`, `src/i18n` | OK. |
| **DATABASE** | 24 migrations, RLS, RPCs | `supabase/migrations` | OK, mas RLS é decorativa (ver C). |
| **INFRA** | Headers/CSP, cron, Worker | `next.config.ts`, `vercel.json`, `cloudflare/` | OK, exceto CSP `unsafe-inline`. |

**Só existe uma variável `NEXT_PUBLIC_*` usada em código de cliente** além das do Supabase e PostHog.
As chaves publicáveis do Supabase (`sb_publishable_*`) **podem** ficar no browser por definição — é o
comportamento correto. `SUPABASE_SECRET_KEY`, `CLOUDFLARE_R2_*`, `ABACATEPAY_*`, `NVIDIA_API_KEY`,
`EMBED_ORIGIN_SECRET`, `CRON_SECRET`, `RESEND_API_KEY` **nunca** podem — e hoje nenhuma está exposta.
Essa parte está certa.

**A reorganização de pastas que você cogitou (`frontend/` + `backend/`) não deve ser feita.** Em
Next.js App Router a fronteira não é a pasta, é a diretiva `"use client"` e o `import "server-only"`.
Separar em duas pastas dá falsa sensação de segurança e quebra o roteamento. A estrutura atual
(`app/` + `features/` + `lib/` + `components/`) está adequada. As únicas mudanças de pasta que
recomendo estão na seção H.

---

## E. SEGURANÇA

### 🔴 SEC-01 — Paywall inexistente no servidor
- **Categoria:** Broken Access Control / Business Logic
- **Arquivo:** `src/features/access/components/AccessGate.tsx:1-40`; ausência em todas as rotas `/api`
- **Problema:** o controle de trial/assinatura é 100% client-side. `getAccountAccess()` só é chamado
  em `/api/account/access`, `/api/account/overview`, `dashboard/billing/page.tsx` e `welcome/page.tsx`
  — todos leitura. Nenhuma rota de escrita ou de dado valioso o consulta.
- **Impacto:** trial vencido = produto liberado para sempre. Upload, publicação, embed, analytics,
  A/B: tudo continua respondendo 200. Receita perdida direta.
- **Como verificar:** deixe uma conta com `account_access.trial_status='expired'` e sem assinatura,
  então `curl -b <cookies> https://seusite/api/videos` e `POST /api/player-configs`. Ambos funcionam.
- **Correção:** criar `requirePaidAccess(userId)` em `src/lib/access/service.ts` que retorna 402 e
  chamá-la em toda rota de escrita e em `/api/embed/:id` (bloquear a entrega do vídeo, não só o
  dashboard — senão o cliente cancela e continua servindo VSL). Manter `/api/billing/*`,
  `/api/account/*` e `/api/videos` GET liberados para o usuário poder pagar e exportar.
- **Prioridade:** 1

### 🔴 SEC-02 — Credencial real commitada no Git
- **Arquivo:** `.env.example:7` — `BETTER_AUTH_API_KEY=ba_lod1zw2bebn316k9o2l1ris3hhfwg4hy`
- **Histórico:** introduzida no commit `bcf9f5e` ("feat: migração inicial para Better Auth").
- **Impacto:** a chave está no histórico do Git para sempre. Se o repositório for/ficar público, ou
  se qualquer colaborador clonar, ela está exposta. O Better Auth foi revertido (commit `155b02a`),
  então a chave provavelmente está órfã — mas isso precisa ser confirmado no painel do provedor.
- **Correção:** **revogar a chave no provedor Better Auth agora**, depois limpar o valor do
  `.env.example` (deixar `BETTER_AUTH_API_KEY=` vazio ou remover a seção inteira, já que Better Auth
  foi revertido). Reescrever histórico (`git filter-repo`) só se o repo for público.
- **Prioridade:** 1

### 🔴 SEC-03 — Nenhum limite de plano é aplicado
- **Arquivos:** `src/app/api/videos/route.ts:63-66` (só limita tamanho por arquivo, 20 GB default);
  `src/app/api/ai/analyze/route.ts:12-13` (limites fixos 3/10min e 30/dia, **iguais para todos os planos**)
- **Problema:** `billing_plans.storage_gb`, `included_plays` e `prisma_ai_analyses` só aparecem em
  `/api/account/overview` para exibição. Nada bloqueia.
- **Impacto:** custo de R2 e egress ilimitado por usuário. Um único usuário mal-intencionado no plano
  mais barato pode gerar milhares de reais em armazenamento e banda.
- **Correção:** antes de `POST /api/videos` e de `action:"create"` no multipart, somar
  `sum(size_bytes)` do dono e comparar com `plan.storage_gb`. Aplicar `included_plays` como corte
  suave (alerta) ou duro (bloquear embed) — decisão de produto.
- **Prioridade:** 1

### 🟠 SEC-04 — Recursos pagos liberados sem plano
- **Arquivo:** `src/app/api/intelligence/controls/route.ts:29-50`
- **Problema:** o `PATCH` busca `plan` via `context()` mas **nunca o usa**. Qualquer usuário
  autenticado ativa `outgoing_webhooks_enabled`, `automatic_reports_enabled`,
  `conversion_alerts_enabled` e `audience_sync_enabled` — todos exclusivos de Growth/Scale conforme
  `20260717200000_account_teams_and_plan_capabilities.sql:12-18`. O `/api/cron` também não confere o
  plano antes de disparar relatório/alerta.
- **Impacto:** funcionalidade paga entregue de graça + custo de e-mail (Resend) e de fetch externo.
- **Bônus:** a rota também não usa `getTeamAccountContext` — um membro `viewer` altera as
  configurações de inteligência do dono, e as grava em `user_id = <viewer>` em vez do dono, o que
  cria configuração fantasma que o dono nunca vê.
- **Correção:** validar `plan.outgoing_webhooks` etc. no PATCH e no cron; usar `accountOwnerId` e
  exigir `canManageAccount`.
- **Prioridade:** 2

### 🟠 SEC-05 — Rate limit dos embeds 60× mais fraco que o pretendido
- **Arquivos:** `src/app/api/embed/[id]/route.ts:9` e `src/app/api/embed/[id]/manifest/route.ts:8`
- **Código:** `Number(process.env.EMBED_CONFIG_RATE_LIMIT_WINDOW_MS ?? "60_000")`
- **Problema:** `Number("60_000")` é **NaN** — separador numérico só vale em literais, não em strings.
  O NaN vira `null` no JSON enviado ao RPC; no Postgres, `greatest(null, 1000)` retorna `1000`, então
  a janela vira **1 segundo** em vez de 60.
- **Impacto:** o limite efetivo é 300 req/**segundo** por player, não 300/minuto. A proteção
  anti-scraping e anti-custo dos endpoints públicos está praticamente desligada.
- **Como verificar:** `node -e 'console.log(Number("60_000"))'` → `NaN`.
- **Correção:** trocar por `?? "60000"` (ou `?? 60_000` sem aspas). Verificar todos os
  `Number(process.env...)` do projeto.
- **Prioridade:** 2

### 🟠 SEC-06 — Leitura cross-tenant no bucket `player-assets`
- **Arquivo:** `src/app/api/embed/[id]/route.ts:79-86`
- **Problema:** o endpoint assina **qualquer** caminho presente em `config.assets`, sem verificar o
  prefixo do dono. O `config` é gravado livremente pelo usuário em
  `src/app/api/player-configs/route.ts:35-48` (nenhuma validação de `assets`). A rota irmã
  `/api/studio/asset-sign` **faz** essa verificação de prefixo (`asset-sign/route.ts:28-30`), o que
  mostra que a proteção foi pensada e esquecida aqui.
- **Impacto:** um usuário grava `config.assets = { thumbnailStart: "<uuid-de-outro>/<video>/x.png" }`,
  abre o próprio embed e recebe uma URL assinada de 900s para o arquivo alheio.
- **Atenuante:** o caminho contém um UUID aleatório (`asset-upload/route.ts:41`), então não é
  adivinhável. Exploração exige o caminho vazado por outra via. Classifico como **ALTO, não crítico**.
- **Correção:** aplicar o mesmo filtro `path.startsWith(`${video.user_id}/`)` no embed, e validar
  `config.assets` no `PUT /api/player-configs` (chaves em `ALLOWED_KINDS`, prefixo do dono).
- **Prioridade:** 2

### 🟠 SEC-07 — Convite de equipe: adesão sem consentimento + enumeração de e-mail
- **Arquivo:** `src/app/api/account/team/route.ts:54-59`
- **Problema:** se o e-mail convidado já tem conta Prisma, o usuário é inserido como membro **ativo**
  imediatamente, sem convite, sem aceite, sem notificação. E a resposta diferencia
  `{joined:true}` de `{invited:true}`.
- **Impacto:** (a) oráculo de enumeração — descobre quais e-mails têm conta na plataforma;
  (b) o `GET /api/account/team` seguinte devolve `email`, `full_name` e `avatar_url` do perfil da
  vítima para o atacante (`team/route.ts:29-31`) — vazamento de PII, relevante para LGPD;
  (c) a vítima passa a constar em uma equipe que não escolheu.
- **Atenuante:** não há tomada de conta. `getTeamAccountContext` ordena por `joined_at`, e a equipe
  própria da vítima foi criada antes, então o contexto dela não muda. Ver porém SEC-08.
- **Correção:** criar sempre um convite pendente com aceite explícito, mesmo para usuário existente;
  responder sempre `{invited:true}`; só expor perfil de membros que aceitaram.
- **Prioridade:** 2

### 🟡 SEC-08 — Desempate indefinido no contexto de equipe
- **Arquivo:** `src/lib/access/team-context.ts:17-23` — `.order("joined_at").limit(1)`
- **Problema:** o trigger `handle_prisma_team_created`
  (`20260717200000_...sql:93-107`) cria, **na mesma transação**, a equipe própria do usuário e as
  adesões vindas de convites pendentes. `now()` é constante dentro da transação, então os dois
  registros têm `joined_at` idêntico e a ordenação não tem desempate.
- **Impacto:** um usuário que foi convidado *antes* de se cadastrar pode receber, de forma não
  determinística, `accountOwnerId` = dono do convidante. Ele veria e editaria o conteúdo do
  convidante em vez do próprio. Depende do plano de execução do Postgres.
- **Status:** `POTENCIAL — REQUER CONFIRMAÇÃO` (o comportamento real depende do planner; validar com
  um cadastro real vindo de convite).
- **Correção:** ordenar por `case when role='owner' then 0 else 1 end, joined_at, id`, ou buscar
  primeiro a equipe onde `owner_id = userId`.
- **Prioridade:** 3

### 🟡 SEC-09 — CSP com `script-src 'unsafe-inline'`
- **Arquivo:** `next.config.ts:11-15`
- O comentário no arquivo é honesto sobre o motivo (bootstrap de tema, JSON-LD, payload do Next).
  Ainda assim, `unsafe-inline` remove a principal defesa da CSP contra XSS. Como não achei nenhum
  sink de XSS explorável (ver seção abaixo), o risco hoje é baixo — mas é a rede de segurança que
  você quer ter caso um sink apareça.
- **Correção:** nonce por requisição gerado no `proxy.ts` e propagado. Trabalho médio.
- **Prioridade:** 4

### 🟡 SEC-10 — Domínio do manifest checado por comparação exata e via Referer
- **Arquivo:** `src/app/api/embed/[id]/manifest/route.ts:62-64`
- Usa `domains.includes(host)` enquanto o endpoint dinâmico usa `domainAllowed()`, que normaliza
  `www.`, `https://` e curinga `*.`. Dois efeitos: (a) domínios cadastrados como `https://site.com` ou
  `*.site.com` **bloqueiam clientes legítimos** no manifest; (b) a checagem depende só do `Referer`,
  que é forjável — mas como o manifest só expõe chaves cosméticas allowlistadas
  (`MANIFEST_CONFIG_KEYS`), o impacto é baixo e foi conscientemente projetado assim.
- **Correção:** usar `domainAllowed()` também aqui.
- **Prioridade:** 4

### ⚪ Vetores testados e **não** encontrados (evidência do que está certo)
- **SQL injection:** nenhum SQL concatenado. Tudo via PostgREST/RPC parametrizado. Limpo.
- **XSS:** 3 usos de `dangerouslySetInnerHTML` — `layout.tsx:74` (JSON-LD estático),
  `ThemeScript.tsx:4` (script fixo), `ui/chart.tsx:95` (CSS de cores derivado de config interna).
  Nenhum recebe input de usuário. `ctaUrl` é filtrado para `https?://` em
  `EmbedPlayer.tsx:255` — bloqueia `javascript:`. Correto.
- **SSRF:** `src/lib/webhooks/delivery.ts:17-23` resolve DNS, bloqueia faixas privadas/loopback/
  link-local/CGNAT, exige HTTPS, rejeita porta customizada, credenciais na URL e `redirect: "error"`.
  Muito bem feito. Resta apenas a janela teórica de DNS rebinding entre `lookup()` e `fetch()`.
- **CSRF:** `csrfGuard` aplicado em todas as rotas mutantes que verifiquei. Correto.
- **Path traversal:** `normalizeObjectPath` (`videos/route.ts:9-16`) e o caminho montado no servidor
  em `asset-upload/route.ts:41` bloqueiam. Correto.
- **Assinatura de webhook de pagamento:** HMAC + `timingSafeEqual`, dupla codificação, claim atômico
  contra replay. Correto.
- **Escalação para admin:** `role` vem de `app_metadata` (não editável pelo usuário) e exige AAL2.
  Correto.
- **IDOR direto:** todas as rotas filtram por `accountOwnerId`. Testei mentalmente troca de ID em
  URL e body em videos, folders, player-configs, analytics, ab-tests, billing — bloqueado.

---

## F. BUGS

| ID | Sev | Arquivo:linha | Bug |
|---|---|---|---|
| BUG-01 | 🟠 | `embed/[id]/route.ts:9`, `manifest/route.ts:8` | `Number("60_000")` = NaN (ver SEC-05) |
| BUG-02 | 🟠 | `videos/route.ts:60` vs `:77` | `objectPath` exige prefixo `userId`, mas a linha é gravada com `accountOwnerId`. Membro de equipe grava arquivo em `<memberId>/...` numa linha que pertence a `<ownerId>/`. O DELETE (`videos/[id]/route.ts:59`) só remove assets com prefixo do dono → **lixo permanente no storage, com custo**. O mesmo em `duplicate/route.ts:20` (usa `userId`). |
| BUG-03 | 🟠 | `ab-tests/route.ts:9-13` | Usa cliente com RLS (`createClient`) enquanto todo o resto usa admin + `accountOwnerId`. Consequência: **testes A/B não funcionam para membros de equipe** — eles veem lista vazia. Mesma coisa no DELETE (`ab-tests/[id]:32-33`). |
| BUG-04 | 🟡 | `videos/[id]/route.ts:23` | PATCH aceita `folderId` sem validar propriedade (o POST valida, em `videos/route.ts:73-76`). Salvo pela FK composta no banco, então o efeito real é um 400 genérico `video_update_failed` em vez de `folder_not_found`. Inconsistência de validação, não brecha. |
| BUG-05 | 🟡 | `videos/[id]/route.ts:32` | Na transição para `ready`, valida a existência do arquivo com `supabase.storage.from("videos").list(...)` — **sempre no Supabase Storage**, mesmo quando `storage_provider === "r2"`. Vídeos em R2 (o caminho padrão) falham com `uploaded_file_not_found` nessa rota. O fluxo multipart não passa por aqui, então provavelmente está mascarado. |
| BUG-06 | 🟡 | `analytics-events/route.ts:38` | Confia em `content-length` para o limite de payload; um cliente com `Transfer-Encoding: chunked` não envia esse header e escapa do teto. Mesmo padrão em `ab-events:12` e `ai/analyze:25`. |
| BUG-07 | 🟡 | `cron/route.ts:75` | A limpeza de `video_live_sessions` fica **fora** do try/catch por usuário mas **depois** do laço — se o laço estourar o tempo limite da função, a limpeza nunca roda e a tabela cresce indefinidamente. |
| BUG-08 | 🟡 | `ai/analyze/route.ts:113-128` | O crédito é debitado **depois** da chamada à NVIDIA e a marcação de `completed` vai para `after()`. Se o débito falhar, o `catch` marca o job como falho — mas a análise já foi paga por você à NVIDIA e não é entregue. Inversão de risco (o comentário assume o contrário). |
| BUG-09 | 🔵 | `intelligence/controls/route.ts:37,40,45` | `if (frequencies.has(String(body.reportFrequency)))` — sem `"campo" in body`, um PATCH parcial silenciosamente ignora valores inválidos em vez de retornar 400. O usuário acha que salvou. |
| BUG-10 | 🔵 | `lib/security/csrf.ts:32` | `allowed.add(currentOrigin)` **muta o cache de módulo** a cada requisição. Em serverless com reuso de instância, o Set cresce com todo host que já respondeu (incluindo previews da Vercel). Não é brecha (só aceita a própria origem), mas é um vazamento de memória lento e um efeito colateral escondido. |
| BUG-11 | 🔵 | `player-loader/[id]/route.ts:5` | Regex `/^[0-9a-f-]{36}$/i` aceita `------...` (36 hífens) como ID válido. Sem impacto prático — a query seguinte não acha nada. Mesmo padrão em `ab-tests/[id]:12`. |
| BUG-12 | 🔵 | `analytics/[videoId]/route.ts:60` | `days` aceita até 3650, mas o `.limit(50000)` corta silenciosamente: para vídeos com volume, o dashboard mostra números **errados** (truncados) sem qualquer aviso. O mesmo em `ai/analyze:80`. |

**Não encontrei:** memory leaks em listeners/timers (os `useEffect` que verifiquei têm cleanup),
subscriptions Supabase Realtime pendentes (não há), nem hydration mismatch óbvio (`ThemeScript` usa a
técnica correta de script bloqueante).

---

## G. CÓDIGO MORTO

**Seguro para remover** (confirmado por busca de import real, não só por nome):

| Item | Evidência |
|---|---|
| dependência `pg` + `@types/pg` | 0 imports em `src/`. Sobra da tentativa Better Auth. |
| dependência `@supabase/server` | 0 imports. Pacote sequer é o oficial do Supabase. |
| dependência `shaders` | 0 imports. |
| `scripts/apply-better-auth-migration.sql` | Better Auth revertido em `155b02a`. |
| `supabase/migrations/20260127000000_better_auth_tables.sql` | Cria tabelas `better_auth_*` que nenhum código lê. **Atenção:** se já foi aplicada em produção, não basta apagar o arquivo — precisa de uma migration de `drop`. |
| `docs/MIGRACAO_BETTER_AUTH.md`, `docs/QUICK_START_BETTER_AUTH.md` | Documentam arquitetura revertida — pior que inútil, é enganoso. |
| `final_audit_report.md` (raiz) | Relatório antigo versionado. |
| bloco Better Auth em `.env.example:1-13` | Inclui a chave vazada (SEC-02). |

**Precisa de confirmação** (não removi nada, só sinalizo):
- `src/lib/supabase/auth-errors.ts:33-37` — `oauthEnabled()` referencia
  `NEXT_PUBLIC_SUPABASE_GOOGLE_ENABLED`/`APPLE_ENABLED`, que **não existem** em `.env.example`.
  O Google OAuth foi removido em `315413c`. A função sempre retorna `false`.
- `src/components/dashboard.tsx`, `dashboard-skeleton.tsx`, `custom-trigger.tsx`,
  `custom-sidebar-trigger.tsx` — nomes que sugerem duplicação com `src/components/dashboard/*`.
  Requer verificação de import antes de mexer.
- `.env.local` contém `BETTER_AUTH_*` e `DATABASE_URL` e **não contém** `SUPABASE_SECRET_KEY`,
  `EMBED_ORIGIN_SECRET`, `CLOUDFLARE_R2_*`. Ou seja: **o ambiente de desenvolvimento local está
  quebrado** — qualquer rota que chame `createAdminClient()` lança exceção. Não é código morto, é
  configuração morta, mas vale a mesma limpeza.

**Não classifiquei como morto** os 60+ arquivos em `src/components/charts/` — são um design system de
gráficos coeso, usados via barrel `charts/index.ts` e por `AnalyticsWorkspace.tsx`. Uma varredura
ingênua acusaria vários; não são.

---

## H. ARQUITETURA — problemas estruturais

1. **Service role como padrão.** Já explicado na seção C. Não recomendo reverter (o modelo de equipe
   depende disso), mas recomendo **centralizar**: hoje cada rota repete
   `getCurrentUserId` → `getTeamAccountContext` → `csrfGuard` → `createAdminClient`. Um helper
   `withAuthenticatedAccount(handler, { requireRole, requirePaidAccess })` eliminaria a categoria
   inteira de bugs "esqueci de checar" — que é exatamente a origem de SEC-04 e BUG-03.

2. **`src/features/` e `src/components/` se sobrepõem.** `dashboard/` existe nos dois lugares.
   Escolher um: `features/<domínio>/components` para o que é de domínio, `components/ui` para o
   design system puro.

3. **133 de 188 arquivos `.tsx` são `"use client"` (71%).** Muito disso é inevitável (player,
   estúdio, gráficos interativos). Mas páginas como `dashboard/videos`, `dashboard/analytics` e
   `dashboard/conversions` poderiam buscar os dados como Server Component e passar para uma ilha
   cliente menor, eliminando o waterfall `render → useEffect → fetch → render`. Ganho real de LCP.

4. **Falta uma camada de serviço.** A lógica de negócio mora dentro dos route handlers
   (`analytics/[videoId]/route.ts` tem 95 linhas de agregação estatística). Isso torna o código
   **impossível de testar sem HTTP** — provavelmente a razão de haver zero testes. Extrair para
   `src/lib/analytics/summarize.ts` já destravaria testes unitários.

5. **Sem validação declarativa.** Toda validação é manual (`typeof x === "string" ? ... : ...`),
   repetida em 37 rotas. Zod resolveria com menos código e menos brechas. Não é firula: BUG-06 e
   BUG-09 são consequência direta da validação artesanal.

---

## I. PERFORMANCE

**Backend (os gargalos reais):**

- `videos/route.ts:35` — busca **todos** os `video_events` de tipo `play` dos 30 vídeos da página,
  sem limite, só para contar sessões únicas em JavaScript. Com 100 mil eventos, isso é 100 mil linhas
  trafegadas a cada carregamento da lista de vídeos. **Deve ser `count` agregado no Postgres** (view
  materializada ou tabela de contadores).
- `videos/route.ts:38-47` — gera N URLs assinadas em paralelo por requisição (uma por vídeo).
  Aceitável em 30, caro em escala; considerar assinar sob demanda.
- `analytics/[videoId]/route.ts:63` — puxa até 50.000 linhas e faz ~15 varreduras completas em JS
  (`summarize`, `dimension` × 8, `timeline`). O `dimension()` ainda usa
  `[...(groups.get(name) ?? []), row]` dentro de um `forEach` — **cópia de array a cada linha, O(n²)**.
  Com 50 mil linhas isso são bilhões de operações. É o endpoint mais caro do sistema, sem rate limit.
- `ab-tests/route.ts:13` — `select` de `player_events` **sem filtro nem limite**.
- `cron/route.ts:42-72` — laço serial: por usuário, por vídeo, 4 queries. Com 1.000 usuários × 10
  vídeos são 40 mil queries sequenciais numa função com limite de tempo. Vai estourar bem antes disso.
- `rate-limit.ts` faz **uma ida ao Postgres por requisição** nos endpoints públicos de embed. Em pico
  de tráfego de VSL, o rate limiter vira o gargalo do banco. Redis/Upstash ou Cloudflare Rate
  Limiting é o lugar certo para isso.

**Frontend:**
- `AnalyticsWorkspace.tsx` tem 1.356 linhas em um componente cliente — vai inteiro para o bundle da
  rota de analytics.
- Recharts **e** visx **e** cobe **e** motion no mesmo projeto: três bibliotecas de gráfico/animação.
  Consolidar em uma reduziria o bundle significativamente.
- `NÃO FOI POSSÍVEL CONFIRMAR PELO CÓDIGO`: LCP, CLS, INP e tamanho real do bundle. Precisa de
  `next build --analyze` e Lighthouse/PageSpeed contra o deploy real.

---

## J. BANCO DE DADOS

**Bom:** 24 migrations versionadas e ordenadas; FKs compostas garantindo ownership no nível do banco;
índices adequados nos caminhos quentes (`videos_user_created_idx`, `video_events` etc.); constraints
`check` em status, roles e tamanhos de texto; `security definer` com `set search_path = ''` (correto —
previne o ataque clássico de search_path); `revoke execute` explícito nas funções internas.

**Problemas:**

1. **RLS é decorativa.** Ver seção C. As policies estão corretas, mas quase nada as usa.
2. **Sem retenção em `video_events`.** A tabela cresce para sempre; é a maior do sistema e a base de
   todas as consultas de analytics. Sem particionamento por data nem expurgo. Vira o gargalo de custo
   e de performance por volta de alguns milhões de linhas.
3. **`video_live_sessions` só é limpa dentro do cron diário** (`cron/route.ts:75`) e depois de um laço
   que pode estourar (BUG-07). Deveria ser um `pg_cron` independente.
4. **Sem agregação pré-calculada.** Toda métrica é recalculada do zero, em JavaScript, a cada request.
   Uma tabela `video_daily_stats` alimentada por trigger ou job resolveria I-01, I-03 e o cron de uma vez.
5. **`player_configs.config` é `jsonb` totalmente livre.** É a origem de SEC-06. Vale um `check`
   constraint ou validação de schema na aplicação.
6. **`NÃO FOI POSSÍVEL CONFIRMAR PELO CÓDIGO`:** se as migrations `20260127000000_better_auth_tables`
   e as tabelas `better_auth_*` estão aplicadas no banco de produção; se "leaked password protection"
   está ativa (é configuração de painel, mencionada em `20260724210652_...sql:24-27`); se há backups
   PITR habilitados. Verificar no painel Supabase.

---

## K. AUTENTICAÇÃO

**Bom:** `getClaims()` (verificação local de JWT, não `getUser()` a cada request — escolha certa para
o proxy); troca de senha exige a senha atual verificada num cliente descartável
(`account/password/route.ts:14-19` — bem feito, bloqueia sequestro de sessão); eventos gravados em
`security_events`; admin exige AAL2; rate limit `failClosed: true` nos endpoints sensíveis.

**Problemas:**
- `proxy.ts` protege só `/dashboard` e `/studio`. `/admin` **não está no matcher de proteção** — ele
  depende exclusivamente de `requireAdmin()` no layout. Isso funciona (Server Component roda antes de
  renderizar), mas é frágil: qualquer rota nova sob `/admin` que não use o layout fica aberta.
- Não há revogação de sessão em outros dispositivos após troca de senha (`signOut({scope:'others'})`).
- Não há política de expiração de sessão configurada em código. `NÃO FOI POSSÍVEL CONFIRMAR PELO
  CÓDIGO` — é configuração do painel Supabase.
- MFA existe (o código lê AAL2) mas não há fluxo de cadastro de MFA visível fora de
  `dashboard/settings?section=security`. Se um admin nunca cadastrou MFA, ele fica **travado fora do
  /admin** com um redirect para settings. Vale confirmar que esse fluxo fecha.

---

## L. API

37 rotas auditadas. Padrão geral consistente e correto: `csrfGuard` → auth → contexto de equipe →
validação → admin client com filtro de ownership.

**Faltas transversais:**
- **Rate limit ausente** em rotas caras: `/api/analytics/[videoId]` (a mais cara do sistema),
  `/api/videos` GET, `/api/ab-tests`, `/api/player-configs`, `/api/intelligence/controls`.
  Só 9 das 37 rotas têm rate limit.
- **Sem limite de tamanho de body** na maioria (só analytics/ab-events/ai têm, e via header forjável).
- **Sem versionamento** (`/api/v1/`) — mudança quebra embeds publicados em sites de clientes.
- **Sem paginação** em `/api/account/team`, `/api/ab-tests`, `/api/intelligence/audience-exports`.
- `/api/videos` GET usa cursor por `created_at` sem desempate por `id` na cláusula `lt` — vídeos
  criados no mesmo instante podem ser pulados na paginação.

---

## M. PRIVACIDADE / LGPD

Não são afirmações jurídicas — são pontos que precisam de revisão com advogado.

- **Dados pessoais coletados:** e-mail, nome, telefone, avatar (`profiles`); país, dispositivo, SO,
  navegador, user-agent, URL da página, UTMs e IDs de campanha dos **espectadores finais dos clientes**
  (`video_events`). O IP não é armazenado diretamente (bom) — só o país derivado.
- **Você é operador dos dados de terceiros.** Os espectadores das VSLs não têm relação contratual com
  a Prisma. Isso exige contrato de operador com os clientes e base legal definida.
- **Sem exclusão de conta.** Não há rota nem UI. Direito de eliminação (art. 18 V) não atendido.
- **Sem exportação de dados.** Direito de portabilidade (art. 18 V) não atendido.
- **Sem política de retenção.** `video_events` é infinito; `security_events` também.
- **Sem consentimento de cookies/analytics.** PostHog é inicializado incondicionalmente em
  `instrumentation-client.ts:3` com `capture_exceptions: true`. Para visitantes brasileiros, isso
  precisa de banner/opt-out. `capture_exceptions` pode enviar stack traces com dados pessoais.
- **`/privacy` e `/terms` existem** (`src/app/privacy`, `src/app/terms`, `src/content/legal/`) —
  bom sinal, mas não li se o texto cobre subprocessadores (Supabase/EUA, Cloudflare, PostHog/EUA,
  NVIDIA, Resend, AbacatePay). Transferência internacional precisa estar declarada.
- **Positivo:** os logs de erro que verifiquei não vazam tokens, senhas nem cookies — registram
  código, status e requestId. Foi feito com cuidado.

---

## N. TESTES

**Zero.** Nenhum arquivo `.test.`, `.spec.`, `__tests__`, Playwright, Vitest ou Jest. Sem CI.

Os 6 testes que eu escreveria primeiro, em ordem de risco:

1. **Autorização cross-tenant** (integração): usuário A não lê/edita/apaga recurso de B em
   videos, folders, player-configs, analytics, ab-tests, team. Bloqueia a classe de bug mais cara.
2. **Paywall** (integração): conta sem acesso recebe 402 em todas as rotas de escrita. Protege SEC-01
   contra regressão.
3. **Webhook de pagamento** (unitário + integração): assinatura inválida → 401; entrega duplicada →
   `duplicate:true` sem crédito duplo; refund → suspensão. É onde dinheiro real está em jogo.
4. **RBAC de equipe**: viewer não escreve, editor não apaga, admin não promove admin.
5. **Tokens de embed** (unitário): token expirado, de outro vídeo, com assinatura adulterada → rejeitado.
6. **Agregação de analytics** (unitário, depois de extrair para `lib/`): entrada conhecida → números
   conhecidos. Hoje ninguém sabe se os números do dashboard estão certos.

---

## O. INFRAESTRUTURA

- **`.gitignore` está correto** — `.env*.local` ignorado, e confirmei que `.env.local` **não** está
  versionado e nunca esteve no histórico. Bom.
- **`.env.example` tem um secret real** (SEC-02) — e é o único problema de secrets do repositório.
- **Headers de segurança bem feitos** (`next.config.ts:47-70`): HSTS com preload, nosniff,
  Referrer-Policy, Permissions-Policy, COOP, X-Frame-Options `SAMEORIGIN` para o app e
  `frame-ancestors *` só para `/embed` (correto — é o que precisa ser embutido).
- **Sem CI/CD** — nenhum `.github/workflows`. Nem lint, nem typecheck, nem build no PR.
- **Sem Docker** — irrelevante em Vercel, não é problema.
- **Cron único diário** — relatórios "diários" podem atrasar até 24h; alertas de queda de conversão
  chegam com até 24h de atraso, o que reduz muito o valor da funcionalidade.
- **`NÃO FOI POSSÍVEL CONFIRMAR PELO CÓDIGO`:** backups e PITR do Supabase, plano de rollback de
  migrations (não há migrations `down`), alertas de custo no R2/Vercel, e se `CRON_SECRET`,
  `EMBED_ORIGIN_SECRET` e `ABACATEPAY_WEBHOOK_SECRET` estão realmente setados em produção — se
  `EMBED_ORIGIN_SECRET` faltar, `createEmbedOriginTokenSafely` retorna string vazia e **todo player
  com domínio restrito para de funcionar** silenciosamente (`embed-origin.ts:74-83`).

---

## P. OBSERVABILIDADE

- Logs: só `console.error`/`console.warn` (0 `console.log` — bom, ninguém deixou debug para trás).
- Error tracking: PostHog `capture_exceptions` no cliente. **Nada no servidor.** Um erro numa rota de
  API só aparece se você abrir os logs da Vercel na hora certa.
- Métricas de negócio: PostHog captura `video_created`, `subscription_activated`,
  `subscription_cancelled_server`. Cobertura parcial.
- Sem health check (existe `supabase/functions/health/index.ts`, mas nada no app Next).
- Sem alertas. Sem dashboard de erro. Sem trilha de auditoria administrativa (ações no `/admin` não
  são registradas em lugar nenhum — para um painel que vê dados de todos os clientes, isso é uma falha
  de compliance).

---

## Q. ESCALABILIDADE

| Escala | O que quebra e por quê |
|---|---|
| **100 usuários** | Nada. A arquitetura atual aguenta com folga. |
| **1.000** | O cron começa a estourar o tempo limite (laço serial, `cron/route.ts:42`). Relatórios e alertas param de ser entregues — **silenciosamente**, porque os erros só se acumulam em `result.errors`. |
| **10.000** | `videos/route.ts:35` e `analytics/[videoId]:63` derrubam o pool de conexões do Supabase: cada request puxa dezenas de milhares de linhas. O rate limiter, que faz um round-trip ao Postgres **por requisição de embed**, vira o gargalo — e o tráfego de embed é o de maior volume (é o player de todos os clientes, não os clientes em si). O `dimension()` O(n²) começa a estourar memória da função. |
| **100.000** | Inviável sem reescrever a camada de analytics. Precisa de: agregação pré-calculada, particionamento e retenção em `video_events`, rate limit fora do Postgres (Redis/Cloudflare), fila para entrega de webhooks (hoje é 1 fetch externo por evento, em `after()`, sem retry — `analytics-events/route.ts:80-85`), e o cron quebrado em jobs paralelos. |

O custo escala pior que a carga: sem quotas de plano (SEC-03), o gasto com R2 e egress não tem relação
nenhuma com a receita.

---

## R. O QUE VOCÊ NÃO PERGUNTOU (mas eu verificaria antes de abrir ao público)

1. **Cancelamento não revoga o embed.** Quando a assinatura é cancelada, `/api/embed/:id` continua
   servindo o vídeo. O cliente cancela e a VSL dele continua no ar, hospedada e paga por você,
   indefinidamente. É o vazamento de receita mais silencioso do sistema.
2. **A resposta do embed não é cacheável** (`cache-control: private, no-store`), mas gera uma URL R2
   assinada de 1800s a cada carregamento. Cada play = 1 query de config + 1 query de vídeo + N
   assinaturas + 1 round-trip de rate limit. Multiplique pela audiência somada de todos os clientes.
3. **`account/inbox`, `dashboard-security` e `intelligence/audience-exports` não passam por
   `getTeamAccountContext`** — comportamento inconsistente para contas com equipe.
4. **Nenhuma migration tem rollback.** Se uma falhar em produção, o caminho de volta é manual.
5. **Sem `robots`/`noindex` nas páginas de embed?** Há `x-robots-tag: noindex` nas respostas de API
   (bom), mas confirme a página `/embed/[id]` em si.
6. **Docs mentem.** `docs/MIGRACAO_BETTER_AUTH.md` e `QUICK_START_BETTER_AUTH.md` descrevem uma
   arquitetura que foi revertida. Documentação errada é pior que documentação ausente — o próximo
   desenvolvedor (ou o próximo agente de IA) vai seguir.
7. **Um único ponto de falha em `EMBED_ORIGIN_SECRET`.** Se ele for rotacionado, **todos os tokens de
   evento em sessões abertas expiram de uma vez** e você perde telemetria até os embeds recarregarem.
   Vale suportar duas chaves (atual + anterior) na verificação.
8. **`risk_score` é calculado mas nunca age.** Sessões marcadas como fraudulentas continuam contando
   nas métricas cobradas (`included_plays`). Detecção sem consequência.

---

## S. MATRIZ DE RISCO CONSOLIDADA

| ID | Sev | Categoria | Arquivo | Prioridade |
|---|---|---|---|---|
| SEC-01 | 🔴 | Access Control / Receita | `features/access/components/AccessGate.tsx` + todas as APIs | 1 |
| SEC-02 | 🔴 | Secret exposto | `.env.example:7` (commit `bcf9f5e`) | 1 |
| SEC-03 | 🔴 | Business Logic / Custo | `api/videos/route.ts`, `api/ai/analyze/route.ts` | 1 |
| SEC-04 | 🟠 | Paywall / RBAC | `api/intelligence/controls/route.ts:29` | 2 |
| SEC-05 | 🟠 | Rate limit (NaN) | `api/embed/[id]/route.ts:9`, `manifest/route.ts:8` | 2 |
| SEC-06 | 🟠 | IDOR / Storage | `api/embed/[id]/route.ts:79` | 2 |
| SEC-07 | 🟠 | Enumeração / PII | `api/account/team/route.ts:54` | 2 |
| BUG-02 | 🟠 | Storage órfão / Custo | `api/videos/route.ts:60` | 2 |
| BUG-03 | 🟠 | Funcional (equipes) | `api/ab-tests/route.ts:9` | 2 |
| SEC-08 | 🟡 | Contexto de equipe | `lib/access/team-context.ts:21` | 3 |
| BUG-05..12 | 🟡🔵 | Diversos | ver seção F | 3-4 |
| PERF-01..06 | 🟡 | Performance / Escala | ver seção I | 3-4 |
| SEC-09, SEC-10 | 🟡 | CSP / Domínio | `next.config.ts`, `manifest/route.ts:62` | 4 |

---

## T. PLANO DE CORREÇÃO

### FASE 1 — Emergencial (1-2 dias)
1. Revogar `BETTER_AUTH_API_KEY` no provedor; limpar `.env.example` (SEC-02).
2. Criar `requirePaidAccess()` e aplicar em todas as rotas de escrita + `/api/embed/:id` (SEC-01).
3. Corrigir `"60_000"` → `"60000"` (SEC-05) — correção de um caractere, impacto alto.

### FASE 2 — Segurança (3-5 dias)
4. Quotas de plano: storage e créditos de IA (SEC-03).
5. Validar `capabilities` do plano em intelligence/controls + cron; usar `accountOwnerId` (SEC-04).
6. Filtro de prefixo de dono em `config.assets` no embed + validação no `PUT player-configs` (SEC-06).
7. Convite de equipe com aceite explícito e resposta uniforme (SEC-07).
8. Desempate determinístico em `getTeamAccountContext` (SEC-08).
9. Rate limit nas rotas caras sem proteção (analytics, videos, ab-tests).

### FASE 3 — Bugs (3-5 dias)
10. Unificar `objectPath` em `accountOwnerId` (BUG-02) + script de limpeza de órfãos.
11. `ab-tests` para admin client + `accountOwnerId` (BUG-03).
12. BUG-05 (verificação de arquivo por provider), BUG-06 (limite de body real), BUG-07 (cleanup fora
    do cron), BUG-08 (debitar crédito antes da chamada à NVIDIA), BUG-09, BUG-10, BUG-12.

### FASE 4 — Arquitetura (1-2 semanas)
13. Helper `withAuthenticatedAccount()` centralizando auth/CSRF/role/paywall.
14. Zod nas 37 rotas.
15. Extrair lógica de negócio dos handlers para `src/lib/<domínio>/`.
16. Unificar `components/dashboard` e `features/*`.
17. Revogar embed no cancelamento de assinatura (item R-1).

### FASE 5 — Limpeza (1-2 dias)
18. Remover `pg`, `@types/pg`, `@supabase/server`, `shaders`.
19. Remover artefatos Better Auth (script, migration, 2 docs, bloco do `.env.example`).
20. Consertar `.env.local` de desenvolvimento.
21. Consolidar bibliotecas de gráfico (Recharts vs visx).

### FASE 6 — Performance (1-2 semanas)
22. Tabela/view de agregação para plays e métricas diárias (mata I-01, I-03 e o cron de uma vez).
23. Retenção + particionamento de `video_events`.
24. Rate limit fora do Postgres para os endpoints de embed.
25. Fila com retry para entrega de webhooks.
26. Cron paralelizado e paginado.

### FASE 7 — Qualidade (contínuo)
27. Os 6 testes da seção N + CI no GitHub Actions (lint + typecheck + build + testes).
28. Sentry no servidor.
29. LGPD: exclusão de conta, exportação, retenção, consentimento de analytics.
30. Trilha de auditoria do `/admin`.

---

## U. NOTAS (0-10)

| Área | Nota | Justificativa |
|---|---|---|
| **Segurança** | 6,5 | Fundamentos acima da média (CSRF, HMAC, SSRF, idempotência, timing-safe). Derrubada por SEC-01/03: o controle de acesso *comercial* simplesmente não existe no servidor. |
| **Arquitetura** | 6,0 | Escolhas coerentes e conscientes, com comentários que explicam o porquê. Falta camada de serviço e centralização de auth; a repetição em 37 rotas é a fonte dos bugs achados. |
| **Código** | 7,0 | TypeScript strict, sem `any` espalhado, sem console.log, sem TODO abandonado, nomes claros. Perde por linhas de 400+ colunas que dificultam revisão e por componentes de 1.300 linhas. |
| **Backend** | 6,5 | Rotas consistentes e bem validadas. Perde por rate limit parcial, validação artesanal e lógica pesada dentro dos handlers. |
| **Frontend** | 6,5 | UI rica e player sólido. 71% de client components e três libs de gráfico pesam no bundle. |
| **Banco de dados** | 7,0 | Migrations organizadas, FKs compostas inteligentes, funções seguras. Perde por RLS decorativa, ausência de retenção e de agregação. |
| **Performance** | 4,5 | Funciona hoje, quebra cedo. O O(n²) em `dimension()` e as queries sem limite são problemas concretos, não teóricos. |
| **Testes** | 0,0 | Zero. Sem CI. Não há como refatorar com segurança. |
| **Observabilidade** | 3,0 | Logs de erro cuidadosos (não vazam secrets) e PostHog no cliente. Nada no servidor, sem alertas, sem auditoria de admin. |
| **Escalabilidade** | 4,5 | Aguenta centenas de usuários. Os gargalos são identificáveis e corrigíveis, mas são estruturais na camada de analytics. |
| **Manutenibilidade** | 6,0 | Comentários explicam decisões (raro e valioso). Prejudicada por duplicação estrutural, docs enganosos e ausência de testes. |
| **Infraestrutura** | 6,0 | Headers e CSP bem feitos, `.gitignore` correto, Vercel + Cloudflare adequados. Sem CI, sem rollback, um secret vazado. |
| **Privacidade** | 4,0 | Não vaza dados nos logs e não guarda IP. Mas faltam exclusão, exportação, retenção e consentimento — e você é operador de dados de terceiros. |

### **NOTA GERAL: 5,5 / 10**

Um projeto tecnicamente competente, construído por alguém que entende de segurança de aplicação —
o que se nota nos detalhes certos (timing-safe compare, claim atômico, `server-only`, FK composta).
A nota é puxada para baixo por três coisas que não são falhas de habilidade técnica, e sim de
completude: **o produto não cobra**, **não tem testes** e **não enxerga a si mesmo em produção**.

Se as Fases 1 e 2 forem executadas, isso vira um 7,0 e é defensável colocar em produção paga.
Sem elas, cada usuário novo é um custo sem receita garantida.

---

*Nenhum arquivo do projeto foi modificado nesta auditoria.*
