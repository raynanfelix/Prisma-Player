# Fluxo Real de Cookies, JWT, Refresh, MFA e Revogação

## Visão Geral da Arquitetura

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        ARQUITETURA DE SESSÃO SUPABASE                   │
└─────────────────────────────────────────────────────────────────────────┘

┌──────────────┐         ┌─────────────────────┐         ┌─────────────┐
│   Browser    │ ◄──────►│  Next.js Server     │ ◄──────►│  Supabase   │
│  (Client)    │  Cookies│  (Server Components,│  REST   │  Auth       │
│              │  JWT    │   Route Handlers,   │  API    │  (PostgreSQL)│
│              │         │   Middleware)       │         │             │
└──────────────┘         └─────────────────────┘         └─────────────┘
        │                          │                          │
        │ 1. Login/Signup          │                            │
        │ ────────────────────────►│                            │
        │                          │ 2. signInWithPassword/    │
        │                          │    signUp                  │
        │                          │ ────────────────────────►│
        │                          │                            │
        │                          │ 3. Retorna session:       │
        │                          │    { access_token,         │
        │                          │      refresh_token,        │
        │                          │      user, expires_in }    │
        │                          │ ◄─────────────────────────│
        │                          │                            │
        │ 4. Cookies definidos     │                            │
        │    via @supabase/ssr     │                            │
        │    (HttpOnly, Secure,    │                            │
        │     SameSite=Lax)        │                            │
        │ ◄────────────────────────│                            │
        │                          │                            │
        │ 5. Requests subsequentes │                            │
        │    levam cookies         │                            │
        │ ────────────────────────►│                            │
        │                          │ 6. getClaims() valida      │
        │                          │    JWT + refresca se       │
        │                          │    necessário              │
        │                          │ ────────────────────────►│
        │                          │                            │
        │                          │ 7. Novo access_token       │
        │                          │    (se refresh necessário) │
        │                          │ ◄─────────────────────────│
        │                          │                            │
        │ 8. Cookies atualizados   │                            │
        │    se refresh ocorreu    │                            │
        │ ◄────────────────────────│                            │
```

---

## Cookies de Sessão

### Cookies Definidos pelo `@supabase/ssr`

| Cookie | Propósito | Flags |
|--------|-----------|-------|
| `sb-<project-ref>-auth-token` | Access token (JWT) | HttpOnly, Secure, SameSite=Lax, Path=/ |
| `sb-<project-ref>-auth-token.0` | Chunk 1 (se token > 4KB) | HttpOnly, Secure, SameSite=Lax, Path=/ |
| `sb-<project-ref>-auth-token.1` | Chunk 2 (se token > 4KB) | HttpOnly, Secure, SameSite=Lax, Path=/ |

### Cookies Personalizados da Aplicação

| Cookie | Arquivo | Flags | Propósito |
|--------|---------|-------|-----------|
| `pp_embed` | `src/proxy.ts:45-52` | HttpOnly, Secure (prod), SameSite=None (prod), Path=/, MaxAge=600 | Nonce único para validação de embed cross-origin |

### Configuração no Supabase Dashboard

**Authentication → Settings → Cookie Options:**
```
SameSite: lax (recomendado para compatibilidade OAuth)
Secure: true (forçado em HTTPS)
HttpOnly: true (padrão, não configurável via Dashboard)
Domain: (deixar vazio para domínio atual)
```

**Nota:** O `@supabase/ssr` usa as configurações do projeto Supabase para definir as flags dos cookies. Não há override no código.

---

## JWT (Access Token)

### Estrutura do Payload

```json
{
  "iss": "https://<project-ref>.supabase.co/auth/v1",
  "sub": "<user-uuid>",
  "aud": "authenticated",
  "role": "authenticated",
  "email": "user@example.com",
  "phone": "",
  "app_metadata": {
    "provider": "email",
    "providers": ["email"],
    "role": "admin"  // Apenas se admin
  },
  "user_metadata": {
    "full_name": "Nome Completo"
  },
  "aal": "aal1",  // ou "aal2" se MFA verificado
  "amr": [
    { "method": "password", "timestamp": 1234567890 }
  ],
  "session_id": "<session-uuid>",
  "is_anonymous": false,
  "exp": 1234567890,
  "iat": 1234567890
}
```

### Claims Críticos para Autorização

| Claim | Descrição | Uso no Código |
|-------|-----------|---------------|
| `sub` | User ID | `getCurrentUserId()` → `claims.sub` |
| `app_metadata.role` | Papel administrativo | `getCurrentAdminUser()` → `app_metadata.role === "admin"` |
| `aal` | Assurance Level | `getAuthAssuranceLevel()` → `aal1` ou `aal2` |
| `amr` | Authentication Methods References | Verifica métodos usados |
| `session_id` | ID da sessão | Correlação de auditoria |

### Validação no Servidor

```typescript
// src/lib/supabase/proxy.ts:20-21
const { data } = await supabase.auth.getClaims();
const signedIn = Boolean(data?.claims?.sub);

// src/lib/auth/server.ts:7-9
const { data, error } = await supabase.auth.getClaims();
if (error || !data?.claims?.sub) return null;
return String(data.claims.sub);
```

**`getClaims()` vs `getUser()`:**
- `getClaims()` - Mais leve, não faz request de rede se JWT válido localmente
- `getUser()` - Sempre valida com Supabase, mais lento mas garante revogação

---

## Refresh Token

### Fluxo de Renovação

1. Access token expira (padrão: 1 hora)
2. Próxima request chama `supabase.auth.getClaims()`
3. `@supabase/ssr` detecta expiração
4. Usa refresh token (armazenado no cookie) para obter novo access token
5. Atualiza cookies com novo access token
6. Continua request

### Configuração (Supabase Dashboard)

```
JWT Expiry: 3600 segundos (1 hora) - Padrão
Refresh Token Rotation: Enabled - Padrão
Refresh Token Reuse Interval: 10 segundos - Padrão
```

### Comportamento de Refresh

- **Sucesso:** Novos access_token + refresh_token emitidos, cookies atualizados
- **Falha (refresh token expirado/revogado):** Sessão invalidada, redirect para login
- **Concorrência:** Refresh token rotation previne uso simultâneo

---

## MFA (TOTP) e Assurance Levels

### Níveis de Garantia (AAL)

| AAL | Descrição | Quando Atribuído |
|-----|-----------|------------------|
| `aal1` | Autenticação de fator único (senha) | Login padrão |
| `aal2` | Autenticação de dois fatores (MFA verificado) | Após `verify` TOTP bem-sucedido |

### Fluxo MFA no Prisma Player

```
1. Usuário acessa /dashboard/settings?section=security
2. Clica "Configurar aplicativo" → POST /api/account/security {action:"enroll"}
3. Supabase retorna: factorId, QR code (totp.qr_code), secret (totp.secret)
4. Frontend exibe QR → usuário escaneia no app autenticador
5. Usuário digita código 6 dígitos → POST /api/account/security {action:"challenge", factorId}
6. Supabase retorna challengeId
7. POST /api/account/security {action:"verify", factorId, challengeId, code}
8. Supabase valida TOTP → retorna sucesso
9. supabase.auth.refreshSession() → novo JWT com aal="aal2"
10. Cookies atualizados com novo access_token
```

### Verificação de MFA na Sessão Atual

```typescript
// src/lib/auth/server.ts:27-33
export async function getAuthAssuranceLevel(): Promise<"aal1" | "aal2" | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  if (error || !data?.claims) return null;
  const aal = data.claims.aal;
  return aal === "aal1" || aal === "aal2" ? (aal as "aal1" | "aal2") : null;
}

// src/lib/auth/server.ts:35-40
export async function hasVerifiedMfaFactor(): Promise<boolean> {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.mfa.listFactors();
  if (error || !data?.all) return false;
  return data.all.some((factor) => factor.status === "verified");
}
```

**⚠️ PROBLEMA IDENTIFICADO (FIND-001):**
- `hasVerifiedMfaFactor()` verifica se **existe fator verificado cadastrado**, não se a **sessão atual** tem `aal2`
- Um usuário pode ter MFA cadastrado mas estar em sessão `aal1` (login sem MFA)
- `getAuthAssuranceLevel()` lê `claims.aal` do JWT atual - **ESTE É O CORRETO**

**Correção necessária:** `adminGuard` deve usar `getAuthAssuranceLevel() === "aal2"` em vez de `hasVerifiedMfaFactor()`.

---

## Revogação de Sessão

### Tipos de Revogação

| Tipo | Escopo | Método | Uso |
|------|--------|--------|-----|
| Logout Local | Dispositivo atual | `signOut({ scope: "local" })` | Logout padrão |
| Logout Global | Todos dispositivos | `signOut({ scope: "global" })` | Revogação total |
| Revogação por Admin | Usuário alvo | `admin.auth.admin.revokeRefreshTokens(userId)` | Segurança |
| Troca de Senha | Sessões do usuário | Automático no Supabase* | Segurança |

*Supabase invalida refresh tokens na troca de senha, mas access tokens JWT existentes permanecem válidos até expiração (1h).

### Implementação Atual

```typescript
// src/app/api/auth/logout/route.ts:10
await supabase.auth.signOut({ scope: "local" });

// src/app/api/account/password/route.ts:47-49
const { error } = await supabase.auth.updateUser({ password });
// Não faz revogação explícita - Supabase invalida refresh tokens
```

### Gap Identificado (FIND-003)

- Logout padrão não revoga outras sessões
- Troca de senha não força logout imediato (access token válido até expiração)
- Não há endpoint para usuário revogar todas as próprias sessões

---

## Fluxos Completos

### Login (Email/Senha)

```
1. POST /api/auth/login { email, password }
2. csrfGuard + rateLimit
3. supabase.auth.signInWithPassword({ email, password })
4. Supabase retorna: { session: { access_token, refresh_token, user, expires_at }, user }
5. @supabase/ssr define cookies via setAll()
6. Response: { user } (sem tokens!)
7. Browser: cookies definidos, redirect /dashboard/videos
```

### Signup

```
1. POST /api/auth/signup { name, email, password }
2. csrfGuard + rateLimit
3. supabase.auth.signUp({ email, password, options: { data: { full_name: name }, emailRedirectTo } })
3. Se email confirmation desabilitado: session criada
   Se habilitado: session=null, user.confirmado=false
4. Response: { data: result.data, hasSession: Boolean(result.data.session) }
   ⚠️ PROBLEMA: result.data contém session com tokens!
5. Browser: se hasSession, cookies definidos via @supabase/ssr no callback
```

### Email Verification (PKCE)

```
1. Usuario clica link email: /auth/callback?code=xxx&next=/welcome
2. GET /auth/callback
3. supabase.auth.exchangeCodeForSession(code)
4. Supabase valida PKCE, cria session
5. @supabase/ssr define cookies
6. Redirect para next (/welcome ou /dashboard/videos)
```

### Password Reset

```
1. POST /api/auth/reset { email }
2. supabase.auth.resetPasswordForEmail(email, { redirectTo: /auth/callback?next=/reset-password })
3. Usuario recebe email, clica link → /auth/callback?code=xxx&next=/reset-password
4. GET /auth/callback → exchangeCodeForSession → cookies definidos → redirect /reset-password
5. GET /reset-password → formulário nova senha
6. POST /api/auth/update-password { password }
7. supabase.auth.updateUser({ password })
8. Supabase invalida refresh tokens do usuário
```

### MFA Enroll

```
1. POST /api/account/security { action: "enroll" }
2. supabase.auth.mfa.enroll({ factorType: "totp", friendlyName: "Prisma Player" })
3. Retorna: { factorId, qr_code, secret }
4. Frontend exibe QR
5. POST /api/account/security { action: "challenge", factorId }
6. supabase.auth.mfa.challenge({ factorId }) → { challengeId }
7. POST /api/account/security { action: "verify", factorId, challengeId, code }
8. supabase.auth.mfa.verify({ factorId, challengeId, code })
9. supabase.auth.refreshSession() → novo JWT com aal2
10. Cookies atualizados
```

### MFA Unenroll

```
1. POST /api/account/security { action: "unenroll", factorId }
2. Verifica aal2 via getAuthAssuranceLevel() (linha 70-73)
3. supabase.auth.mfa.unenroll({ factorId })
4. supabase.auth.refreshSession() → JWT atualizado (aal volta para aal1)
```

---

## Segurança dos Tokens

### Proteções Implementadas

1. **HttpOnly Cookies** - JavaScript não acessa tokens
2. **Secure Cookies** - Apenas HTTPS (produção)
3. **SameSite=Lax** - Proteção CSRF básica
4. **CSRF Guard** - Validação Origin/Referer em mutações
5. **Rate Limiting** - Por IP e por conta
6. **JWT Assinado** - RS256 pelo Supabase
7. **Refresh Token Rotation** - Previne replay
8. **Short Access Token** - 1h expiração

### Riscos Residuais

1. **Access Token em JWT** - Se vazado (XSS, logs), válido por até 1h
2. **Refresh Token em Cookie** - Se roubado (MITM, malware), permite renovação
3. **SameSite=Lax** - Não protege contra CSRF em navegação top-level (GET)
4. **MFA não obrigatório para admin APIs** - FIND-001
5. **Logout não revoga global** - FIND-003

---

## Testes de Validação

### Cookies em Produção

```bash
# Verificar flags dos cookies de auth
curl -I https://prisma-player.vercel.app/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@test.com","password":"test1234"}' \
  -c cookies.txt -v

# Verificar Set-Cookie headers
grep "Set-Cookie" cookies.txt
# Esperado: HttpOnly; Secure; SameSite=Lax; Path=/
```

### JWT Claims

```javascript
// No browser console (após login)
const cookie = document.cookie.split('; ').find(c => c.startsWith('sb-'));
// Cookie é HttpOnly - não acessível via JS!

// Via Next.js server component:
const supabase = await createClient();
const { data } = await supabase.auth.getClaims();
console.log(data.claims); // Verificar aal, role, sub
```

### MFA Assurance Level

```typescript
// Testar se adminGuard valida aal2
const aal = await getAuthAssuranceLevel();
// Deve retornar "aal2" após MFA verify
// Deve retornar "aal1" após login sem MFA
```

### Refresh Token Rotation

```bash
# 1. Login
# 2. Aguardar 1h+ (ou reduzir JWT expiry no Dashboard para teste)
# 3. Fazer request autenticada
# 4. Verificar se novo access_token emitido (cookie atualizado)
# 5. Tentar usar access_token antigo → deve falhar
```

---

## Configuração Recomendada Supabase Dashboard

### Authentication → Settings

| Configuração | Valor Recomendado | Justificativa |
|--------------|-------------------|---------------|
| JWT Expiry | 3600 (1h) | Equilíbrio segurança/UX |
| Refresh Token Rotation | Enabled | Previne replay |
| Refresh Token Reuse Interval | 10s | Janela para concorrência legítima |
| Enable Signup | On | Produto requer cadastro |
| Email Confirmation | On | Segurança (evita contas fake) |
| Secure Email Change | On | Previne takeover |
| Enable Phone Signup | Off | Não usado |
| Phone Confirmation | Off | Não usado |

### Authentication → Providers

| Provider | Status | Configuração |
|----------|--------|--------------|
| Email | Enabled | Double confirm off (magic link off) |
| Google | Disabled | Não usado atualmente |
| GitHub | Disabled | Não usado atualmente |

### Authentication → MFA

| Configuração | Valor |
|--------------|-------|
| Enable MFA | On |
| TOTP Issuer | "Prisma Player" |

---

## Comandos de Teste Automatizado

```bash
# Executar testes existentes
npm test

# TypeScript check
npx tsc --noEmit

# Build de produção
npm run build

# Lint
npm run lint
```

### Casos de Teste Manuais Críticos

| Cenário | Resultado Esperado |
|---------|-------------------|
| Acessar `/dashboard` sem login | Redirect `/login?next=/dashboard` |
| Login inválido | 401, mensagem genérica |
| Login válido | Cookies definidos, redirect `/dashboard/videos` |
| Acessar `/admin` sem MFA | Redirect `/dashboard/settings?section=security&adminMfa=required` |
| Acessar `/admin` com MFA | Sucesso |
| POST `/api/admin/users/plan` sem MFA | **ATUAL: 200 OK (BUG)** → **ESPERADO: 403** |
| POST `/api/admin/users/plan` com MFA | 200 OK |
| Logout → acessar `/dashboard` | Redirect `/login` |
| Login em 2 dispositivos → logout em 1 | **ATUAL: Outro dispositivo continua logado** → **ESPERADO: Opcional revogação global** |
| Signup → verificar response | Não deve conter access_token/refresh_token |
| MFA enroll → verify → aal2 no JWT | `claims.aal === "aal2"` |
| MFA unenroll → aal1 no JWT | `claims.aal === "aal1"` |