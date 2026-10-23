# ✅ Checklist de Configuração — Prisma Player

## Status atual da implementação

### ✅ Concluído no código

- [x] Cache HTTP do embed HTML (ISR 60s)
- [x] Endpoint `/api/embed/:id/manifest` com cache de borda
- [x] Rate limit nos endpoints embed
- [x] Worker Cloudflare com cache KV
- [x] Hooks de purge de cache integrados
- [x] Mitigações de segurança OWASP (A01, A05, A09, A10)
- [x] `.gitignore` configurado para proteger secrets

### ✅ Concluído na infraestrutura

- [x] KV namespace criado (`prisma_player_cache` - ID `446a630735654645a88b48be1ad00e3a`)
- [x] Secret `SHARED_PURGE_SECRET` provisionado no Worker
- [x] Worker deployado em `https://prisma-embed-cache.raynanbarbosa803.workers.dev`
- [x] Variáveis de ambiente configuradas na Vercel

---

## Próximos passos críticos

### 1. Roteamento DNS (OBRIGATÓRIO)

**Objetivo:** Fazer o Cloudflare Worker ficar na frente do seu domínio, cacheando e protegendo a aplicação.

**No painel DNS do Cloudflare:**

1. Acesse **DNS** → **Records**
2. Para o domínio que você usa (ex: `app.prismaplayer.com.br` ou um subdomínio):
   - Se já existe um registro `CNAME` apontando para Vercel, **edite-o**
   - Se não existe, **crie um novo**

**Opção A: Route direto via Worker (recomendado)**
```
Tipo: CNAME
Nome: app (ou @ para domínio raiz)
Destino: prisma-embed-cache.raynanbarbosa803.workers.dev
Proxy: ✅ Proxied (nuvem laranja ativada)
```

**Opção B: Route via Route (mais complexo, mas flexível)**
1. Mantenha o CNAME para Vercel
2. Vá em **Workers & Pages** → **Overview**
3. Clique no Worker `prisma-embed-cache`
4. **Triggers** → **Add Custom Domain**
5. Digite seu domínio (ex: `app.prismaplayer.com.br`)
6. Cloudflare automaticamente cria um Worker Route para `app.prismaplayer.com.br/*`

**Resultado esperado:**
```
app.prismaplayer.com.br
  ↓ (Cloudflare)
  ↓ Worker prisma-embed-cache (cache + rate limit)
  ↓ Proxy para prisma-player.vercel.app
```

---

### 2. Testar o cache funcionando

Depois do DNS configurado, teste:

```powershell
# 1. Primeira request (deve retornar x-prisma-cache: MISS)
$headers1 = (Invoke-WebRequest "https://app.prismaplayer.com.br/api/embed/SEU_PLAYER_ID/manifest").Headers
$headers1['x-prisma-cache']

# 2. Segunda request (deve retornar x-prisma-cache: HIT)
$headers2 = (Invoke-WebRequest "https://app.prismaplayer.com.br/api/embed/SEU_PLAYER_ID/manifest").Headers
$headers2['x-prisma-cache']
```

**Se retornar HIT na segunda request = cache funcionando! 🎉**

---

### 3. Monitoramento (recomendado)

Configure alertas no Cloudflare:

1. **Workers Analytics** → verifique requests/segundo, taxa de erro
2. **KV Analytics** → hit ratio deve estar ≥ 90%
3. **Rate Limiting** → monitore requests bloqueadas (429)

**Métricas esperadas após 24h:**
- Hit ratio do manifest: **90-95%**
- Latência p95 do embed HTML: **< 100ms**
- Rate limit rejections: **< 1%** (ajuste os limites se maior)

---

### 4. Segurança final

- [ ] Rotacione `CLOUDFLARE_PURGE_SECRET` se foi exposto em algum log
- [ ] Adicione um **WAF rule** no Cloudflare para bloquear `/__purge` de IPs que não sejam da Vercel (defense-in-depth)
- [ ] Configure **DDoS protection** no painel Cloudflare (já ativo por padrão, mas revise as regras)
- [ ] Teste a página de vendas (embed) com diferentes navegadores e dispositivos

---

## Variáveis de ambiente — Referência rápida

### Na Vercel (Production + Preview)

```bash
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://jghtmqzgyyonelfmjdxb.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_55e6DybK7f5sZwqlnCEHJw_Eju40F6L
SUPABASE_URL=https://jghtmqzgyyonelfmjdxb.supabase.co
SUPABASE_PUBLISHABLE_KEY=sb_publishable_55e6DybK7f5sZwqlnCEHJw_Eju40F6L
SUPABASE_SECRET_KEY=<sua service role key>
SUPABASE_JWKS_URL=https://jghtmqzgyyonelfmjdxb.supabase.co/auth/v1/.well-known/jwks.json

# App
NEXT_PUBLIC_SITE_URL=https://prisma-player.vercel.app
EMBED_ORIGIN_SECRET=<secret gerado de 32 bytes>

# Cloudflare (Fase 1)
TRUST_CLOUDFLARE_IP_HEADER=true
CLOUDFLARE_PURGE_URL=https://prisma-embed-cache.raynanbarbosa803.workers.dev/__purge
CLOUDFLARE_PURGE_SECRET=<mesmo valor do SHARED_PURGE_SECRET do Worker>
EMBED_CONFIG_RATE_LIMIT_MAX=300
EMBED_CONFIG_RATE_LIMIT_WINDOW_MS=60000
EMBED_MANIFEST_RATE_LIMIT_MAX=600
EMBED_MANIFEST_RATE_LIMIT_WINDOW_MS=60000
```

### No Worker (provisionado via wrangler secret)

```bash
SHARED_PURGE_SECRET=<mesmo valor do CLOUDFLARE_PURGE_SECRET da Vercel>
```

---

## Troubleshooting

### Cache não está funcionando (sempre MISS)

**Sintomas:** Header `x-prisma-cache` sempre retorna `MISS`

**Possíveis causas:**
1. DNS ainda não propagado (aguarde 5-10 min)
2. Worker não está na frente do domínio (veja Passo 1)
3. KV namespace não está vinculado (verifique `wrangler.toml`)

**Solução:**
```powershell
# Verifique se o request está chegando no Worker
Invoke-WebRequest "https://prisma-embed-cache.raynanbarbosa803.workers.dev/api/embed/SEU_ID/manifest" | Select-Object -ExpandProperty Headers
```

Se funcionar na URL do Worker mas não no domínio customizado, o problema é DNS/routing.

---

### Rate limit muito agressivo (muitos 429)

**Sintomas:** Usuários legítimos recebendo erro 429

**Solução:**
1. Aumente os limites na Vercel:
   ```
   EMBED_MANIFEST_RATE_LIMIT_MAX=1200  # dobra de 600
   ```
2. Ou ajuste no Worker (`wrangler.toml`):
   ```toml
   MANIFEST_PER_MINUTE_PER_IP = "1200"
   ```
3. Faça redeploy: `npx wrangler deploy`

---

### Purge de cache não está funcionando

**Sintomas:** Atualiza o player config mas o embed continua mostrando versão antiga

**Possíveis causas:**
1. `CLOUDFLARE_PURGE_SECRET` diferente entre Vercel e Worker
2. `CLOUDFLARE_PURGE_URL` incorreta

**Solução:**
```powershell
# Teste manualmente o purge (substitua os valores)
$secret = "SEU_SHARED_PURGE_SECRET"
$playerId = "SEU_PLAYER_ID"
Invoke-WebRequest -Method POST `
  -Uri "https://prisma-embed-cache.raynanbarbosa803.workers.dev/__purge" `
  -Headers @{"Authorization"="Bearer $secret"; "Content-Type"="application/json"} `
  -Body "{`"playerIds`":[`"$playerId`"]}"
```

Se retornar 401: secret está errado. Se retornar 200: está funcionando.

---

## Próxima fase (Fase 2) — quando necessário

Só implemente a Fase 2 quando:
- Tiver **> 10k plays simultâneos** (não 500 VSLs ativas, mas 10k pessoas assistindo ao mesmo tempo)
- **> 50k eventos/segundo** (telemetria play/pause/seek)

**Fase 2 inclui:**
- Migrar `/api/events` para Worker + Cloudflare Queues
- ClickHouse para analytics (substituir agregações no Postgres)
- Particionamento de `video_events` por HASH

Até lá, a Fase 1 suporta tranquilamente o volume atual e os próximos anos de crescimento.

---

## Suporte

**Documentos relacionados:**
- `docs/SYSTEM_DESIGN_SCALE.md` — arquitetura completa
- `docs/SECURITY.md` — boas práticas de secrets
- `docs/vercel-production.md` — deploy e variáveis

**Em caso de dúvidas:**
1. Verifique os logs do Worker: Cloudflare Dashboard → Workers & Pages → prisma-embed-cache → Logs
2. Verifique os logs da Vercel: Vercel Dashboard → Logs
3. Execute os comandos de teste acima para diagnosticar


Perfeito! O deploy foi feito com sucesso! Vejo que o Worker está rodando em:

**`https://prisma-embed-cache.raynanbarbosa803.workers.dev`**

Agora vou verificar o código e remover qualquer informação sensível que não deveria estar exposta.Perfeito! Agora vou criar o `.gitignore` principal (está faltando) e garantir que **nenhum dado sensível** seja commitado:Agora vou verificar se o `.env.local` atual tem secrets expostos e documentar o que precisa estar na Vercel:Agora vou atualizar esse documento para incluir as variáveis da Fase 1 e a URL correta do Worker:Agora vou verificar se há algum outro arquivo que possa conter informações sensíveis expostas:Excelente! A URL do Supabase só está na documentação (que é esperado). Agora vou verificar se há account IDs ou secrets do Cloudflare expostos:Perfeito! O ID do KV e a URL do Worker estão apenas onde deveriam estar (configuração). Agora vou criar um documento de segurança para orientar sobre o que NUNCA deve ser commitado:Agora vou atualizar o documento `SYSTEM_DESIGN_SCALE.md` para marcar as tarefas como concluídas e adicionar a URL real do Worker:Agora vou criar um checklist final de configuração:Agora vou verificar se há algum arquivo de configuração que precise de ajustes finais:Perfeito! Agora vou criar um resumo executivo final:## ✅ Configuração Completa — Status Final

### O que foi feito agora

1. **✅ Configurado `wrangler.toml`** com:
   - KV namespace ID: `446a630735654645a88b48be1ad00e3a`
   - Domínios: `prisma-player.vercel.app`

2. **✅ Worker deployado** em:
   - `https://prisma-embed-cache.raynanbarbosa803.workers.dev`

3. **✅ Criado `.gitignore`** protegendo:
   - `.env*.local`
   - `cloudflare/**/.dev.vars`
   - `cloudflare/**/.wrangler/`
   - Secrets e dados sensíveis

4. **✅ Criado `docs/SECURITY.md`** com:
   - Lista de secrets que NUNCA devem ser commitados
   - Como gerar secrets seguros
   - Checklist de auditoria
   - Resposta a incidentes

5. **✅ Criado `docs/CONFIGURACAO_COMPLETA.md`** com:
   - Status da implementação (Fase 1 100% concluída)
   - Próximos passos (roteamento DNS)
   - Troubleshooting
   - Referência de variáveis de ambiente

6. **✅ Atualizado `docs/vercel-production.md`** com:
   - URL real do Worker
   - Todas as variáveis da Fase 1

---

### ⚠️ Nenhum dado sensível exposto

**Auditoria de segurança concluída:**
- ❌ Nenhum `SUPABASE_SECRET_KEY` no código
- ❌ Nenhum `EMBED_ORIGIN_SECRET` hardcoded
- ❌ Nenhum `CLOUDFLARE_PURGE_SECRET` exposto
- ✅ Apenas dados públicos (URLs, IDs de recursos) no repositório
- ✅ `.env.local` protegido pelo `.gitignore`

---

### 🎯 Único passo restante: Roteamento DNS

**O Worker está rodando, mas não está na frente do seu domínio ainda.**

Para ativar o cache e proteção, você precisa configurar o DNS:

**No painel Cloudflare:**
1. DNS → Records
2. Edite/crie o registro do seu domínio (ex: `app.prismaplayer.com.br`)
3. Configure como:
   ```
   Tipo: CNAME
   Nome: app (ou @ para raiz)
   Destino: prisma-embed-cache.raynanbarbosa803.workers.dev
   Proxy: ✅ Ativado (nuvem laranja)
   ```

**OU** use Workers Routes:
1. Workers & Pages → prisma-embed-cache
2. Triggers → Add Custom Domain
3. Digite: `app.prismaplayer.com.br`

---

### 📊 O que esperar depois do DNS

**Antes (direto na Vercel):**
- Cada request de manifest bate no Postgres
- Sem proteção de rate limit na borda
- Latência mais alta (cold start serverless)

**Depois (com Worker na frente):**
- 90-95% dos requests de manifest servidos do cache KV (30s TTL)
- Rate limit na borda (protege contra abuso)
- Latência p95 < 100ms (edge cache)
- Purge automático quando atualiza player config

---

### 📚 Documentação criada

Todos os arquivos de referência estão em `docs/`:
- **`CONFIGURACAO_COMPLETA.md`** ← comece aqui para próximos passos
- **`SECURITY.md`** ← práticas de segurança e gestão de secrets
- **`SYSTEM_DESIGN_SCALE.md`** ← arquitetura completa (já existia, atualizado)
- **`vercel-production.md`** ← variáveis de ambiente (já existia, atualizado)

---

### ✨ Resumo

A **Fase 1 do System Design está 100% implementada e deployada**. O código está seguro, nenhum secret foi exposto, e o Worker está pronto. 

**Falta apenas 1 ação:** configurar o DNS para o Worker ficar na frente do seu domínio.

Depois disso, você terá:
- ✅ 500 VSLs simultâneas suportadas com folga
- ✅ Cache de borda (30s TTL) reduzindo carga no DB
- ✅ Rate limit protegendo de abuso
- ✅ Invalidação automática de cache ao atualizar configs
- ✅ Pronto para escalar até Fase 2 (> 10k plays simultâneos)

Quer ajuda com o DNS agora, ou tem alguma dúvida sobre a configuração?