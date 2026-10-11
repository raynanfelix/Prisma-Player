# Segurança de Banco de Dados e RLS

## Visão Geral

O Prisma Player usa PostgreSQL via Supabase com Row Level Security (RLS) habilitado nas tabelas sensíveis. O acesso aos dados é mediado por:
1. **RLS Policies** - No banco, filtram linhas por `user_id`/`account_owner_id`
2. **Guards no Servidor** - Validação de sessão, role, plano, ownership
3. **Clientes Supabase** - `createClient()` (user context) vs `createAdminClient()` (service_role)

---

## Tabelas Principais e Isolamento

### Tabelas de Usuário e Autenticação

| Tabela | RLS | Policy Principal | Descrição |
|--------|-----|------------------|-----------|
| `profiles` | ✅ | `user_id = auth.uid()` | Perfil público do usuário |
| `account_access` | ✅ | `user_id = auth.uid()` | Status trial/assinatura |
| `subscriptions` | ✅ | `user_id = auth.uid()` | Assinaturas e planos |
| `account_teams` | ✅ | `owner_id = auth.uid()` | Equipes (owner) |
| `account_team_members` | ✅ | `user_id = auth.uid()` | Membros de equipe |
| `security_events` | ✅ | `user_id = auth.uid()` | Logs de segurança |

### Tabelas de Conteúdo

| Tabela | RLS | Policy Principal | Descrição |
|--------|-----|------------------|-----------|
| `videos` | ✅ | `user_id = auth.uid()` | Vídeos do usuário |
| `folders` | ✅ | `user_id = auth.uid()` | Pastas de organização |
| `video_events` | ✅ | `user_id = auth.uid()` | Analytics events |
| `player_configs` | ✅ | `user_id = auth.uid()` | Configurações de player |
| `ab_tests` | ✅ | `user_id = auth.uid()` | Testes A/B |

### Tabelas de Billing

| Tabela | RLS | Policy Principal | Descrição |
|--------|-----|------------------|-----------|
| `billing_plans` | ✅ | `is_active = true` (public read) | Planos disponíveis |
| `ai_credit_wallets` | ✅ | `user_id = auth.uid()` | Créditos de IA |
| `admin_audit_log` | ✅ | `admin_user_id = auth.uid()` + admin role | Auditoria admin |

### Tabelas de Suporte

| Tabela | RLS | Policy Principal | Descrição |
|--------|-----|------------------|-----------|
| `support_cases` | ✅ | `user_id = auth.uid()` OR admin | Tickets de suporte |
| `support_notes` | ✅ | Admin only | Notas internas |

---

## Verificação de Policies RLS

### Query para Listar Policies

```sql
SELECT 
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, policyname;
```

### Exemplo de Policy Padrão

```sql
-- videos table
CREATE POLICY "Users can manage own videos" ON videos
  FOR ALL USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- account_access table
CREATE POLICY "Users can view own access" ON account_access
  FOR SELECT USING (user_id = auth.uid());

-- billing_plans (public read)
CREATE POLICY "Anyone can view active plans" ON billing_plans
  FOR SELECT USING (is_active = true);
```

---

## Uso de `service_role` (Admin Client)

### Onde é Usado

| Arquivo | Operação | Justificativa |
|---------|----------|---------------|
| `src/lib/supabase/admin.ts` | `createAdminClient()` | Factory do cliente privilegiado |
| `src/lib/access/service.ts` | `getAccountAccess`, `getAccountPlan` | Lê dados cross-tenant para guards |
| `src/lib/access/team-context.ts` | `getTeamAccountContext` | Resolve team/role cross-tenant |
| `src/lib/security/auth-events.ts` | `recordAuthFailure` | Log de segurança |
| `src/lib/security/rate-limit.ts` | `consumeRateLimit` | RPC `consume_rate_limit` |
| `src/app/api/admin/*` | Todas operações admin | Cross-tenant por design |
| `src/app/api/webhooks/abacatepay` | Processar webhook | Valida assinatura, atualiza subscription |

### Riscos do `service_role`

1. **Bypass RLS** - Ignora todas as policies
2. **Acesso Total** - Pode ler/escrever qualquer tabela
3. **Responsabilidade do Código** - Filtragem de tenant deve ser explícita no código

### Padrão Seguro Atual

```typescript
// SEMPRE filtrar por accountOwnerId/userId mesmo com admin client
const admin = createAdminClient();
const { data } = await admin
  .from("videos")
  .select("*")
  .eq("user_id", guard.account.accountOwnerId)  // ← FILTRO OBRIGATÓRIO
  .eq("id", videoId)
  .single();
```

**Verificado:** Todas as rotas auditadas seguem este padrão.

---

## Funções RPC e `SECURITY DEFINER`

### Funções Identificadas

| Função | Tipo | Propósito | `SECURITY DEFINER`? |
|--------|------|-----------|---------------------|
| `consume_rate_limit` | RPC | Rate limiting atômico | Provavelmente sim |
| `cleanup_rate_limits` | RPC | Limpeza expirados | Provavelmente sim |
| Triggers de `account_teams` | Trigger | Cria team no signup | Sim (padrão Supabase) |

### Verificação Necessária

```sql
-- Verificar functions com SECURITY DEFINER
SELECT 
  n.nspname as schema,
  p.proname as function_name,
  p.prosecdef as security_definer,
  pg_get_functiondef(p.oid) as definition
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'public'
AND p.prosecdef = true;
```

### Boas Práticas para `SECURITY DEFINER`

1. **Fixar `search_path`** - `SET search_path = public, pg_temp`
2. **Validar inputs** - Nunca confiar em parâmetros não validados
3. **Princípio menor privilégio** - Apenas operações necessárias
4. **Auditoria** - Log de chamadas sensíveis

---

## Grants e Privilégios

### Roles Padrão Supabase

| Role | Descrição | Uso no Prisma Player |
|------|-----------|---------------------|
| `anon` | Não autenticado | Acesso público (billing_plans, embed) |
| `authenticated` | Usuário logado | RLS policies usam `auth.uid()` |
| `service_role` | Admin total | `createAdminClient()` apenas |
| `supabase_auth_admin` | Auth admin | `admin.auth.admin.*` methods |

### Grants Personalizados

```sql
-- Verificar grants customizados
SELECT 
  grantee,
  table_name,
  privilege_type
FROM information_schema.table_privileges
WHERE table_schema = 'public'
AND grantee NOT IN ('postgres', 'supabase_admin', 'anon', 'authenticated', 'service_role')
ORDER BY table_name, grantee;
```

---

## Auditoria de Operações Administrativas

### Tabela `admin_audit_log`

```sql
CREATE TABLE admin_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_user_id UUID NOT NULL REFERENCES auth.users(id),
  action TEXT NOT NULL,
  target_user_id UUID REFERENCES auth.users(id),
  details JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- RLS: apenas admins veem seus próprios logs
CREATE POLICY "Admins can view own audit logs" ON admin_audit_log
  FOR SELECT USING (
    admin_user_id = auth.uid() 
    AND EXISTS (SELECT 1 FROM auth.users WHERE id = auth.uid() AND app_metadata->>'role' = 'admin')
  );
```

### Operações Auditadas

| Operação | Action | Detalhes |
|----------|--------|----------|
| Trocar plano usuário | `plan_change` | plan_slug, previous_status, reason, provider_warning |
| Ajustar créditos | `credit_adjust` | amount, reason |
| Alterar role team | `team_role_changed` | from, to |
| Abrir caso suporte | `support_case_opened` | case_id |
| Atualizar caso suporte | `support_case_updated` | case_id, campos alterados |

---

## Verificações de Segurança Pendentes

### 1. Enum `trial_status` Valores Válidos

```sql
-- Verificar valores existentes
SELECT DISTINCT trial_status FROM account_access;

-- Valores esperados: 'available', 'active', 'used', 'expired'
-- Se houver valores inesperados → risco FIND-004
```

### 2. Policies que Permitem Acesso Amplo

```sql
-- Buscar policies sem filtro de user_id
SELECT * FROM pg_policies
WHERE schemaname = 'public'
AND (qual IS NULL OR qual NOT LIKE '%auth.uid()%')
AND tablename NOT IN ('billing_plans');  -- exceto tabelas públicas legítimas
```

### 3. Funções `SECURITY DEFINER` sem `search_path` fixo

```sql
-- Verificar
SELECT proname, pg_get_functiondef(oid)
FROM pg_proc
WHERE prosecdef = true
AND pronamespace = 'public'::regnamespace
AND pg_get_functiondef(oid) NOT ILIKE '%search_path%';
```

### 4. Tabelas sem RLS Habilitado

```sql
SELECT tablename
FROM pg_tables
WHERE schemaname = 'public'
AND tablename NOT IN (
  SELECT tablename FROM pg_policies WHERE schemaname = 'public'
)
AND tablename NOT LIKE 'pg_%'
AND tablename NOT LIKE 'sql_%';
```

---

## Testes de Isolamento de Tenant

### Cenários de Teste

| Teste | Descrição | Resultado Esperado |
|-------|-----------|-------------------|
| User A lê vídeo de User B via API | `GET /api/videos/{id_B}` com token User A | 404 (não 403) |
| User A atualiza vídeo de User B | `PATCH /api/videos/{id_B}` com token User A | 404 |
| User A deleta vídeo de User B | `DELETE /api/videos/{id_B}` com token User A | 404 |
| User A lista vídeos | `GET /api/videos` com token User A | Apenas vídeos de A |
| Admin lê vídeo de User B | `GET /api/admin/...` com token Admin | 200 (cross-tenant intencional) |
| Service role query sem filtro | Código usa admin client sem `.eq("user_id", ...)` | **FALHA DE SEGURANÇA** |

### Query de Validação Manual

```sql
-- Simular query do guard com accountOwnerId
SET ROLE authenticated;
SET request.jwt.claims = '{"sub": "user-a-uuid"}';

-- Deve retornar apenas vídeos do user-a
SELECT * FROM videos WHERE user_id = 'user-a-uuid';

-- Tentar acessar vídeo do user-b (deve retornar 0 rows)
SELECT * FROM videos WHERE user_id = 'user-b-uuid';
```

---

## Migração de Schema (Se Necessária)

### Adicionar Constraint em `trial_status` (Para FIND-004)

```sql
-- APENAS APÓS VALIDAÇÃO E APROVAÇÃO
-- 1. Verificar valores atuais
SELECT DISTINCT trial_status FROM account_access;

-- 2. Corrigir valores inválidos se houver
UPDATE account_access 
SET trial_status = 'used' 
WHERE trial_status NOT IN ('available', 'active', 'used', 'expired');

-- 3. Adicionar constraint
ALTER TABLE account_access 
ADD CONSTRAINT trial_status_valid 
CHECK (trial_status IN ('available', 'active', 'used', 'expired'));
```

### Adicionar Índice em `security_events` para Auditoria

```sql
CREATE INDEX IF NOT EXISTS idx_security_events_user_created 
ON security_events (user_id, created_at DESC);
```

---

## Checklist de Hardening Banco

- [ ] RLS habilitado em todas tabelas sensíveis
- [ ] Policies filtram por `auth.uid()` ou `account_owner_id`
- [ ] `service_role` usado apenas onde necessário (admin, webhooks, rate limit)
- [ ] Todas queries com admin client filtram por tenant explicitamente
- [ ] `admin_audit_log` captura operações críticas
- [ ] Funções `SECURITY DEFINER` têm `search_path` fixo
- [ ] Enum `trial_status` validado (constraint ou código)
- [ ] Grants mínimos necessários
- [ ] Backup e point-in-time recovery configurados
- [ ] Logs de auditoria do PostgreSQL habilitados (pgaudit se disponível)

---

## Riscos Residuais

1. **RLS não substitui autorização no servidor** - APIs devem validar ação e recurso
2. **`service_role` vazado = acesso total** - Guardar apenas em Vercel Environment Variables
3. **Migração de role admin não invalida JWTs existentes** - Janela de até 1h
4. **Rate limit depende de RPC no banco** - Falha do banco = fallback