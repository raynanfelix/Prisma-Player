# Neon Auth (Managed Better Auth) — Setup da Prisma Player

> Parte da task **T2** da migração Supabase → Neon. Este documento cobre
> autenticação. O guia geral de deploy (`DEPLOY.md`) é da task T7; a seção de
> SMTP abaixo deve ser refletida lá pelo dono da T7.

## 1. O que mudou

| Antes (Supabase) | Agora (Neon Auth) |
| --- | --- |
| `@supabase/ssr` + `supabase.auth.*` | `@neondatabase/auth` 0.6.0-beta (Managed Better Auth) |
| `SUPABASE_URL` / `SUPABASE_PUBLISHABLE_KEY` | `NEON_AUTH_BASE_URL` |
| Sessão em cookies próprios do `@supabase/ssr` | Cookies `__Secure-neon-auth.*` geridos pelo SDK |
| `src/lib/supabase/proxy.ts` (updateSession) | `src/lib/auth/session.ts` (usado por `src/proxy.ts`) |
| Guarda de páginas no middleware para todo o site | Proteção explícita em `/dashboard`, `/studio`, `/admin`; páginas públicas validam sessão on-demand |
| `guard()` usa id Supabase (UUID) | `guard()` usa id do usuário Neon (**TEXT**) em `accountOwnerId` |
| MFA/TOTP (`supabase.auth.mfa.*`) | **Indisponível no Managed** (roadmap Neon) — ver §6 |
| Reset de senha: link → `/auth/callback?code=` → sessão | Reset: link → `/reset-password?token=` → POST `/api/auth/update-password` com `{ password, token }` |
| Papel admin em `app_metadata.role` | Papel admin em `neon_auth.user.role` (plugin Admin) — ver §5 |

Rotas preservadas (contratos da UI mantidos): `/api/auth/signup`, `/api/auth/login`,
`/api/auth/logout`, `/api/auth/reset`, `/api/auth/update-password`,
`/api/auth/revoke-all-sessions`, `/api/account/password`, `/api/account/security`.
Todo o resto de `/api/auth/*` cai no proxy Managed: `src/app/api/auth/[...path]/route.ts`
(o segmento PRECISA ser `[...path]` — o handler do SDK lê `params.path.join("/")`).

## 2. Variáveis de ambiente

```env
# Auth URL copiada do painel Neon (Project → Branch → Auth → Configuration).
# Inclui o path completo (ex.: /neondb/auth) — o SDK exige o path.
NEON_AUTH_BASE_URL=https://ep-xxx.neonauth.us-east-1.aws.neon.tech/neondb/auth

# Segredo do app para assinar o cookie de cache de sessão (__Secure-neon-auth.local.session_data).
# Gerar com: openssl rand -base64 32  (mínimo 32 caracteres; o SDK valida).
NEON_AUTH_COOKIE_SECRET=
```

- Não são injetadas por `neon env pull` (o cookie secret é config do app).
- **`NEON_AUTH_BASE_URL` e `NEON_AUTH_COOKIE_SECRET` são obrigatórias em
  runtime.** O código cria o client sob demanda e falha com mensagem explícita
  se faltarem — builds sem as variáveis continuam passando.
- `DATABASE_URL` (poolda, `-pooler`) é da T1 e também é necessária.

## 3. Habilitar o Managed Auth e domínios confiáveis

1. Console Neon → **Project → Branch → Auth → Enable Auth**.
2. Copiar a Auth URL (Settings → Better Auth → Project Info) para
   `NEON_AUTH_BASE_URL`.
3. Registrar as origens do app (o redirect do OAuth e os `callbackURL` só são
   aceitos para domínios na allowlist; `invalid domain` = origem faltando).
   Incluir scheme, sem barra final, e registrar produção **e** previews antes
   de apontar usuários:

   ```bash
   neon neon-auth domain add https://seudominio.com
   neon neon-auth domain add https://prisma-player.vercel.app
   neon neon-auth domain list
   ```

   Localhost é pré-aprovado por padrão (verificar com
   `neon neon-auth domain allow-localhost get`).
4. Opcional: **"Verify email at signup"** é toggle do branch no Console. Com
   ele ligado, `signUp.email` não devolve token (`hasSession: false`) até o
   usuário verificar o e-mail — a UI de verificação ainda não existe (§7).

## 4. E-mail (SMTP)

- **Dev**: SMTP compartilhado do Neon (`auth@mail.myneon.app`) envia
  verificação, OTP, magic link e reset — sem configuração nenhuma.
- **Produção**: exige **custom SMTP** configurado no branch (Console →
  Auth → SMTP). Links de verificação exigem custom SMTP; códigos funcionam em
  ambos. Checklist: https://neon.com/docs/auth/production-checklist.md
- O SMTP do Neon atende apenas o Auth. Os relatórios operacionais do app
  continuam no Resend (`RESEND_API_KEY`) — cobrir no `DEPLOY.md` (T7).

## 5. Papel admin (sem `app_metadata`)

O Managed usa o plugin Admin do Better Auth: o papel vive em
`neon_auth.user.role` (default `"user"`). Promover o primeiro admin via SQL
(console Neon / SQL Editor):

```sql
UPDATE neon_auth."user"
SET role = 'admin'
WHERE email = 'admin@seudominio.com';
```

`getCurrentAdminUser()` (src/lib/auth/server.ts) lê esse campo da sessão
(múltiplos papéis separados por vírgula são aceitos). Sem `role = 'admin'` as
rotas `/api/admin/*` e a página `/admin` respondem 403.

## 6. MFA / 2FA — indisponível (decisão do usuário)

O Managed Neon Auth **não** expõe MFA hoje (roadmap Neon). Acordado: 2FA
desligado por enquanto.

- `GET /api/account/security` → `{ factors: [], events }` (UI intacta; painel
  aparece vazio).
- `POST /api/account/security` (enroll/challenge/verify/unenroll) → **503**
  `{ error: "mfa_unavailable" }` — erro estável para a UI.
- `getAuthAssuranceLevel()` retorna `"aal1"` com sessão válida; `"aal2"` nunca.
- A exigência AAL2 de `adminGuard` foi **removida** (no Managed ela travaria o
  painel admin para sempre). Reavaliar quando houver MFA no Managed ou em uma
  eventual migração para Better Auth self-managed.
- UI do SecurityPanel (MfaFactor, QR, enroll) foi mantida de propósito —
  não deletar.

## 7. Fluxo de senha — pendências de UI (fora do escopo T2)

1. **Token do reset não é lido pela UI.** O link do e-mail cai em
   `/reset-password?token=...`, mas `src/app/reset-password/page.tsx` não lê o
   token e `src/services/auth/client.ts` não o envia. As rotas já aceitam
   `{ password, token }`; falta (dono da UI / Lead):
   - ler `?token=` com `useSearchParams()` na página e repassar ao serviço;
   - `updatePassword(password, token)` em `services/auth/client.ts`.
   Sem isso, o reset por e-mail não conclui (a rota responde
   `reset_token_required` quando não há token nem sessão).
2. **Verificação de e-mail**: sem página/fluxo de verify (o Managed envia o
   e-mail; o link de verificação precisa de UI própria ou custom SMTP +
   página). Pendência de UI.
3. **OAuth social**: não há social login na UI hoje. Quando houver, usar
   `signIn.social({ provider, callbackURL })` (Google/GitHub/Vercel no Managed)
   com as credenciais próprias de produção e as origens registradas (§3).

## 8. Rate limiting de auth

- App (primário): `rateLimit` de `src/lib/security/rate-limit` nas rotas de
  auth (baldes por IP e por conta, fail-closed) — mantido igual. A conversão
  dele para Drizzle/Lakebase é da T5.
- Managed Better Auth tem rate limiting server-side interno (sensível: ~3
  req/10s em sign-in/sign-up/change-password), mas **não é configurável pelo
  app** (a config é do Neon). Não contar só com ele.

## 9. Validação

- `tsc --noEmit` ✓ (escopo T2; pendências de escopo alheio listadas na task).
- Testes: `tests/auth-signup-shape.test.ts`, `tests/admin-guard.test.ts` e
  `tests/server-boundary.test.ts` atualizados para a nova stack.
- Fluxos a exercitar com o branch Neon real (§3): sign-up, sign-in, sign-out,
  sessão após reload, rota protegida (`/dashboard`), reset de e-mail (§7.1) e,
  se habilitado, verificação de e-mail.
