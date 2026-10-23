# Validação do relatório de segurança externo (23/10/2026)

FONTE: auditoria independente do agente de segurança do dono (2 críticos + 11 médios + 7 a validar + 1 refutado, com file:line). OBJETIVO: veredito por alegação contra o HEAD ATUAL (após 130e0e1) — TRUE (válido, com file:line atual), STALE (válido no passado, já corrigido — citar o commit/fix), FALSE (não reproduz no código). SEM FIXES — validação apenas, evidência primeiro.

## Críticos
C1. Muro do embed contornável por script: proxy.ts:89-99 (cookie pp_embed) → page.tsx:11-15 → embed-origin.ts:84-87 (origin token com host escolhido) → embed/[id]/route.ts:210,238 (URLs R2 assinadas no CORPO). Validar cadeia inteira e conferir se geo/VPN/paywall dependem só disso.
C2. metaCapiToken no config público: embed/[id]/route.ts:124,238 vs manifest/route.ts:57-67 (que filtra) + postMessage em EmbedPlayer.tsx:98,105. Confirmar vazamento e todos os segredos que saem sem filtro (googleAdsApiSecret? tiktokAccessToken? webhookUrl?).

## Médios (validar cada um, file:line atual)
M1. Escalonamento admin por convite (team.ts:350 vs 399)
M2. Apagão LGPD incompleto: tokens de integração/churn/webhooks persistem ao delete — E conferir se o Stripe-cancel já está coberto (espero STALE aqui: fix 130e0e1)
M3. SSO-only travado fora do apagão
M4. Quota de assentos TOCTOU com catch morto (team.ts)
M5. Ingestão de analytics sem teto agregado (ab-events)
M6. Objetos R2 órfãos sem cleanup (vídeos deletados)
M7. Integrações editáveis por papel sem paid
M8. Open redirect no callback (auth/callback/route.ts)
M9. Teto de streams furável por rotação de identidade (session route)
M10. Nonce de CSP quebrado — SE VERDADEIRO é o mais urgente de tudo (páginas autenticadas quebrando? CAVAR: o nonce do CSP middleware vs scripts inline)
M11. (lista diz 11 — o décimo primeiro implícito; reportar o que encontrar de adjacente na mesma leitura)

## Os 7 a validar ( Managed/plataforma )
V1. Revogação de sessões no reset | V2. currentPassword vazio | V3. Sessão pré-verificação | V4. CSRF do catch-all do SDK (auth/[...path]) | V5. success_url do Stripe | V6. callbackURL do OTP | V7. Resíduo de sessão OTP

## Método
- Cada alegação: leitura independente do código atual, contexto completo do arquivo (não só a linha citada), e veredito TRUE/STALE/FALSE com evidência file:line atual. Onde STALE, citar o commit que corrigiu.
- Extra: listar qualquer achado NOVO grave que a leitura contextual revelar (sem caçar o repo inteiro).
- Output: docs/reports/SECURITY_AUDIT_VALIDATION.md com tabela por alegação + seção "top prioridades reais no HEAD atual".
- Regras: SEM fixes, SEM push, sem tocar em código. Set-Content proibido com acentos. Sem travessões em texto novo.
