# Vulnerabilidades Confirmadas e Classificação Final

## Críticas (Devem ser corrigidas imediatamente)

### FIND-001: MFA não exigido em APIs administrativas
- **Arquivo:** `src/lib/api/admin-guard.ts:20-29`
- **Evidência:** `adminGuard()` valida apenas `app_metadata.role === "admin"` via `getCurrentAdminUser()`. Não verifica `aal2` ou fator MFA verificado na sessão atual.
- **Impacto:** Admin autenticado sem MFA pode executar operações privilegiadas via API (trocar planos, ajustar créditos, gerenciar suporte, alterar papéis).
- **Exploração:** Login admin → chamar `/api/admin/*` diretamente sem passar pelo fluxo MFA da UI.
- **Correção:** Adicionar validação `aal2` no `adminGuard` usando `supabase.auth.getClaims()` e verificar `claims.aal === "aal2"`.

### FIND-002: Exposição de tokens de sessão no cadastro
- **Arquivo:** `src/app/api/auth/signup/route.ts:43`
- **Evidência:** `return NextResponse.json({ data: result.data, hasSession: Boolean(result.data.session) })` onde `result.data` contém `session: { access_token, refresh_token, user, ... }`
- **Impacto:** Access token e refresh token expostos no response JSON desnecessariamente.
- **Exploração:** Interceptar response de cadastro → obter tokens válidos → acessar conta.
- **Correção:** Retornar apenas `{ user: result.data.user, hasSession: Boolean(result.data.session) }`.

---

## Altas (Devem ser corrigidas antes de produção)

### FIND-003: Logout não revoga sessões em outros dispositivos
- **Arquivo:** `src/app/api/auth/logout/route.ts:10`
- **Evidência:** `await supabase.auth.signOut({ scope: "local" })`
- **Impacto:** Sessão continua válida em outros dispositivos após logout.
- **Exploração:** Dispositivo comprometido permanece logado após logout no dispositivo principal.
- **Correção:** Adicionar endpoint `/api/auth/revoke-all-sessions` com `scope: "global"`. Manter logout padrão como `local` para UX.

### FIND-004: Validação de enum solta em `trial_status`
- **Arquivo:** `src/lib/access/service.ts:103`
- **Evidência:** `trialStatus: (row?.trial_status as AccountAccess["trialStatus"]) ?? "used"`
- **Impacto:** Valor inválido no banco (ex: `"active_xxx"`) seria aceito como trial ativo se truthy.
- **Exploração:** Manipulação direta do banco → trial status inválido concedendo acesso.
- **Correção:** Validar contra enum permitido: `["available", "active", "used", "expired"]`.

---

## Médias (Devem ser corrigidas no próximo sprint)

### FIND-005: CSRF aceita Referer como fallback
- **Arquivo:** `src/lib/security/csrf.ts:41-65`
- **Evidência:** `validateOrigin()` checa `origin` primeiro, depois `referer`. `Referer` pode ser spoofado ou ausente em alguns proxies.
- **Impacto:** Possível bypass CSRF em cenários onde `Origin` é removido.
- **Correção:** Para APIs sensíveis (`/api/admin/*`, `/api/account/password`, `/api/auth/*`), exigir `Origin` header obrigatório.

### FIND-006: Sessões admin com role desatualizado
- **Arquivo:** `src/app/api/admin/team/role/route.ts:39`
- **Evidência:** `admin.auth.admin.updateUserById(userId, { app_metadata: { ...target.app_metadata, role } })` atualiza no Supabase mas JWTs existentes mantêm role antigo até refresh.
- **Impacto:** Admin rebaixado continua com privilégios até expiração/refresh do JWT (até 1h).
- **Correção:** Documentar comportamento. Considerar invalidar sessões do usuário alvo em mudança de role crítica.

### FIND-007: Rate limit fallback pode ser permissivo
- **Arquivo:** `src/lib/security/rate-limit.ts:114-116`
- **Evidência:** Quando RPC falha e `failClosed: true`, retorna 429 com janela baseada no `windowMs` original. Quando `failClosed: false`, permite requisição.
- **Impacto:** Em falha do banco de rate limit, proteção pode ser reduzida.
- **Correção:** Verificar se todos endpoints críticos usam `failClosed: true`. Auditar logs de falha do rate limit.

---

## Baixas (Melhorias de hardening)

### FIND-008: Configuração de cookies dependente do Supabase Dashboard
- **Arquivo:** Configuração externa (Supabase Dashboard → Authentication → Settings)
- **Evidência:** Flags `HttpOnly`, `Secure`, `SameSite` dos cookies de auth definidas no painel.
- **Impacto:** Configuração incorreta no painel afeta segurança sem mudança no código.
- **Correção:** Documentar configuração recomendada: `HttpOnly: true`, `Secure: true` (produção), `SameSite: "lax"` (ou `"strict"` se compatível).

### FIND-009: Client-side rate limit apenas UX
- **Arquivo:** `src/lib/security/client-rate-limit.ts`
- **Evidência:** Usa `localStorage` para contar tentativas.
- **Impacto:** Attacker ignora client-side e bate direto na API.
- **Correção:** Documentar claramente. Garantir server-side robusto (já implementado).

---

## Informativas

### FIND-010: Middleware em `src/proxy.ts` (não `src/middleware.ts`)
- **Arquivo:** `src/proxy.ts:58-60`
- **Evidência:** `export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"] }`
- **Status:** Funcionando corretamente (padrão Next.js 15+). Nenhuma ação necessária.

---

## Matriz de Correção Priorizada

| Prioridade | Finding | Arquivo(s) | Estimativa |
|------------|---------|------------|------------|
| P0 | FIND-001 | `src/lib/api/admin-guard.ts` | 30 min |
| P0 | FIND-002 | `src/app/api/auth/signup/route.ts` | 15 min |
| P1 | FIND-003 | `src/app/api/auth/logout/route.ts` + novo endpoint | 45 min |
| P1 | FIND-004 | `src/lib/access/service.ts` | 30 min |
| P2 | FIND-005 | `src/lib/security/csrf.ts` + guards admin | 1h |
| P2 | FIND-006 | `src/app/api/admin/team/role/route.ts` + docs | 45 min |
| P2 | FIND-007 | `src/lib/security/rate-limit.ts` + verificação | 30 min |
| P3 | FIND-008 | Documentação | 30 min |
| P3 | FIND-009 | Documentação | 15 min |

---

## Riscos Residuais Após Correções

1. **JWT cache em mudança de role** - Até 1h de janela (mitigado: documentado, refresh forçado opcional)
2. **Revogação global não automática em troca de senha** - Supabase não invalida refresh tokens automaticamente (mitigado: endpoint manual)
3. **Cookies `SameSite: lax` em produção** - Padrão do Supabase, compatível com callbacks OAuth (mitigado: documentado)
4. **Rate limit depende de RPC no banco** - Falha do banco = fallback (mitigado: `failClosed: true` em endpoints críticos)