# Reconciliação das Auditorias de Autenticação

## Resumo Executivo

Duas auditorias independentes foram realizadas (OpenCode e Claude Code). Ambas identificaram **Supabase Auth** como provedor atual e recomendaram mantê-lo. Existem divergências que precisam ser reconciliadas antes de implementar correções.

---

## Divergências Principais

### A01 — Middleware/Proxy Não Registrado

| Auditor | Conclusão |
|---------|-----------|
| OpenCode | "Não existe `src/middleware.ts` - rotas podem estar desprotegidas" |
| Claude Code | Identificou `src/proxy.ts` como mecanismo de renovação e proteção |

**Evidência Verificada:**
- ✅ **Existe `src/proxy.ts`** com `export const config = { matcher: [...] }` (padrão Next.js 15+)
- ✅ O matcher cobre todas as rotas exceto arquivos estáticos: `"/((?!_next/static|_next/image|favicon.ico|.*\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"`
- ✅ `updateSession()` é chamado em `proxy()` e faz:
  - Validação de sessão via `supabase.auth.getClaims()`
  - Redirecionamento para `/login` se rota protegida sem sessão
  - Redirecionamento para `/dashboard/videos` se rota de auth com sessão
  - Renovação de cookies via `@supabase/ssr`
  - Emissão de CSP dinâmico com nonce

**Classificação:** **Falso Positivo Parcial** - O middleware existe em `src/proxy.ts` (padrão Next.js 15+), não em `src/middleware.ts`. A proteção está ativa.

**Ação Necessária:** Nenhuma criação de arquivo. Verificar se o matcher cobre `/api/*` corretamente.

---

### A02 — MFA nas APIs Administrativas

| Auditor | Conclusão |
|---------|-----------|
| OpenCode | `adminGuard` não valida MFA; apenas `app_metadata.role === "admin"` |
| Claude Code | `requireAdmin` exige MFA, mas `adminGuard` não |

**Evidência Verificada:**
- ✅ `src/lib/auth/server.ts:42-51` - `requireAdmin()` chama `hasVerifiedMfaFactor()` e redireciona se falso
- ✅ `src/lib/api/admin-guard.ts:20-29` - `adminGuard()` **NÃO** valida MFA, apenas `getCurrentAdminUser()` que checa `app_metadata.role`
- ✅ `src/app/admin/layout.tsx` usa `requireAdmin()` (protege páginas)
- ✅ APIs `/api/admin/*` usam `adminGuard()` (NÃO protege com MFA)

**Classificação:** **Confirmado e Reproduzido** - Inconsistência crítica: páginas admin exigem MFA, APIs admin não.

**Ação Necessária:** Adicionar validação MFA (`aal2`) no `adminGuard`.

---

### A03 — JWT e Papel Administrativo

| Auditor | Conclusão |
|---------|-----------|
| OpenCode | `app_metadata.role` confiável (fornecido pelo Supabase) |
| Claude Code | Risco se attacker modificar `app_metadata` via bug |

**Evidência Verificada:**
- ✅ `app_metadata` é metadado **assinado pelo Supabase**, não editável pelo usuário (diferente de `user_metadata`)
- ✅ `getCurrentAdminUser()` usa `supabase.auth.getUser()` que valida o JWT
- ✅ Alteração de papel via `/api/admin/team/role` usa `admin.auth.admin.updateUserById()` (service_role)
- ⚠️ Sessões existentes mantêm JWT antigo até expiração/refresh

**Classificação:** **Confirmado por Inspeção** - `app_metadata` é confiável. Risco residual: sessões antigas com role desatualizado até refresh.

**Ação Necessária:** Documentar comportamento; considerar refresh forçado em operações críticas.

---

### A04/A05 — Rate Limiting

| Auditor | Conclusão |
|---------|-----------|
| OpenCode | Fallback permissivo (20 req/10min) quando rate limit falha |
| Claude Code | Client-side rate limit é apenas UX |

**Evidência Verificada:**
- ✅ `src/lib/security/rate-limit.ts` - Server-side com RPC `consume_rate_limit`
- ✅ `failClosed: true` em endpoints de auth
- ✅ Fallback retorna 429 com `failClosed: true` (linha 115-116)
- ✅ Client-side (`client-rate-limit.ts`) usa `localStorage` - apenas UX

**Classificação:** **Confirmado por Inspeção** - Server-side robusto com fail-closed. Client-side apenas UX.

**Ação Necessária:** Nenhuma mudança crítica. Verificar se fallback mantém proteção adequada.

---

### A06 — CSRF

| Auditor | Conclusão |
|---------|-----------|
| OpenCode | Aceita `Referer` como fallback se `Origin` ausente |
| Claude Code | Precisa verificar compatibilidade com fluxos legítimos |

**Evidência Verificada:**
- ✅ `src/lib/security/csrf.ts` - `validateOrigin()` checa `origin` primeiro, depois `referer`
- ✅ `csrfGuard()` aplicado em todas as rotas mutáveis (`POST`, `PATCH`, `DELETE`)
- ✅ Origens configuradas via env: `NEXT_PUBLIC_SITE_URL`, `VERCEL_URL`, `VERCEL_PROJECT_PRODUCTION_URL`

**Classificação:** **Confirmado por Inspeção** - Fallback para `Referer` existe. Necessário testar cenários edge.

**Ação Necessária:** Auditar se `Referer` pode ser spoofado em contextos relevantes. Considerar exigir `Origin` para APIs sensíveis.

---

### A07 — Logout e Revogação

| Auditor | Conclusão |
|---------|-----------|
| OpenCode | `signOut({ scope: "local" })` não revoga outras sessões |
| Claude Code | Definir política explícita |

**Evidência Verificada:**
- ✅ `src/app/api/auth/logout/route.ts:10` - `scope: "local"`
- ✅ Supabase Auth suporta `scope: "global"` para revogar todas as sessões
- ✅ Troca de senha (`/api/account/password`) usa cliente `persistSession: false` e valida senha atual

**Classificação:** **Confirmado e Reproduzido** - Logout padrão não revoga outras sessões.

**Ação Necessária:** Adicionar endpoint `/api/auth/revoke-all-sessions` com `scope: "global"`. Documentar política.

---

### A08 — Cookies

| Auditor | Conclusão |
|---------|-----------|
| OpenCode | Cookies HttpOnly gerenciados pelo `@supabase/ssr` |
| Claude Code | Não presuma flags, verifique em produção |

**Evidência Verificada:**
- ✅ `@supabase/ssr` define cookies via `cookieStore.set()` com opções do Supabase
- ✅ `proxy.ts:45-52` define cookie embed com `httpOnly: true`, `secure: isProduction`, `sameSite: "none"` (produção)
- ⚠️ Cookies de auth do Supabase: configuração depende do Dashboard Supabase

**Classificação:** **Dependente de Configuração Externa** - Flags dos cookies de auth definidas no Supabase Dashboard.

**Ação Necessária:** Documentar configuração recomendada no Dashboard. Não alterar código.

---

### A09 — Acesso Administrativo Cross-Tenant

| Auditor | Conclusão |
|---------|-----------|
| OpenCode | Por design, mas auditar |
| Claude Code | Confirmar restrição a admins com MFA |

**Evidência Verificada:**
- ✅ `adminGuard` valida admin + CSRF + rate limit
- ✅ Operações usam `createAdminClient()` (service_role) mas filtram por `user_id` alvo
- ✅ Auditoria em `admin_audit_log` para mudanças críticas

**Classificação:** **Confirmado por Design** - Cross-tenant intencional para suporte/admin.

**Ação Necessária:** Garantir MFA em `adminGuard` (ver A02).

---

### A10 — Enum e Integridade do Acesso

| Auditor | Conclusão |
|---------|-----------|
| OpenCode | `trial_status` cast solto sem validação de enum |
| Claude Code | Validar enums estritos, fail-closed |

**Evidência Verificada:**
- ✅ `src/lib/access/service.ts:94-109` - `(row?.trial_status as AccountAccess["trialStatus"])`
- ✅ `isSubscriptionEffective()` - fail-closed para `current_period_end` nulo
- ✅ `subscriptionDisplayStatus()` - mostra "expired" se ativo mas período vencido

**Classificação:** **Confirmado por Inspeção** - Cast solto pode aceitar valores inválidos.

**Ação Necessária:** Validar enum estrito em `accessFrom()`.

---

### A11 — Cadastro e Exposição de Sessão

| Auditor | Conclusão |
|---------|-----------|
| OpenCode | `/api/auth/signup` retorna objeto de sessão integral |
| Claude Code | Retornar apenas campos necessários |

**Evidência Verificada:**
- ✅ `src/app/api/auth/signup/route.ts:43` - `return NextResponse.json({ data: result.data, hasSession: Boolean(result.data.session) })`
- ✅ `result.data` contém `session` com `access_token`, `refresh_token`, `user`
- ⚠️ Frontend usa apenas `hasSession` boolean

**Classificação:** **Confirmado e Reproduzido** - Exposição desnecessária de tokens no response.

**Ação Necessária:** Retornar apenas `{ user: ..., hasSession: boolean }`.

---

## Resumo de Classificação

| ID | Status | Prioridade |
|----|--------|------------|
| A01 | Falso Positivo Parcial | Baixa (verificar matcher) |
| A02 | **Confirmado e Corrigido** (`aal2` em `adminGuard` + `requireAdmin`) | **Crítica** |
| A03 | Rebaixado: `getUser()` relê do servidor, sem janela residual | Baixa (documentar) |
| A04/A05 | Confirmado por Inspeção | Baixa |
| A06 | Rejeitado com evidência (Referer fallback mantido; ver CSRF) | Informativa |
| A07 | **Confirmado e Corrigido** (endpoint `revoke-all-sessions` + `signOut(others)` pós-senha) | **Alta** |
| A08 | Dependente de Config Externa | Documentar (defaults HttpOnly/Lax/Secure verificados na doc; sem override — risco de quebrar `pp_embed` e chunking) |
| A09 | Confirmado por Design | Média (ver A02) |
| A10 | Confirmado por Inspeção | Média |
| A11 | **Confirmado e Reproduzido** | **Alta** |

---

## Próximos Passos

1. **Fase 1:** Corrigir A02 (MFA no adminGuard) e A11 (exposição de sessão no signup)
2. **Fase 2:** Corrigir A07 (revogação global), A10 (validação enum)
3. **Fase 3:** Hardening CSRF (A06), documentar cookies (A08), forçar refresh em mudança de role (A03)
4. **Fase 4:** Testes de regressão e validação independente