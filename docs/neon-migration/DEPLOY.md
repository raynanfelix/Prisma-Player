# Deploy — Prisma Player no Neon

Guia de ativação da migração Supabase → Neon (Lakebase Postgres + Neon Auth +
Cloudflare R2). A base de código já está 100% migrada e validada
(`npm test` 212/212, `tsc --noEmit` 0 erros, `npm run build` OK, `knip` limpo,
`grep -i supabase src/` = 0). O que falta é só a ativação no seu ambiente.

## 0. Pré-requisitos já resolvidos

- Projeto Neon criado e **conectado à Vercel via marketplace** (a
  `DATABASE_URL` pooled já chega como env na Vercel).
- Bucket Cloudflare R2 provisionado (variáveis `CLOUDFLARE_R2_*`).

## 1. Criar o schema do banco

1. No console da Neon, abra **SQL Editor**.
2. Cole o conteúdo inteiro de `docs/neon-migration/neon-schema.sql` e execute.
   - É **idempotente** (pode rodar mais de uma vez sem quebrar).
   - Cria as ~39 tabelas de produto + índices + **RLS completa**
     (`auth.user_id()` + papéis `authenticated`/`anonymous`) + GRANTs.
   - **Não** recria o schema `neon_auth` — a Neon o cria automaticamente
     quando o Auth é ativado (próximo passo).

## 2. Ativar o Auth (Neon Auth / Managed Better Auth)

1. Console da Neon → seu projeto → branch → **Auth** → Enable.
2. A Neon cria sozinha o schema `neon_auth` (tabelas `user`, `session`,
   `account`, `verification`, `organization`, `member`, `invitation`, `jwks`,
   `project`, `config`) e a função `auth.user_id()` usada pela RLS.
3. Anote a **Auth URL** exibida (ex.: `https://ep-xxx.neonauth.<região>.aws.neon.tech/neondb/auth`).

## 3. Variáveis de ambiente (Vercel)

| Variável | Valor | Observação |
|---|---|---|
| `DATABASE_URL` | (já provisionada) | string **pooled** (hostname com `-pooler`) |
| `DATABASE_URL_UNPOOLED` | string direta (sem `-pooler`) | usada pelo `drizzle-kit` em migrations |
| `NEON_AUTH_BASE_URL` | Auth URL do painel | **com o path completo** `/neondb/auth` |
| `NEON_AUTH_COOKIE_SECRET` | `openssl rand -base64 32` | mínimo 32 chars |
| `NEXT_PUBLIC_SITE_URL` | URL de produção | |
| `EMBED_ORIGIN_SECRET` | segredo longo | assina tokens de embed |
| `CRON_SECRET` | segredo longo | Bearer do Vercel Cron |
| `CLOUDFLARE_R2_*` | do bucket | storage de vídeo |
| `ABACATEPAY_*` | do provedor | billing |
| `NVIDIA_*`, `RESEND_*`, demais | ver `.env.example` | |

O `.env.example` já está completo e sem nenhuma `SUPABASE_*`.

## 4. Pós-ativação (ordem obrigatória)

1. **Promover o primeiro admin** (sem isso `/admin` e `/api/admin/*` retornam
   403):
   ```sql
   UPDATE neon_auth."user" SET role = 'admin' WHERE email = 'seu-email@exemplo.com';
   ```
2. **Domínios confiáveis** (login/callback OAuth e links funcionarem em
   produção E previews):
   ```bash
   neon neon-auth domain add https://seu-dominio.com
   neon neon-auth domain add https://*.vercel.app
   ```
3. **SMTP custom (obrigatório em produção)**: links de verificação de e-mail
   exigem SMTP próprio; os códigos numéricos funcionam no SMTP compartilhado.
   Configure no painel do branch (ver `docs/neon-migration/neon-auth-setup.md`).

## 5. Neon Auth — ativação completa (painel)

Com o código já migrado (webhook `user.created` + verificação por código),
ligue os recursos no painel do branch **de produção**, nesta ordem:

### 5.1 Application name

**Settings → Better Auth → Application name**: `Prisma Player`. É o nome que
aparece nos e-mails de verificação/reset enviados pelo Auth.

### 5.2 Sign-up com e-mail + verificação obrigatória (método CÓDIGOS)

**Settings → Better Auth**:

- **Sign-up with Email**: ON
- **Verify at Sign-up**: ON
- **Método de verificação**: **Códigos** (numéricos de 6 dígitos)

> Por que códigos: o SMTP **compartilhado** (`auth@mail.myneon.app`) entrega
> códigos normalmente; **links** exigem SMTP próprio. Com códigos, o signup
> cria o usuário e a UI troca para o form "Verifique seu e-mail"
> (`/api/auth/verify-email` troca o código por sessão via
> `emailOtp.verifyEmail`; reenvio com cooldown de 60s via
> `sendVerificationEmail`).

CLI equivalente:

```bash
neon neon-auth config email-password update --enabled --require-email-verification
```

### 5.3 Webhook `user.created` (provisionamento instantâneo)

**Auth → Configuration → Webhooks**:

- **Webhook URL**: `https://prisma-player.vercel.app/api/webhooks/neon-auth`
- **Events**: `["user.created"]` **SOMENTE**
- **Timeout**: 5s (default; max 3 tentativas / 15s globais na Neon)

CLI equivalente:

```bash
neon neon-auth config webhook update --enabled \
  --url https://prisma-player.vercel.app/api/webhooks/neon-auth \
  --enabled-events user.created --timeout 5
```

> Por que **só** `user.created`: a assinatura Ed25519 do evento é verificada
> contra o JWKS do próprio `NEON_AUTH_BASE_URL` (`/.well-known/jwks.json` —
> nenhuma variável nova). Sobre os demais eventos:
>
> - `send.otp` / `send.magic_link` são **substitutivos** — assiná-los desliga o
>   e-mail da Neon e o código passa a depender do SEU delivery (ainda não
>   existe). Não assinar sem delivery próprio.
> - `user.before_create` é **fail-closed**: se este endpoint cair ou demorar,
>   **TODOS os signups falham**. Não assinar sem necessidade real de bloqueio.
> - `phone_number.verified` / `organization.*` estão fora de escopo por
>   decisão do dono (sem phone/org no produto hoje).

### 5.4 Como fica o provisionamento

O webhook dá **bootstrap instantâneo**: assim que a Neon grava o usuário,
`ensureAccountBootstrap` cria profiles, access/trial, wallet, inbox e equipe
(idempotente — upserts), sem esperar o primeiro login. O self-heal do app
(primeira leitura de perfil/access) **continua** como rede de segurança para
entregas perdidas ou contas antigas — rodar os dois é seguro.

## 6. Smoke test pós-deploy

1. Signup com "Verify at Sign-up" ligado: cadastro → form "Verifique seu
   e-mail" → código do e-mail → sessão automática (`/welcome`). Login com
   e-mail não verificado oferece o link "Verificar e-mail".
2. `login` → `logout` (conta já verificada).
3. Upload de vídeo → `ready` (R2) → `/embed/[id]` e `/embed/[id]/manifest`.
4. Eventos: `/api/analytics-events` aceita o token do embed (não precisa sessão).
5. Billing: webhook AbacatePay em sandbox (assinatura HMAC deve validar).
6. `GET /api/account/security` responde `{ factors: [] }` (2FA desabilitado).
7. Webhook Neon: criar uma conta nova e confirmar nos logs que
   `ensureAccountBootstrap` rodou via `/api/webhooks/neon-auth` (200 + after).

---

## 7. Checklist de escala (quando o tráfego de verdade chegar)

Arquitetura de entrega da VSL (pós-otimização): config pública do player
servida da **borda da Vercel** (manifest, `s-maxage=60`) → endpoint
dinâmico só para URL assinada + token de eventos → **bytes de vídeo
direto do R2 ao navegador** (egress US$ 0) → eventos em lote no Neon com
rollup diário + purga de retenção.

| Quando | Ação | Onde |
|---|---|---|
| Primeiro cliente pagando | Vercel **Pro** (~US$20/mês) | Vercel → Billing |
| Tráfego contínuo (qualquer hora do dia) | Neon **Launch** (~US$19/mês) e desligar scale-to-zero (compute sempre ativo) → mata o cold start do primeiro play de cada pico | Neon → plano → Compute → Always on |
| Eventos passando de ~10 GB | Ajustar `VIDEO_EVENTS_RETENTION_DAYS` (30 → 14/21) OU subir Neon Scale | Vercel env vars / Neon |
| Desde já (grátis) | **Monitor de uptime**: UptimeRobot/Better Stack free apontando para `https://seu-dominio/api/health` (a cada 5 min) + alerta por e-mail | monitor → URL `/api/health` |
| Semana de lançamento de um cliente | Ping profundo: abrir a VSL de teste 1×/dia valida a cadeia inteira (edge + Neon + R2) | manual |

**Janelas conhecidas e aceitas (decisões de produto):** mudança de config
do player propaga em ≤60s (cache de borda do manifest); assinatura
cancelada pode servir por até 30s (micro-cache de acesso no embed);
eventos de analytics com limite por **sessão** (não por IP — CGNAT de
operadora não trava espectador legítimo).

---

## Pendências finais (consolidadas)

1. **2FA/MFA indisponível** — Neon Auth gerenciado ainda não tem MFA (roadmap
   Neon). Stubs: GET `{ factors: [] }`, mutations `503 mfa_unavailable`.
   Reavaliar quando o Managed suportar, ou migrar para Better Auth self-managed.
2. **`@neondatabase/auth@0.6.0-beta`** — pacote em beta; travar a versão no
   lockfile e acompanhar o changelog até GA.
3. **SMTP custom obrigatório** em produção para links de verificação de e-mail.
4. **Verificação de e-mail** — toggle "Verify email at signup" do branch — ✅
   implementada: form de código no signup + `/api/auth/verify-email` + link
   "Verificar e-mail" no login. Falta só ligar no painel: seção **5.2**
   (Verify at Sign-up, método CÓDIGOS).
5. **OAuth social** — sem social login na UI; quando houver, registrar origens
   (`neon neon-auth domain add`) e usar credenciais de produção.
6. **Convite de equipe sem e-mail** — `api/account/team` cria o convite
   pendente (visível no GET do convidado), mas o envio de e-mail não tem
   equivalente no Managed (hoje `console.warn`). Resolver com SMTP Neon/Resend.
7. **Rate limiting** — o do Managed não é configurável pelo app; o
   `rateLimit` app-level (Drizzle) permanece o controle primário.
8. **Skills do Neon não aplicáveis aos requisitos atuais**: `neon-object-storage`
   (você usa R2), `neon-functions` (deploy na Vercel), `neon-ai-gateway`
   (IA via NVIDIA NIM), `neon-realtime` (sem realtime no produto).
9. **`npm audit`: 25 vulnerabilidades (4 critical)** — pré-existentes, não
   introduzidas pela migração; tratar em iniciativa separada.
10. **Working tree não commitada** — recomenda-se um commit do estado migrado
    para isolar qualquer regressão futura.
