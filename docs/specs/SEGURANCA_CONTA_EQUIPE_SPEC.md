# Segurança B — conta, equipe, LGPD e nits (23/10/2026)

EVIDÊNCIA: docs/reports/SECURITY_AUDIT_VALIDATION.md. Escopo DISJUNTO do agente SEC-A (embed/CAPI) e do billing (api/billing, cron, UserActions). NÃO tocar em: api/embed/**, api/player-configs, features/player, api/billing, lib/billing, lib/cron-tasks, UserActions.tsx, landing. M9 (teto de streams) fica pro front D (arquivo é do SEC-A). SEM travessões em textos. Set-Content proibido com acentos. Valide tsc+vitest por item.

## P1 — LGPD: UI de delete + resíduos do wipe (achado mais grave do validador)
1. UI: `/dashboard/settings` ganha "Zona de perigo - Apagar conta" (novo componente DangerZone no padrão dos panels: explica o que é apagado, pede confirmação digitando APAGAR, pede senha; chama /api/account/delete com {password, confirmation}). SEM travessões no copy.
2. SSO-only (sem senha): delete hoje exige signIn.email (delete:63-66) e SSO-only fica travado. Fluxo: se conta sem senha, exigir step-up por OTP de email (reuse o fluxo verify-email existente: o endpoint /api/auth/verify-email envia código; depois de verificado, o delete aceita {otpVerifiedToken?} — desenhe o mais simples REUSANDO o que existe: por exemplo, delete aceita OU senha OU session claim "emailVerifiedAt" recente setado pelo verify-email — inspecione como o verify-email marca sessão e reuse).
3. Resíduos no wipe (delete/route.ts): adicionar deletes de account_integrations (tokens!), billing_churn_surveys (feedback), invites pendentes com o email do titular (where invitedEmail = email), e scrub do payload PII de payment_webhook_events do user (update processing_error/payload → null onde userId relevante — inspecione as colunas; se não há userId, skip com pendência documentada).
4. Testes: delete apaga integrações/churn/invites; SSO-only path (sem senha → exige OTP recente); UI renderiza e chama a rota (happy-dom).

## P2 — M1: admin por convite
team.ts:350: convite com role admin só quando o INVITADOR é owner (alinhar com a regra de promoção :399); admin convida só não-admin. Rota team valida. Teste: admin convidando admin → 403; owner convidando admin → ok.

## P3 — M7: integrações exige papel + paid
api/integrations/route.ts (PUT/DELETE/verify: linhas 38,65,101): guard({csrf:true, role:"edit", paid:true}) — MESMAS opções do player-configs (trial conta como paid via guard). Teste: viewer sem paid → 403.

## P4 — M10: x-nonce nas rotas protegidas (dark mode morto)
lib/auth/session.ts:52-56: no branch protegido, propagar requestHeaders pro middleware do SDK (SDK descarta headers atuais — reconstrói; a causa raiz documentada é o x-nonce perdido). Fix mínimo: passar os headers da request original (com x-nonce setado pelo proxy ANTES do updateSession) adiante na chamada do SDK e conferir que a resposta final carrega o nonce (Next aplica nonce do CSP da resposta). Validação empírica que o validador usou: next start + ver ThemeScript com nonce em /dashboard. Faça a mudança, rode next start local com build existente SE rápido; senão documente o passo de verificação pro Lead. Não pode quebrar a sessão (fica cirúrgico; se o SDK rejeitar headers custom, documente e reverta).

## P5 — M4: TOCTOU de assentos + catch morto
team.ts:351-352: check + insert dentro de UMA transação com re-check no nível da transação (ou SELECT count ... FOR UPDATE não existe fácil — use db.transaction com count + insert e erro único tratado); catch:333-334: remover o código morto do trigger legacy OU tratar o erro real do check transacional. Teste: estourar assentos com concorrência simulada (2 inserts sequenciais dentro da mesma janela) — o segundo falha limpo com team_seat_limit_reached.

## P6 — M5: teto agregado na ingestão
api/ab-events + api/analytics-events: rate limit POR IP agregado (ex: 600/min/IP além do por-sessão existente) + amarrar sessionId do corpo ao sessionId do token quando o token carrega (analytics-events já amarra; ab-events:52-61 não — amarrar). Teste: 601º evento do mesmo IP → 429; sessionId divergente do token → 400.

## P7 — V7: resíduo de sessão OTP
api/account/password/route.ts:91-105: quando changePassword falha após signIn.emailOtp, destruir a sessão criada (authSignOut/signOut do SDK no catch OU revoke server-side) — inspecione o helper de sessão e use o mais simples. Teste: falha do change → sessão OTP morta (chamada de signOut feita).

## P8 — Docs stale
docs/neon-migration/neon-auth-setup.md seção 7.1: corrigir a frase falsa ("UI não lê token do reset" — falso desde 698656f) + nota das pendências Managed (V1 revogação no reset, V2 currentPassword — documentar como "pendente do Neon Auth gerenciado", sem inventar solução local impossível).

## Regras
Zero deps. tsc 0 + vitest (base 632+9 do billing em voo + seus) + lint 0. Sem build, sem push. Resposta: por item, testes, decisões (especialmente o path SSO-only e o resultado do M10), pendências.
