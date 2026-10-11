# Segurança — Prisma Player

## ⚠️ NUNCA commite estes dados

### Secrets e chaves privadas
- ❌ `SUPABASE_SECRET_KEY` / `SUPABASE_SERVICE_ROLE_KEY`
- ❌ `EMBED_ORIGIN_SECRET`
- ❌ `CLOUDFLARE_PURGE_SECRET` / `SHARED_PURGE_SECRET`
- ❌ `ABACATEPAY_API_KEY`
- ❌ `ABACATEPAY_WEBHOOK_SECRET`
- ❌ `CRON_SECRET`
- ❌ `RESEND_API_KEY`
- ❌ `NVIDIA_API_KEY`
- ❌ `CLOUDFLARE_R2_ACCESS_KEY_ID`
- ❌ `CLOUDFLARE_R2_SECRET_ACCESS_KEY`

### Arquivos que nunca devem ser commitados
- ❌ `.env.local` (está no `.gitignore`)
- ❌ `.env.production.local`
- ❌ `.env.development.local`
- ❌ `cloudflare/**/.dev.vars` (secrets locais do Worker)
- ❌ `cloudflare/**/.wrangler/` (cache de build)

---

## ✅ O que PODE ser público

### URLs e chaves públicas (prefixo `NEXT_PUBLIC_`)
- ✅ `NEXT_PUBLIC_SUPABASE_URL` → URL pública do projeto Supabase
- ✅ `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` → chave anônima (permite RLS)
- ✅ `NEXT_PUBLIC_SITE_URL` → URL do app

### IDs de recursos (não são secrets)
- ✅ ID do namespace KV do Cloudflare (em `wrangler.toml`)
- ✅ URL do Worker Cloudflare (ex: `https://prisma-embed-cache.raynanbarbosa803.workers.dev`)
- ✅ Account ID do Cloudflare R2 (`CLOUDFLARE_R2_ACCOUNT_ID`)
- ✅ Nome do bucket R2 (`CLOUDFLARE_R2_BUCKET`)

---

## Configuração segura

### 1. Nunca reutilize secrets entre ambientes
Cada ambiente (development, preview, production) deve ter secrets independentes:
- `EMBED_ORIGIN_SECRET` diferente em dev e prod
- `CLOUDFLARE_PURGE_SECRET` diferente em preview e prod
- `ABACATEPAY_WEBHOOK_SECRET` diferente entre sandbox e produção

### 2. Rotação de secrets
Quando rotacionar um secret:
1. Gere um novo valor aleatório de 32+ bytes
2. Atualize no destino (Vercel, Worker, etc.)
3. Aguarde 5 minutos (cache de config expira)
4. Revogue o secret antigo

### 3. Geração de secrets seguros
Use um gerador criptograficamente seguro:

**PowerShell (Windows):**
```powershell
[System.Convert]::ToBase64String([System.Security.Cryptography.RandomNumberGenerator]::GetBytes(32))
```

**Bash/Linux/macOS:**
```bash
openssl rand -base64 32
```

**Node.js:**
```javascript
require('crypto').randomBytes(32).toString('base64')
```

### 4. Separação de secrets por função
- `SUPABASE_SECRET_KEY` → apenas para admin client (server-side)
- `EMBED_ORIGIN_SECRET` → apenas para tokens de embed/eventos
- `CLOUDFLARE_PURGE_SECRET` → apenas para invalidar cache Vercel↔Worker
- **Nunca** reutilize um secret entre funções diferentes

---

## Checklist de auditoria

Antes de cada commit, verifique:
- [ ] Nenhum arquivo `.env*.local` está sendo commitado
- [ ] Nenhum secret aparece em hardcode no código (use `process.env.VAR`)
- [ ] Todos os secrets sensíveis estão listados no `.gitignore`
- [ ] Documentação (`.md`) não contém valores reais de secrets (use placeholders como `<cole aqui>`)
- [ ] `NEXT_PUBLIC_*` contém apenas dados não-sensíveis (URLs públicas, flags booleanas)

Execute este comando para verificar:
```powershell
# Busca por possíveis vazamentos de secrets
Select-String -Path "src/**/*.ts","src/**/*.tsx" -Pattern "sk_|secret_|key_[a-z0-9]{32}" -CaseSensitive
```

Se encontrar algo, **NÃO commite**. Remova o valor e use variável de ambiente.

---

## Isolamento entre usuários (multi-tenant)

- Identidade vem **sempre da sessão** (`getCurrentUserId()`); IDs do body/URL
  identificam o objeto, nunca autorizam.
- Conta efetiva = `getTeamAccountContext(userId).accountOwnerId` (equipe
  própria sempre vence). Toda leitura/escrita filtra por esse dono.
- Papéis: `viewer` lê; `editor` edita; `admin` gerencia (nunca promove a
  `admin` sem ser `owner`); `owner` é o titular.
- RLS existe como rede de segurança, mas o servidor usa service-role: cada
  `.eq("user_id", ...)` esquecido é vazamento. Revisar com
  `tests/server-boundary.test.ts` + testes de IDOR.

## Padrão obrigatório para novas rotas

```ts
const gate = await guard(request, { csrf: true, role: "edit", paid: true });
if (!gate.ok) return gate.response;
const { account, plan } = gate; // account.accountOwnerId = dono
// ... serviço lib/* com .eq("user_id", account.accountOwnerId)
```

- Leitura pública/embed/telemetria: sem `guard`, mas com token HMAC
  (`originToken`/`eventToken` + nonce + cookie `pp_embed`) + rate limit.
- Webhooks: HMAC com `timingSafeEqual` + idempotência atômica; nunca CSRF.
- Respostas autenticadas: `cache-control: no-store/private`.

## Testes de segurança

- `tests/idor-paywall.test.ts` — 401/402/403/RBAC/CSRF via `guard()`.
- `tests/server-boundary.test.ts` — `server-only` + nenhum client importa
  módulo privilegiado.
- `tests/webhook-ssrf.test.ts` — IPv4/IPv6 proibidos vs públicos.
- `tests/security-hardening.test.ts` — traversal codificado, CSS, UUID, URL.
- `tests/embed-origin-binding.test.ts` — nonce, sessão, escopo A/B.

## Resposta a incidentes

Se um secret foi exposto (commit público, log, screenshot):

1. **Revogar imediatamente** o secret comprometido
2. **Gerar novo** secret e redistribuir
3. **Auditar logs** para uso suspeito do secret comprometido
4. **Reescrever histórico Git** se o secret está em commits públicos:
   ```bash
   # Use git-filter-repo ou BFG Repo-Cleaner, NÃO edite manualmente
   ```
5. **Notificar** a equipe e o provedor (se aplicável)

---

## Referências

- [OWASP Secrets Management Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Secrets_Management_Cheat_Sheet.html)
- [GitHub: Removing sensitive data](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/removing-sensitive-data-from-a-repository)
- [Cloudflare Workers: Secrets](https://developers.cloudflare.com/workers/configuration/secrets/)
- [Vercel: Environment Variables](https://vercel.com/docs/projects/environment-variables)
