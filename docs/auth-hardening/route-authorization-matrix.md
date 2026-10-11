# Matriz de Autenticação e Autorização das Rotas

## Legenda
- 🔒 **Auth**: Exige sessão válida
- 🛡️ **MFA**: Exige AAL2 (MFA verificado na sessão atual)
- 👑 **Admin**: Exige `app_metadata.role === "admin"`
- 💳 **Paid**: Exige trial ativo ou assinatura ativa
- 🔐 **CSRF**: Aplica `csrfGuard`
- 📊 **Rate Limit**: Aplica rate limiting server-side
- ✍️ **Mutação**: Modifica dados
- 🏢 **Tenant**: Verifica ownership/tenant (accountOwnerId)

---

## Rotas Públicas (Sem Auth)

| Método | Rota | Auth | MFA | Admin | Paid | CSRF | Rate Limit | Mutação | Tenant | Observações |
|--------|------|------|-----|-------|------|------|------------|---------|--------|-------------|
| GET | `/` | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | Landing page |
| GET | `/login` | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ (IP) | ❌ | ❌ | Redirect se autenticado |
| GET | `/signup` | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ (IP) | ❌ | ❌ | Redirect se autenticado |
| POST | `/api/auth/login` | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ (IP+conta) | ✅ | ❌ | Cria sessão |
| POST | `/api/auth/signup` | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ (IP+conta) | ✅ | ❌ | Cria usuário + sessão |
| POST | `/api/auth/reset` | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ (IP+email) | ✅ | ❌ | Envia email reset |
| GET | `/auth/callback` | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ | Troca code por sessão |
| POST | `/api/auth/update-password` | ❌* | ❌ | ❌ | ❌ | ✅ | ✅ | ✅ | ❌ | *Exige token de reset válido |
| GET | `/reset-password` | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ | Formulário nova senha |
| GET | `/pricing` | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | Página de planos |
| GET | `/terms` | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | Termos de uso |
| GET | `/privacy` | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | Política privacidade |
| GET | `/services` | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | Serviços |
| GET | `/about` | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | Sobre |
| POST | `/api/webhooks/abacatepay` | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ | ❌ | Webhook pagamento (assinatura) |
| GET | `/embed/[id]` | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ | Player embed (token próprio) |
| GET | `/api/embed/[id]` | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ | Config player embed |
| GET | `/api/embed/[id]/manifest` | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ | Manifest HLS |
| POST | `/api/analytics-events` | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ | ❌ | Eventos analytics (público) |
| POST | `/api/ab-events` | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ | ❌ | Eventos A/B (público) |

---

## Rotas de Usuário Autenticado (Dashboard)

| Método | Rota | Auth | MFA | Admin | Paid | CSRF | Rate Limit | Mutação | Tenant | Observações |
|--------|------|------|-----|-------|------|------|------------|---------|--------|-------------|
| GET | `/dashboard/*` | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | Layout protege via `requireUser` |
| GET | `/dashboard/videos` | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | Lista vídeos do owner |
| GET | `/dashboard/analytics` | ✅ | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ | ✅ | `AccessGate` verifica paid |
| GET | `/dashboard/analytics/[id]` | ✅ | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ | ✅ | `AccessGate` verifica paid |
| GET | `/dashboard/ab-tests` | ✅ | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ | ✅ | `AccessGate` verifica paid |
| GET | `/dashboard/intelligence` | ✅ | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ | ✅ | `AccessGate` verifica paid |
| GET | `/dashboard/conversions` | ✅ | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ | ✅ | `AccessGate` verifica paid |
| GET | `/dashboard/settings` | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | Livre (perfil, senha, MFA) |
| GET | `/dashboard/billing` | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | Livre (ver plano, faturas) |
| GET | `/dashboard/security` | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | MFA, sessões, eventos |
| GET | `/dashboard/support` | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | Tickets suporte |
| GET | `/dashboard/support/[id]` | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | Ticket específico |
| GET | `/studio` | ✅ | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ | ✅ | `AccessGate` verifica paid |
| GET | `/welcome` | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | Onboarding trial |

---

## APIs de Conta (Autenticado)

| Método | Rota | Auth | MFA | Admin | Paid | CSRF | Rate Limit | Mutação | Tenant | Guard Usado |
|--------|------|------|-----|-------|------|------|------------|---------|--------|-------------|
| GET | `/api/account/overview` | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | `getCurrentUserId` |
| GET | `/api/account/access` | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | `getCurrentUserId` |
| GET | `/api/account/profile` | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | `getCurrentUserId` |
| PATCH | `/api/account/profile` | ✅ | ❌ | ❌ | ❌ | ✅ | ✅ | ✅ | ✅ | `guard({csrf:true})` |
| GET | `/api/account/password` | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | `getCurrentUserId` |
| PATCH | `/api/account/password` | ✅ | ❌ | ❌ | ❌ | ✅ | ✅ | ✅ | ✅ | `guard({csrf:true})` + valida senha atual |
| DELETE | `/api/account/delete` | ✅ | ❌ | ❌ | ❌ | ✅ | ✅ | ✅ | ✅ | `guard({csrf:true})` |
| POST | `/api/account/export` | ✅ | ❌ | ❌ | ❌ | ✅ | ✅ | ❌ | ✅ | `guard({csrf:true})` |
| GET | `/api/account/inbox` | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | `getCurrentUserId` |
| GET | `/api/account/trial` | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | `getCurrentUserId` |
| POST | `/api/account/trial` | ✅ | ❌ | ❌ | ❌ | ✅ | ✅ | ✅ | ✅ | `guard({csrf:true, paid:false})` |
| GET | `/api/account/security` | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | `getCurrentUserId` |
| POST | `/api/account/security` | ✅ | ❌ | ❌ | ❌ | ✅ | ✅ | ✅ | ✅ | `guard({csrf:true})` + MFA ops |
| POST | `/api/account/team` | ✅ | ❌ | ❌ | ❌ | ✅ | ✅ | ✅ | ✅ | `guard({csrf:true, role:"manage"})` |

---

## APIs de Vídeos e Player (Autenticado + Paid)

| Método | Rota | Auth | MFA | Admin | Paid | CSRF | Rate Limit | Mutação | Tenant | Guard Usado |
|--------|------|------|-----|-------|------|------|------------|---------|--------|-------------|
| GET | `/api/videos` | ✅ | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ | ✅ | `guard({paid:true})` |
| POST | `/api/videos` | ✅ | ❌ | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ | `guard({csrf:true, paid:true})` |
| GET | `/api/videos/[id]` | ✅ | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ | ✅ | `guard({paid:true})` |
| PATCH | `/api/videos/[id]` | ✅ | ❌ | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ | `guard({csrf:true, paid:true})` |
| DELETE | `/api/videos/[id]` | ✅ | ❌ | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ | `guard({csrf:true, paid:true})` |
| POST | `/api/videos/[id]/duplicate` | ✅ | ❌ | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ | `guard({csrf:true, paid:true})` |
| POST | `/api/videos/[id]/multipart` | ✅ | ❌ | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ | `guard({csrf:true, paid:true})` |
| GET | `/api/analytics/[videoId]` | ✅ | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ | ✅ | `guard({paid:true})` |
| GET | `/api/analytics/[videoId]/live-logs` | ✅ | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ | ✅ | `guard({paid:true})` |
| POST | `/api/ai/analyze` | ✅ | ❌ | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ | `guard({csrf:true, paid:true})` |
| GET | `/api/player-configs` | ✅ | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ | ✅ | `guard({paid:true})` |
| POST | `/api/player-configs` | ✅ | ❌ | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ | `guard({csrf:true, paid:true})` |
| GET | `/api/player-pixels/diagnostics` | ✅ | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ | ✅ | `guard({paid:true})` |

---

## APIs de Billing (Autenticado + Paid/Parcial)

| Método | Rota | Auth | MFA | Admin | Paid | CSRF | Rate Limit | Mutação | Tenant | Guard Usado |
|--------|------|------|-----|-------|------|------|------------|---------|--------|-------------|
| GET | `/api/billing/status` | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | `getCurrentUserId` |
| POST | `/api/billing/checkout` | ✅ | ❌ | ❌ | ❌ | ✅ | ✅ | ✅ | ✅ | `guard({csrf:true})` |
| POST | `/api/billing/ai-credits/checkout` | ✅ | ❌ | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ | `guard({csrf:true, paid:true})` |
| POST | `/api/billing/cancel` | ✅ | ❌ | ❌ | ❌ | ✅ | ✅ | ✅ | ✅ | `guard({csrf:true})` |
| GET | `/api/checkout/result` | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | `requireUser` |

---

## APIs Administrativas (Admin + MFA REQUERIDO)

| Método | Rota | Auth | MFA | Admin | Paid | CSRF | Rate Limit | Mutação | Tenant | Guard Atual | Guard Necessário |
|--------|------|------|-----|-------|------|------|------------|---------|--------|-------------|------------------|
| GET | `/admin/*` | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | `requireAdmin` | ✅ OK |
| POST | `/api/admin/users/plan` | ✅ | ❌ | ✅ | ❌ | ✅ | ✅ | ✅ | Cross | `adminGuard` | **ADICIONAR MFA** |
| POST | `/api/admin/users/status` | ✅ | ❌ | ✅ | ❌ | ✅ | ✅ | ✅ | Cross | `adminGuard` | **ADICIONAR MFA** |
| POST | `/api/admin/credits/adjust` | ✅ | ❌ | ✅ | ❌ | ✅ | ✅ | ✅ | Cross | `adminGuard` | **ADICIONAR MFA** |
| POST | `/api/admin/plans/toggle` | ✅ | ❌ | ✅ | ❌ | ✅ | ✅ | ✅ | Cross | `adminGuard` | **ADICIONAR MFA** |
| POST | `/api/admin/team/role` | ✅ | ❌ | ✅ | ❌ | ✅ | ✅ | ✅ | Cross | `adminGuard` | **ADICIONAR MFA** |
| POST | `/api/admin/support/cases` | ✅ | ❌ | ✅ | ❌ | ✅ | ✅ | ✅ | Cross | `adminGuard` | **ADICIONAR MFA** |
| POST | `/api/admin/support/notes` | ✅ | ❌ | ✅ | ❌ | ✅ | ✅ | ✅ | Cross | `adminGuard` | **ADICIONAR MFA** |
| POST | `/api/admin/search` | ✅ | ❌ | ✅ | ❌ | ✅ | ✅ | ❌ | Cross | `adminGuard` | **ADICIONAR MFA** |
| POST | `/api/admin/seo/targets` | ✅ | ❌ | ✅ | ❌ | ✅ | ✅ | ✅ | Cross | `adminGuard` | **ADICIONAR MFA** |
| GET | `/api/dashboard-security` | ✅ | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | `getCurrentAdminUser` | **ADICIONAR MFA** |

---

## APIs de Pastas e Organização (Autenticado)

| Método | Rota | Auth | MFA | Admin | Paid | CSRF | Rate Limit | Mutação | Tenant | Guard Usado |
|--------|------|------|-----|-------|------|------|------------|---------|--------|-------------|
| GET | `/api/folders` | ✅ | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ | ✅ | `guard({paid:true})` |
| POST | `/api/folders` | ✅ | ❌ | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ | `guard({csrf:true, paid:true})` |
| PATCH | `/api/folders/[id]` | ✅ | ❌ | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ | `guard({csrf:true, paid:true})` |
| DELETE | `/api/folders/[id]` | ✅ | ❌ | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ | `guard({csrf:true, paid:true})` |

---

## APIs de Inteligência e IA (Autenticado + Paid)

| Método | Rota | Auth | MFA | Admin | Paid | CSRF | Rate Limit | Mutação | Tenant | Guard Usado |
|--------|------|------|-----|-------|------|------|------------|---------|--------|-------------|
| GET | `/api/intelligence/controls` | ✅ | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ | ✅ | `guard({paid:true})` |
| POST | `/api/intelligence/controls` | ✅ | ❌ | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ | `guard({csrf:true, paid:true})` |
| GET | `/api/intelligence/audience-exports` | ✅ | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ | ✅ | `guard({paid:true})` |
| POST | `/api/intelligence/audience-exports` | ✅ | ❌ | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ | `guard({csrf:true, paid:true})` |

---

## Resumo de Gaps Críticos

| Gap | Rotas Afetadas | Risco |
|-----|----------------|-------|
| MFA não exigido em `adminGuard` | Todas `/api/admin/*` (9 endpoints) | **CRÍTICO** - Admin sem MFA executa operações privilegiadas |
| `/api/dashboard-security` sem `adminGuard` | 1 endpoint | **ALTO** - Usa `getCurrentAdminUser` direto |
| `/api/auth/logout` sem revogação global | 1 endpoint | **MÉDIO** - Sessões persistem em outros dispositivos |
| `/api/auth/signup` expõe tokens | 1 endpoint | **ALTO** - Tokens vazados no response |

---

## Verificação de Ownership/Tenant

Todas as rotas que aceitam IDs do cliente (ex: `/api/videos/[id]`, `/api/folders/[id]`) devem:

1. Obter `accountOwnerId` via `getTeamAccountContext(userId)`
2. Filtrar query por `user_id = accountOwnerId` (ou `accountOwnerId` em tabelas compartilhadas)
3. Retornar 404 se recurso não encontrado (não 403 para não vazar existência)

**Exemplo correto** (`src/app/api/videos/[id]/route.ts`):
```typescript
const guard = await guard(request, { paid: true });
const video = await admin.from("videos").select("*").eq("id", id).eq("user_id", guard.account.accountOwnerId).single();
```

**Verificado:** Padrão consistente em todas as rotas auditadas.