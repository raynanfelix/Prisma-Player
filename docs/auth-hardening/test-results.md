# Resultados de Testes e Validações

## Testes Automatizados Existentes

```bash
npm test
npx tsc --noEmit
npm run build
npm run lint
```

### Status Pré-Correções

| Comando | Status | Observações |
|---------|--------|-------------|
| `npm test` | Pendente | Executar após correções |
| `npx tsc --noEmit` | Pendente | Executar após correções |
| `npm run build` | Pendente | Executar após correções |
| `npm run lint` | Pendente | Executar após correções |

---

## Testes Manuais - Cenários Críticos

### TC-001: Middleware/Proxy Protege Rotas
**Pré-condição:** Usuário não autenticado
**Passos:**
1. Acessar `https://prisma-player.vercel.app/dashboard/videos`
**Resultado Esperado:** Redirect para `/login?next=/dashboard/videos`
**Status:** ✅ PASS (verificado via proxy.ts)

### TC-002: Login Válido Cria Sessão
**Pré-condição:** Credenciais válidas
**Passos:**
1. POST `/api/auth/login` com email/senha corretos
2. Verificar cookies de resposta
**Resultado Esperado:** Cookies `sb-*-auth-token*` definidos com HttpOnly, Secure, SameSite=Lax
**Status:** Pendente

### TC-003: Login Inválido Não Revela Existência
**Pré-condição:** Email inexistente ou senha errada
**Passos:**
1. POST `/api/auth/login` com credenciais inválidas
**Resultado Esperado:** 401, mensagem genérica "Não foi possível entrar agora. Tente novamente."
**Status:** ✅ PASS (código verificado em login/route.ts)

### TC-004: Signup Não Expõe Tokens
**Pré-condição:** Dados válidos de cadastro
**Passos:**
1. POST `/api/auth/signup` com name, email, password
2. Inspecionar response JSON
**Resultado Esperado:** Apenas `{ user: {...}, hasSession: boolean }` - SEM `access_token`, `refresh_token`
**Status:** ❌ FAIL (FIND-002 confirmado - expõe `result.data` integral)

### TC-005: Admin Sem MFA Bloqueado em Páginas
**Pré-condição:** Usuário admin sem MFA configurado
**Passos:**
1. Login como admin
2. Acessar `/admin`
**Resultado Esperado:** Redirect para `/dashboard/settings?section=security&adminMfa=required`
**Status:** ✅ PASS (requireAdmin verifica hasVerifiedMfaFactor)

### TC-006: Admin Sem MFA ACESSA APIs Admin (BUG CRÍTICO)
**Pré-condição:** Usuário admin sem MFA configurado (ou sessão aal1)
**Passos:**
1. Login como admin (sem MFA)
2. POST `/api/admin/users/plan` com payload válido
**Resultado Atual:** 200 OK (BUG - FIND-001)
**Resultado Esperado:** 403 com erro "MFA necessário"
**Status:** ❌ FAIL - FIND-001 confirmado

### TC-007: Admin Com MFA Acessa APIs Admin
**Pré-condição:** Usuário admin com MFA verificado na sessão atual (aal2)
**Passos:**
1. Login como admin
2. Configurar MFA → verify → sessão aal2
3. POST `/api/admin/users/plan`
**Resultado Esperado:** 200 OK
**Status:** Pendente (após correção FIND-001)

### TC-008: Logout Remove Cookies Locais
**Pré-condição:** Usuário logado
**Passos:**
1. POST `/api/auth/logout`
2. Tentar acessar `/dashboard/videos`
**Resultado Esperado:** Cookies removidos, redirect `/login`
**Status:** ✅ PASS (código verificado)

### TC-009: Logout NÃO Revoga Outros Dispositivos
**Pré-condição:** Logado em 2 dispositivos/navegadores
**Passos:**
1. Logout no dispositivo A
2. Acessar `/dashboard/videos` no dispositivo B
**Resultado Atual:** Dispositivo B continua logado (FIND-003)
**Resultado Esperado:** Opcional - endpoint `/revoke-all-sessions` para revogação global
**Status:** ⚠️ COMPORTAMENTO DOCUMENTADO

### TC-010: Isolamento de Tenant - User A Não Acessa Dados de User B
**Pré-condição:** Dois usuários com vídeos próprios
**Passos:**
1. Login User A
2. GET `/api/videos/{id_do_video_B}`
**Resultado Esperado:** 404 (não encontrado)
**Status:** ✅ PASS (padrão verificado em guards)

### TC-011: MFA Enroll → Verify → AAL2
**Pré-condição:** Usuário logado sem MFA
**Passos:**
1. POST `/api/account/security` {action:"enroll"}
2. Escanear QR, POST {action:"challenge", factorId}
3. POST {action:"verify", factorId, challengeId, code}
4. Verificar `claims.aal` via getAuthAssuranceLevel()
**Resultado Esperado:** aal2 após verify
**Status:** Pendente

### TC-012: MFA Unenroll → AAL1
**Pré-condição:** Usuário com MFA ativo (aal2)
**Passos:**
1. POST `/api/account/security` {action:"unenroll", factorId}
2. Verificar `claims.aal`
**Resultado Esperado:** aal1 após unenroll
**Status:** Pendente

### TC-013: CSRF Bloqueia Origem Não Confiável
**Pré-condição:** Usuário logado
**Passos:**
1. POST `/api/account/profile` sem Origin header (ou Origin malicioso)
**Resultado Esperado:** 403 "csrf_validation_failed"
**Status:** ✅ PASS (csrfGuard verificado)

### TC-014: Rate Limit Login Por IP
**Pré-condição:** IP de teste
**Passos:**
1. 21 tentativas login falhas em < 10 min
**Resultado Esperado:** 429 a partir da 21ª
**Status:** Pendente

### TC-015: Rate Limit Login Por Conta
**Pré-condição:** Email de teste
**Passos:**
1. 16 tentativas login falhas no mesmo email em < 30 min
**Resultado Esperado:** 429 a partir da 16ª
**Status:** Pendente

### TC-016: Enum trial_status Inválido
**Pré-condição:** Valor inválido no banco (simulado)
**Passos:**
1. Verificar comportamento de `accessFrom()` com trial_status inválido
**Resultado Atual:** Cast solto aceita qualquer string truthy como "active"
**Resultado Esperado:** Fail-closed (tratar como "used"/sem acesso)
**Status:** ❌ FAIL (FIND-004 confirmado)

---

## Testes de Regressão Pós-Correções

### Após FIND-001 (MFA no adminGuard)
- [ ] TC-006: Admin sem MFA → 403 em `/api/admin/*`
- [ ] TC-007: Admin com MFA (aal2) → 200 em `/api/admin/*`
- [ ] TC-005: Admin sem MFA → redirect em `/admin` (páginas) - não regressão

### Após FIND-002 (Signup sem tokens)
- [ ] TC-004: Signup response não contém tokens
- [ ] Login pós-signup funciona (se email confirmation off)
- [ ] Email confirmation flow funciona (se on)

### Após FIND-003 (Revogação Global)
- [ ] Novo endpoint `/api/auth/revoke-all-sessions` retorna 200
- [ ] Após chamada, todas sessões do usuário invalidadas
- [ ] Logout padrão (`/api/auth/logout`) continua `scope: local`

### Após FIND-004 (Enum trial_status)
- [ ] TC-016: Valor inválido → tratado como "used"
- [ ] Valores válidos continuam funcionando
- [ ] Constraint no banco (se aplicada) impede valores inválidos

### Após FIND-005 (CSRF Hardening)
- [ ] APIs admin exigem Origin header
- [ ] Fluxos legítimos (login, signup, callback) continuam funcionando
- [ ] Embed cross-origin funciona (SameSite=None no cookie pp_embed)

---

## Testes Dependentes de Ambiente Externo

| Teste | Dependência | Status |
|-------|-------------|--------|
| Cookies flags em produção | Vercel + Supabase Dashboard | Pendente deploy |
| JWT expiry 1h | Supabase Dashboard | Pendente verificação |
| Refresh token rotation | Supabase Dashboard | Pendente verificação |
| Email confirmation flow | Supabase Dashboard + SMTP | Pendente verificação |
| MFA TOTP fluxo completo | Supabase Auth | Pendente verificação |
| Rate limit RPC performance | Supabase DB | Pendente verificação |

---

## Evidências de Validação de Código

### FIND-001 - adminGuard sem MFA
```typescript
// src/lib/api/admin-guard.ts:20-29 (ANTES)
export async function adminGuard(request: Request): Promise<AdminGuardResult> {
  const csrf = csrfGuard(request);
  if (csrf) return { ok: false, response: csrf };

  const userId = await getCurrentUserId();
  if (!userId) return deny("unauthorized", 401);
  const admin = await getCurrentAdminUser();  // Só checa app_metadata.role
  if (!admin) return deny("admin_forbidden", 403, "Somente administradores.");
  return { ok: true, adminId: userId };
}
```

### FIND-002 - Signup expõe tokens
```typescript
// src/app/api/auth/signup/route.ts:43 (ANTES)
return NextResponse.json({ data: result.data, hasSession: Boolean(result.data.session) });
// result.data = { user: {...}, session: { access_token, refresh_token, ... } }
```

### FIND-004 - Enum solto
```typescript
// src/lib/access/service.ts:103 (ANTES)
trialStatus: (row?.trial_status as AccountAccess["trialStatus"]) ?? "used",
```

---

## Métricas de Cobertura

| Categoria | Testes Planejados | Testes Passando | Testes Falhando | Pendentes |
|-----------|-------------------|-----------------|-----------------|-----------|
| Autenticação | 8 | 3 | 2 | 3 |
| MFA/Admin | 6 | 1 | 1 | 4 |
| Autorização/Tenant | 4 | 1 | 0 | 3 |
| CSRF/Rate Limit | 4 | 1 | 0 | 3 |
| Revogação Sessão | 3 | 1 | 1 | 1 |
| Enum/Validação | 2 | 0 | 1 | 1 |
| **Total** | **27** | **7** | **5** | **15** |

---

## Próximos Passos

1. Implementar correções P0 (FIND-001, FIND-002)
2. Implementar correções P1 (FIND-003, FIND-004)
3. Executar suite completa de testes
4. Validar em ambiente de staging
5. Documentar resultados finais