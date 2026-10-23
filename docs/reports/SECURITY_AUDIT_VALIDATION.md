# Validacao da auditoria externa de seguranca (23/10/2026)

Fonte: `docs/SECURITY_VALIDATION_SPEC.md` (agora em `docs/specs/`). HEAD validado: `130e0e1`
(pos LGPD Pipeline B). Metodo: leitura contextual completa dos arquivos citados (nao so a linha),
mais reproducao empirica do M10 com `next start` + sessao forjada local (JWT HS256 do proprio SDK).
SEM FIXES: nenhuma linha de codigo foi alterada; este relatorio e a unica adicao.

Resumo: 2 criticos TRUE; 11 medios: 8 TRUE (1 parcial), 1 FALSE (M8), 1 parcial/FALSE (M6),
1 TRUE com severidade corrigida (M10); 7 "a validar": 3 TRUE, 4 FALSE/mitigados. O suspeito
STALE (cancelamento Stripe no delete) esta mesmo STALE (corrigido no 130e0e1), mas o M2 tem
partes que seguem TRUE no HEAD. A expectativa catastrofica do M10 ("pags quebram") e FALSE;
o defeito real por tras dele e TRUE com impacto menor (dark mode morto nas rotas autenticadas).

## Tabela de vereditos

| ID  | Alegacao (resumo)                                   | Veredito                          |
|-----|-----------------------------------------------------|-----------------------------------|
| C1  | Muro do embed contornavel por script                | TRUE                              |
| C2  | metaCapiToken no config publico do embed            | TRUE                              |
| M1  | Escalonamento admin por convite                     | TRUE                              |
| M2  | Apagao LGPD incompleto (tokens/churn/webhooks)       | PARCIAL: Stripe STALE (130e0e1) + residuos TRUE |
| M3  | SSO-only travado fora do apagao                     | TRUE (agravado: sem UI de delete) |
| M4  | Quota de assentos TOCTOU + catch morto              | TRUE                              |
| M5  | Ingestao ab-events sem teto agregado                | TRUE                              |
| M6  | Objetos R2 orfaos sem cleanup                       | FALSE no fluxo citado; orfaos reais so no account delete (documentados) |
| M7  | Integracoes editaveis sem papel/paid               | TRUE                              |
| M8  | Open redirect no callback                           | FALSE                             |
| M9  | Teto de streams furavel por rotacao de identidade   | TRUE                              |
| M10 | Nonce de CSP quebrado (paginas quebrando?)          | TRUE no defeito; FALSE na quebra de paginas |
| M11 | Decimo primeiro medio implicito                     | Reportado em "Achados novos"      |
| V1  | Revogacao de sessoes no reset                        | TRUE (pendencia reconhecida)      |
| V2  | currentPassword vazio no update-password            | TRUE (barreira delegada ao Managed) |
| V3  | Sessao pre-verificacao no signup                    | FALSE                             |
| V4  | CSRF do catch-all do SDK (auth/[...path])            | FALSE (mitigado nativamente; ressalva) |
| V5  | success_url do Stripe                               | FALSE                             |
| V6  | callbackURL do OTP                                  | FALSE (mitigado por allowlist)    |
| V7  | Residuo de sessao OTP na troca de senha             | TRUE                              |

## Criticos

### C1. Muro do embed contornavel por script: TRUE

Cadeia atual confirmada por leitura integral:

- `src/proxy.ts:63-99` - o proxy gera o nonce, seta `x-nonce` + CSP na copia `requestHeaders`
  (linhas 67-69) e grava o cookie `pp_embed` (HttpOnly, SameSite=None em producao, 600s:
  `src/lib/constants.ts:9`) em TODA resposta de caminho `/embed*` (linhas 89-99).
- `src/app/embed/[id]/page.tsx:11-15` - o origin token e mintado com o host lido de
  `Referer`/`Origin` da requisicao (`trustedEmbedHostFromHeaders`, `src/lib/security/embed-origin.ts:19-21`)
  e com o nonce do render. Ou seja: o host e ESCOLHIDO pelo cliente que faz a requisicao.
- `src/app/api/embed/[id]/route.ts:103-122` - a verificacao exige token assinado nao expirado,
  header coerente (`originHeaderDisagrees`, embed-origin.ts:79-90: sem Origin/Referer a
  requisicao nao "discorda") e cookie `pp_embed` com o nonce do token.
- `src/app/api/embed/[id]/route.ts:210,238` - a URL R2 assinada (`source`, TTL 900s:
  `src/lib/constants.ts:32`) e a config completa saem NO CORPO da resposta.

Contorno por cliente HTTP (sem navegador): (1) `GET /embed/ID` com `Referer: dominio-permitido.com`
produz HTML com originToken assinado para aquele host + `Set-Cookie: pp_embed=nonce` (capturavel
por curl: HttpOnly nao protege contra leitura da resposta HTTP); (2) `GET /api/embed/ID?originToken=...`
com o cookie capturado devolve 200 com a URL do video. `domainAllowed` (route.ts:122) compara com o
host que o proprio atacante escolheu no passo 1. `allowedDomains` vazio passa sempre.

Sobre "geo/VPN/paywall dependem so disso": NAO. Paywall e estado do dono (route.ts:96-98,
`getAccountAccessCached`) e nao e contornavel por host. Geo/device/idioma/VPN (route.ts:148-167)
dependem de headers que o proxy da Vercel/Cloudflare injeta do IP REAL do cliente (nao spoofavel),
mas um atacante em pais bloqueado contorna com proxy de pais permitido e o `blockVpn` depende da
base de VPN. O muro de dominio + prova de render, esses sim, sao contornaveis por script.

### C2. metaCapiToken no config publico do embed: TRUE

Confirmado com a cadeia completa no HEAD:

- `src/app/api/player-configs/route.ts:67-83` - o PUT aceita config jsonb LIVRE (ate 100KB) sem
  allowlist de chaves; `normalizePixelConfig` mantem `metaCapiToken` (`src/lib/player/pixels.ts:87`).
  A UI grava la: `src/features/studio/components/PixelTrackingPanel.tsx:89` e
  `src/features/studio/components/VslStudio.tsx:211`.
- `src/app/api/embed/[id]/route.ts:124,238` - o endpoint dinamico devolve `{ ...playerConfig.config }`
  INTEIRO no corpo (sem allowlist), incluindo `metaCapiToken`.
- `src/features/player/components/EmbedPlayer.tsx:98-118` - `publishPixelEvent` faz
  `window.parent.postMessage({..., integrations, ...}, targetOrigin)` com
  `integrations = pixelIntegrations(payload.config)` que inclui `capiToken` = metaCapiToken
  (`src/lib/player/pixels.ts:107`). Qualquer script da pagina hospedeira escuta o `message` e le
  o token CAPI do dono da VSL.
- Contraste real citado pela auditoria: o manifest FILTRA via allowlist
  (`src/app/api/embed/[id]/manifest/route.ts:57-80`, `MANIFEST_CONFIG_KEYS`).

Outros segredos: `googleAdsApiSecret`/`tiktokAccessToken`/`webhookUrl` NAO vazam pelo embed: vivem
em `account_integrations.config` server-side e saem mascarados (`src/app/api/integrations/route.ts:44-58`;
mascaramento do commit 54c199f). Porem a causa raiz persiste: o config do player e jsonb aberto -
qualquer segredo gravado ali futuramente vaza pelo mesmo caminho (falta allowlist no PUT e no GET
dinamico, nao so para o token Meta).

## Medios

### M1. Escalonamento admin por convite: TRUE

- `src/lib/account/team.ts:350` - `inviteTeamMember` valida `role` contra o set que inclui
  `"admin"` sem checar quem convida.
- `src/lib/account/team.ts:399` - `updateMemberRole` EXIGE owner para promover/demover admin.
- `src/app/api/account/team/route.ts:59` - a rota deixa `["owner","admin"]` convidar.
- Inconsistencia: admin pode CONVIDAR um cumplice como admin (sem o dono), enquanto a promocao
  direta exige owner. O aceite (`acceptTeamInvite`, team.ts:278-292) grava o role do convite sem
  restricao adicional.

### M2. Apagao LGPD incompleto: PARCIAL (Stripe STALE; residuos TRUE)

- Stripe-cancel: STALE, corrigido no commit `130e0e1`. Prova no HEAD:
  `src/app/api/account/delete/route.ts:106-132` - assinatura viva (active/past_due/suspended)
  e cancelada ANTES do wipe (linha 108), falha que nao seja `resource_missing` aborta com 503
  sem apagar nada + alerta ops (linhas 113-129). A suspeita da spec se confirma.
- Residuos que persistem no HEAD (TRUE): a transacao (delete/route.ts:157-187) NAO cobre:
  - `account_integrations` (tokens de CAPI/webhooks por conta): `drizzle/schema.ts:1312-1334`,
    comentario do proprio schema diz que "Tokens ... vivem em config" - nao ha delete.
  - `billing_churn_surveys` (feedback do titular): `drizzle/schema.ts:880-897` - nao ha delete.
  - `account_team_invites`: so `acceptedBy = userId` e apagado (delete/route.ts:185); convites
    PENDENTES enderecados ao e-mail do titular em equipes de terceiros persistem com o e-mail.
  - `payment_webhook_events` (payload jsonb do Stripe com PII): `drizzle/schema.ts:847-869` -
    sem delete e sem politica de retencao no repo (defensavel fiscalmente, mas PII sem prazo).

### M3. SSO-only travado fora do apagao: TRUE (agravado)

- `src/app/api/account/delete/route.ts:63-66` - o delete exige senha via `signIn.email`;
  conta Google-only (login social existe: `src/features/auth/components/GoogleSignInButton.tsx:29`)
  nao tem senha e sempre falha com 403.
- Via de escape: reset por e-mail define senha (`src/app/reset-password/page.tsx:40-41` le o
  `?token=`; rota `/api/auth/update-password` aceita `{password, token}`). Funcional, mas e um
  atrito nao sinalizado pela UI.
- AGRAVANTE NOVO (achado 1 abaixo): NAO EXISTE UI que chame `/api/account/delete` (grep em todo
  `src/` sem nenhum chamador). Nenhum titular - SSO ou nao - consegue apagar a conta pela
  interface. LGPD Art. 18, VI inalcançavel de fato pelo produto.

### M4. Quota de assentos TOCTOU + catch morto: TRUE

- Convite: `src/lib/account/team.ts:351-352` - check (`countActiveMembers + countPendingInvites >=
  seats`) e insert sem transacao/lock. Dois POSTs concorrentes passam ambos.
- Aceite: `ensureSeatForAcceptor` (team.ts:309-321) e o mesmo padrao check-then-insert.
- Catch morto: `insertTeamMember` (team.ts:331-334) procura `team_seat_limit_reached`, mensagem do
  trigger atomico que SO EXISTE no legacy Supabase
  (`docs/legacy-supabase/migrations/20260801100000_atomic_plan_quota_guards.sql:74,98`). Nao ha
  trigger nem function equivalente nas migrations Drizzle (`drizzle/0000`-`0003`) nem no
  `docs/neon-migration/neon-schema.sql`. Pelo repo, o catch nunca dispara e o TOCTOU e real.
- Ressalva honesta: se o banco real tiver os triggers aplicados manualmente via Neon Editor
  (SQL nao versionado), o aceite e barado atomicamente - mas isso nao e garantido pelo repo
  e o convite continua TOCTOU de qualquer forma (trigger de invite tambem nao existe la).

### M5. Ingestao ab-events sem teto agregado: TRUE

- `src/app/api/ab-events/route.ts:34-43` - rate limit 120/min POR SESSAO auto-declarada
  (`identifier: s:${sessionId}` do corpo); a segunda barreira por IP foi REMOVIDA
  deliberadamente (comentario linhas 37-43).
- O `sessionId` do corpo NAO e amarrado ao eventToken nesta rota (comentario linhas 52-56:
  "nao exigimos sessao no token aqui") e o dedupe e por (test, variant, session, type, percent)
  - sessionId novo = linha nova. Um eventToken legitimo (TTL 6h, embed-origin.ts:129) + cookie
  de um render permitem ingestao ilimitada rotacionando UUIDs de sessao: custo de writes/storage
  no Neon sem teto agregado.
- Mesma familia: `/api/analytics-events` tambem limita por sessao auto-declarada
  (`route.ts:42`), la o token E amarrado a sessao (RM-03), o que endurece - mas o teto
  agregado continua inexistente.

### M6. Objetos R2 orfaos: FALSE no fluxo citado (com orfaos reais documentados)

- Delete de video: `src/app/api/videos/[id]/route.ts:130-153` - deleta assets do player
  (`ownedAssetPaths`) E o objeto do video com fail-closed (erro 500 aborta sem deixar orfao).
- Multipart tem `abort` explicito (`src/app/api/videos/[id]/multipart/route.ts:58-60`).
- Orfaos REAIS: assets de player no ACCOUNT delete - o proprio codigo documenta
  (`src/app/api/account/delete/route.ts:146-148`: "player-assets: cleanup manual pendente");
  multiparts abandonados sem abort (aba fechada) nao tem varredura de uploads incompletos no repo.

### M7. Integracoes editaveis por papel sem paid: TRUE

- `src/app/api/integrations/route.ts:38` (GET), `:65` (PUT) e `:101` (DELETE) usam `guard(request)`
  SEM `role` e SEM `paid`. Qualquer membro ATIVO da equipe (viewer/analyst incluidos) instala,
  edita e remove integracoes com tokens da conta; conta sem acesso pago tambem edita.
- Contraste dentro do proprio repo: `guard.ts:60-76` oferece os gates (`role: "manage"`, `paid`) e
  rotas vizinhas os usam (`player-configs/route.ts:60` exige `edit` + `paid`; videos PATCH
  exige `edit` + `paid`).

### M8. Open redirect no callback: FALSE

- `src/app/auth/callback/route.ts:8` - `requestedNext.startsWith("/") && !requestedNext.startsWith("//")`
  com fallback `/dashboard/videos`. `/\/evil.com` e `///evil` sao bloqueados pelo startsWith("//");
  `https://evil.com` nao comeca com `/`. O `token` so regra um redirect INTERNO com o token no query
  (linhas 15-18) e `?code=` orfao volta ao login (linhas 20-24). Sem vetor de redirect externo no HEAD
  (o arquivo nao mudou desde a migracao 698656f; a sanitizacao ja estava la).

### M9. Teto de streams furavel por rotacao de identidade: TRUE

- `src/app/api/embed/[id]/route.ts:173-206` - o contador de streams simultaneos filtra por
  `viewerId` (auto-declarado no cliente) e a chave de sessao e UUID livre. Trocar viewerId a cada
  request zera o contador.
- Mesmo com o DRM "Exigir Token Assinado por Sessao" ligado (route.ts:130-146), a rota de mint
  (`src/app/api/embed/[id]/session/route.ts:33-69`) emite sessionToken para QUALQUER par
  viewer/session UUID com origem+cookie validos (60/min por IP) - a rotacao de identidade
  continua trivial e o teto e decorativo contra script.

### M10. Nonce de CSP quebrado: TRUE no defeito, FALSE na quebra de paginas (veredito com prova)

E a alegacao que exigia cavacao real; foi reproduzida empiricamente com o build atual.

O que e TRUE (defeito real, reproduzido):

- O proxy gera o nonce e seta `x-nonce` + CSP na COPIA `requestHeaders` (`src/proxy.ts:67-69`) e a
  propaga so no caminho publico (`src/lib/auth/session.ts:68-69`,
  `NextResponse.next({ request: { headers: requestHeaders } })`).
- Nas rotas PROTEGIDAS (`/dashboard`, `/studio`, `/admin`) o `updateSession` ignora o parametro
  `requestHeaders` e chama o middleware do Neon com o request ORIGINAL
  (`src/lib/auth/session.ts:52-56`). O SDK reconstrói os headers a partir de `request.headers`
  originais (`@neondatabase/auth/dist/next/server/index.mjs:139-141`), SEM `x-nonce` e sem CSP.
- Consequencia no HEAD: `layout.tsx:75` e `ThemeScript.tsx:5` leem `headers().get("x-nonce")` =
  undefined nessas rotas. Reproducao com sessao forjada local (JWT HS256 do proprio SDK):
  `GET /dashboard/videos` devolve HTML com o ThemeScript e os 2 JSON-LD SEM nonce
  (3 dos 6 scripts inline), enquanto o CSP da resposta exige nonce. O ThemeScript e EXECUTAVEL
  e e BLOQUEADO pelo CSP: o dark mode (unico mecanismo de boot e
  `src/lib/security/inline-scripts.ts:1-9` + `PreferencesSettingsTab.tsx:23-32`) fica morto em
  todas as paginas autenticadas para usuarios dark, com violacao de CSP no console a cada pagina.
- O JSON-LD sem nonce e inofensivo (data block nao executa; SEO preservado).

O que e FALSE (a hipotese catastrofica "paginas autenticadas quebrando / RSC hydration quebra"):

- O Next 16 aplica nonce aos scripts do FRAMEWORK (chunks, bootstrap TURBOPACK, flight pushes)
  a partir do CSP da RESPOSTA do middleware (`proxy.ts:72`), nao so do header da request:
  testei injetar `Content-Security-Policy: script-src 'nonce-MEU'` na request e os scripts
  receberam o nonce do PROXY, provando a fonte. Resultado empirico: 20/23 scripts com nonce
  nas duas rotas testadas; `/login` (publico): 6/6 inline com nonce; `/dashboard/videos`
  (protegido): framework 100% com nonce, hidratacao preservada. O produto funciona - o dono
  nunca viu quebra por esse motivo.

Veredito final M10: o nonce ESTA quebrado (perda do `x-nonce` no caminho protegido) com efeito
real reproduzido (ThemeScript bloqueado, dark mode morto no dashboard), mas NAO quebra paginas
nem hidratacao. Urgencia: media (bug de UX + ruido CSP), nao critica. Causa raiz para um futuro
fix: propagar os requestHeaders no branch protegido do `updateSession` (ou repassar o
x-nonce/CSP ao redor do middleware do Neon). Nao foi aplicado (contrato: sem fixes).

## Os 7 a validar (Managed/plataforma)

- V1. Revogacao de sessoes no reset: TRUE (pendencia reconhecida no codigo).
  `src/app/api/auth/update-password/route.ts:26-34` - o caminho com token chama `resetPassword`
  SEM revogar outras sessoes; o comentario cita a config `revokeSessionsOnPasswordReset` do
  Managed como nao configuravel pelo app. Reset por e-mail nao encerra sessao roubada.
- V2. currentPassword vazio: TRUE (barreira delegada).
  `src/app/api/auth/update-password/route.ts:36-42` - sem token e com sessao ativa, a rota chama
  `changePassword({ ..., currentPassword: "" })`. O comentario confia na rejeicao do Managed
  (INVALID_PASSWORD); para contas SEM senha (SSO-only) o efeito pode ser DEFINIR senha sem
  fator adicional. Nao foi possivel provar empiricamente contra o Neon real (limitacao).
- V3. Sessao pre-verificacao: FALSE. `src/app/api/auth/signup/route.ts:61-67` - `hasSession`
  so existe se o Managed emitir token; com "Verify at Sign-up" ligado nao ha sessao pre-verificacao
  (`emailVerificationRequired` sinaliza a UI); `verify-email/route.ts:61-74` so entrega sessao
  APOS o codigo validar. O app nao cria sessao pre-verificacao em nenhum caminho.
- V4. CSRF do catch-all do SDK: FALSE (mitigado nativamente, com ressalva).
  `src/app/api/auth/[...path]/route.ts:27-49` delega ao handler do SDK sem `csrfGuard` do app;
  o Better Auth valida Origin/Referer nativamente contra trustedOrigins (dominios registrados,
  `docs/neon-migration/neon-auth-setup.md` secao 3). Ressalva: a barreira vive no servico
  gerenciado e nao e auditavel deste repo; o mounting segue a doc oficial do Neon.
- V5. success_url do Stripe: FALSE. `src/app/api/billing/checkout/route.ts:72-80` - a origem vem
  de `billingOrigin(request)` (`src/lib/billing/stripe/client.ts:165-172`: `new URL(request.url).origin`,
  fallback env), nao de input do corpo; rota exige `manage`; o redirect pos-pagamento so afeta o
  proprio titular autenticado. Sem vetor pratico de open redirect.
- V6. callbackURL do OTP: FALSE (mitigado). `src/app/api/auth/verify-email/route.ts:44-45` envia
  `callbackURL = origin da request`; o Managed so aceita callbackURL para dominios da allowlist
  (neon-auth-setup.md secao 3: "invalid domain" para origem fora). Dupla camada.
- V7. Residuo de sessao OTP: TRUE. `src/app/api/account/password/route.ts:91-105` - o challenge
  usa `signIn.emailOtp`, que faz AUTO SIGN-IN e cria uma NOVA sessao (mecanismo confirmado no
  comentario do propio verify-email: "o SDK ja gravou os cookies"). Se o `changePassword` falha
  depois (senha atual errada, 403), a sessao nova criada pelo OTP NAO e revogada: resíduo
  repetivel a cada tentativa. No caminho de sucesso, `revokeOtherSessions: true` limpa as demais,
  mas deixa o cookie antigo do navegador apontando para sessao revogada (efeito colateral de UX).

## M11: o decimo primeiro medio (achados novos da leitura contextual)

1. DELETE de conta sem UI (o mais grave dos achados novos): `/api/account/delete` nao tem
   NENHUM chamador em `src/` (grep em componentes, features e services). O direito de
   eliminacao (LGPD Art. 18, VI) nao e exercitavel pela interface do produto - apenas via API
   direta. Agrava o M3.
2. Residuos do account delete (detalhado no M2): `account_integrations` (tokens de CAPI/webhooks
   com `account_owner_id` do titular) e `billing_churn_surveys` sobrevivem ao wipe; convites
   pendentes com o e-mail do titular persistem em equipes de terceiros.
3. ThemeScript bloqueado pelo CSP nas rotas protegidas (detalhado no M10): dark mode morto em
   `/dashboard`, `/studio`, `/admin` + erro de CSP no console de todo usuario dark.
4. `payment_webhook_events` sem retencao definida: payloads do Stripe (com PII) sem politica de
   purge no repo - se alinha ao gap P1 de retencao ja mapeado em `.lgpd/gaps.md`.
5. Doc stale menor: `docs/neon-migration/neon-auth-setup.md` secao 7.1 afirma que a UI nao le o
   `?token=` do reset; falso no HEAD desde a migracao (`src/app/reset-password/page.tsx:40`).
6. Dependencia de trigger nao versionado (M4): o unico guard atomico de assentos vive em
   `docs/legacy-supabase/`; o schema Neon atual nao o garante - o catch do `insertTeamMember`
   esta morto enquanto isso.

## Top prioridades REAIS no HEAD atual

1. C2 - vazamento de metaCapiToken: segredo de API real exposto a qualquer pagina hospedeira
   (corpo do embed + postMessage). Causa raiz: config jsonb sem allowlist no PUT e no GET
   dinamico.
2. C1 - muro de embed contornavel por cliente HTTP (2 requests + cookie capturado): decisao de
   design/produto necessario (o muro de dominio nao resiste a quem imita o render); mitigacao
   possivel: rate limit por IP no /api/embed e/ou bloqueio de user-agent nao-browser.
3. Achado novo 1 + M2 residuos - trilha LGPD de eliminacao: UI de delete inexistente +
   integracoes/churn/invites sobrevivendo ao wipe. Compliance antes de escala.
4. M1 - admin por convite sem owner (escalonamento interno de privilegio na equipe).
5. M7 - integracoes (tokens!) editaveis por qualquer papel e sem paid.
6. M10 real - x-nonce perdido nas rotas protegidas (ThemeScript/dark mode + ruido CSP).
7. M4/M5/M9 - TOCTOU de assentos (catch morto), ingestao sem teto agregado, teto de streams
   decorativo: custo e integridade de metricas.
8. V7/V2/V1 - residuos e barreiras de sessao no fluxo de senha (pendencias do Managed).

## Limitacoes da validacao

- V2/V4 dependem do comportamento do Neon Auth gerenciado (servico externo); o veredito reflete
  o codigo do app e a documentacao oficial do SDK, sem teste contra o Neon real.
- O M4 nao pode provar o estado do banco de producao (triggers aplicados manualmente nao
  aparecem no repo); o veredito e pelo que o repo garante.
- Nenhum teste automatizado foi adicionado nem alterado (contrato: sem fixes). A reproducao do
  M10 usou `next start` local, cookie de sessao forjado com o proprio secret do ambiente de
  teste e HTML inspecionado; artefatos temporarios foram removidos.
