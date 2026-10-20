# Hardening Pós-Audit — spec de execução (19/10/2026)

Fonte: auditoria Lead (relatório entregue ao dono). Itens 1-5 obrigatórios; 6 se der tempo. Valide tsc+vitest após cada item. PowerShell Set-Content PROIBIDO em arquivos com acentos.

## 1. CI no GitHub Actions
`​.github/workflows/verify.yml` (push + PR em main): npm ci com cache → npx tsc --noEmit → npm run lint → npm test → node scripts/verify-quality-rules.mjs → npm audit --audit-level=high (falha só em high/critical). SEM build (a Vercel buildia todo push; CI fica rápido). Nome do job: "verify".

## 2. Tokens mascarados no GET de integrações (fim da exposição)
- `GET /api/integrations` e `src/app/dashboard/integracoes/page.tsx`: TODO campo marcado como secret no store-data (accessToken, botToken, apiSecret, webhookUrl — sim, webhook também é segredo de webhook) sai como `""` + `hasToken: true`/`hasWebhookUrl: true` quando preenchido. NUNCA o valor cru.
- `IntegrationDetail.tsx`: secrets NÃO pré-preenchidos no edit — placeholder "•••• preenchido — cole para trocar" quando hasXxx; campo vazio no submit = MANTER o valor salvo.
- `server.ts` (sanitize): nos providers com secret, campo vazio no input → preserva o valor ATUAL da instância (merge no upsertIntegration); campo preenchido → substitui. `withVerifyMeta` já faz esse padrão para lastVerifiedAt — copie o modelo.
- Atualizar tests existentes de integrações (o contrato do GET muda) + novo teste: GET nunca contém o token cru.

## 3. Suíte BOLA cross-tenant (a prova da API1)
`tests/bola-cross-tenant.test.ts` — fake-db com 2 contas (A e B) e objetos de cada uma. Para cada rota abaixo, sessão de A tentando objeto de B: **403/404, nunca 200 com dados de B**:
- GET/DELETE `/api/videos` (VSL de B por id)
- PUT/DELETE `/api/integrations` (vslIds de B → 403 vsl_not_owned; instanceId de B)
- PATCH `/api/intelligence/controls` (reportVideoIds de B)
- GET `/api/player-configs` / player-loader config de B
- POST `/api/account/*` de B
Padrão: mock do guard com conta A (o repo já tem esse padrão em tests/pixel-verify/route tests).

## 4. Rate limit default no guard
`lib/api/guard.ts`: depois do gate ok, se a rota NÃO chamou rateLimit ainda… (guard não sabe) → em vez disso: exportar `guardWithDefaultLimit` ou aplicar dentro do guard: `rateLimit(request, "guard:{ownerId}", {max:60, windowMs:60_000})` fail-OPEN (não travar usuário legítimo em pico; rotas críticas já têm seus próprios fail-closed). Aplicar dentro do guard = todas as rotas autenticadas ganham o teto. Rotas PÚBLICAS (sem sessão) não passam pelo guard — inalteradas (embed/loader têm seus tokens próprios).

## 5. Alerta operacional (fim do A09 silencioso)
`src/lib/security/alert-webhook.ts` (server-only + PRIVILEGED + regex no boundary): `alertOperations({ title, detail, kind })` — se `ALERT_WEBHOOK_URL` (Discord/Telegram/qualquer HTTPS que aceita JSON) existir → POST `{ content: "🚨 [Prisma] title — detail" }` fire-and-forget, timeout 3s, catch silencioso, REDACT: nunca incluir token/segredo no texto. Chamado em:
- webhook Stripe: evento marcado `failed` (antes do 500)
- webhook neon-auth: falha de assinatura/processamento
- rotas de billing (checkout/portal): catch de erro antes do 502/503
- `charge.dispute.created` / `radar.early_fraud_warning.created` (risk — já logado; ganha o alerta)
`.env.example`: ALERT_WEBHOOK_URL + nota (cole o webhook do seu Discord privado/Telegram).

## 6. (Se der tempo) Suspensão em disputa
`charge.dispute.created` no webhook Stripe → resolve subscription (charge.customer → profiles.stripe_customer_id → subscription ativa) → status `past_due` + alerta (item 5). `charge.refunded` → apenas alerta (reativação é decisão manual do dono). Se não der tempo: pendência, não faça pela metade.

## Fora de escopo
LGPD-audit (pipeline próprio), Metronome, reconcile job, MFA — fases seguintes.

## Validação final
tsc 0 · npm test (470+ com os novos) · eslint --quiet 0 · NÃO rode build · NÃO push · landing/pricing/auth/assets intocáveis.
