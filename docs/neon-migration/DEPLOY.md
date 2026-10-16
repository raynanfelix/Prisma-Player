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

## 5. Smoke test pós-deploy

1. `signup` → `login` → `logout` (fluxo Neon Auth).
2. Upload de vídeo → `ready` (R2) → `/embed/[id]` e `/embed/[id]/manifest`.
3. Eventos: `/api/analytics-events` aceita o token do embed (não precisa sessão).
4. Billing: webhook AbacatePay em sandbox (assinatura HMAC deve validar).
5. `GET /api/account/security` responde `{ factors: [] }` (2FA desabilitado).

---

## Pendências finais (consolidadas)

1. **2FA/MFA indisponível** — Neon Auth gerenciado ainda não tem MFA (roadmap
   Neon). Stubs: GET `{ factors: [] }`, mutations `503 mfa_unavailable`.
   Reavaliar quando o Managed suportar, ou migrar para Better Auth self-managed.
2. **`@neondatabase/auth@0.6.0-beta`** — pacote em beta; travar a versão no
   lockfile e acompanhar o changelog até GA.
3. **SMTP custom obrigatório** em produção para links de verificação de e-mail.
4. **Verificação de e-mail** — toggle "Verify email at signup" do branch; se
   ligado, falta UI de verificação + tratamento no signup.
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
