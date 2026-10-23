# Segurança — Prisma Player

## ⚠️ NUNCA commite estes dados

### Secrets e chaves privadas
- ❌ `NEON_AUTH_COOKIE_SECRET`
- ❌ `EMBED_ORIGIN_SECRET`
- ❌ `CLOUDFLARE_PURGE_SECRET` / `SHARED_PURGE_SECRET`
- ❌ `STRIPE_SECRET_KEY` (use restricted key `rk_` no env — nunca em código)
- ❌ `STRIPE_WEBHOOK_SECRET`
- ❌ `ALERT_WEBHOOK_URL` (webhook privado de alertas operacionais)
- ❌ `META_CAPI_TOKENS_JSON` / `TIKTOK_EVENTS_TOKENS_JSON` (tokens CAPI por pixel)
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
- ✅ `NEXT_PUBLIC_SITE_URL` → URL do app
- ✅ `NEXT_PUBLIC_NEON_REALTIME_URL` → URL pública do WebSocket de Realtime do Neon (a URL é pública; o secret dela não)

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
- `STRIPE_WEBHOOK_SECRET` diferente entre sandbox e produção (e entre endpoints)

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
- `STRIPE_SECRET_KEY` → apenas nas rotas de billing no servidor (restricted key `rk_`)
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
- O filtro por `accountOwnerId` em toda query é a barreira principal; a RLS
  do schema Neon é defesa em profundidade (ainda não validada contra o JWT
  real de produção: `docs/SCALE_RUNBOOK.md` §d). Revisar com
  `tests/server-boundary.test.ts` + testes de IDOR.

## Isolamento verificado (auditoria de respostas de API — 20/10/2026)

Pass de dados cross-user da spec Billing Completo (item 6): grep das rotas
que devolvem `config`/dados por conta — resultado por rota auditada. Sem
alteração de código: todas já seguem o padrão dono-da-sessão.

| Rota | O que devolve | Verificado |
| --- | --- | --- |
| `GET /api/integrations` | `config` **mascarado** (`maskIntegrationConfig`): tokens e webhook URLs saem como `""` com flags `hasToken`/`hasWebhookUrl`; queries por `accountOwnerId` | ✅ segredo nunca chega ao cliente |
| `GET /api/player-configs` | `config` do próprio dono — filtro `(videoId, accountOwnerId)`; sem tokens na resposta (pixels são IDs públicos) | ✅ sem segredo, sem cross-user |
| `PUT/POST /api/player-configs` | `config` normalizado; `assets` restringidos a caminhos da própria conta (`ownedAssetPaths`) | ✅ não assina arquivo alheio |
| `GET /api/account/export` | dump LGPD do **próprio usuário** (`getCurrentUserId()`); toda query `.where(eq(..., userId))`; sem eventos de espectadores | ✅ só dono, só dados próprios |
| `GET /api/videos/[id]`, `GET /api/player-pixels/diagnostics` | `player_configs.config` lido com filtro `(videoId, accountOwnerId)`; `capiToken` usado só no servidor (resposta devolve boolean, nunca o token) | ✅ sem cross-user, sem token |
| `/api/embed/[id]`(+`/manifest`) | `config` **publicado** do player (dado público por design) atrás de token HMAC de origem + nonce | ✅ por design, com binding de origem |
| `/api/billing/*` (checkout, portal, invoices, payment-method) | `stripe_customer_id` NUNCA sai na resposta — só `{url}`/`{invoices}`/`{card}`; queries por `accountOwnerId`; guard `manage` | ✅ sem vazamento de identificador de customer |

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
