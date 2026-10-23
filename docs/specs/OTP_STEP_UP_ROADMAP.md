# OTP como step-up — roadmap (dispositivo novo, inatividade, troca de e-mail)

Produto definiu OTP por e-mail nestes momentos: (a) troca de senha,
(b) troca de e-mail, (c) dispositivo novo, (d) muito tempo sem logar.

**Implementado hoje (a)**: `/api/account/password` em dois estágios —
`POST { stage: "request" }` envia o código (`emailOtp.sendVerificationOtp`,
type `email-verification`, rate limit 3/10min) e
`PATCH { currentPassword, password, otp }` valida o código com
`signIn.emailOtp({ email, otp })` antes de chamar `changePassword` (que valida
a senha atual atomicamente com a troca). A troca só acontece com os dois
fatores válidos.

Este documento desenha (b), (c) e (d) e registra as restrições do Managed.

## Restrições reais do Managed Neon Auth (Better Auth gerenciado)

- `emailOtp.sendVerificationOtp({ email, type })` com
  `type: "email-verification" | "sign-in" | "forget-password"`.
- `signIn.emailOtp({ email, otp })` valida o código **e cria SESSÃO** (grava
  cookies) — serve como confirmação de identidade, mas tem efeito colateral.
- `emailOtp.verifyEmail({ email, otp })` marca `emailVerified = true` —
  semântica errada para challenge de senha/sessão; evitado.
- `updateUser` **NÃO troca e-mail**: a troca de e-mail nem existe no
  gerenciado (ver tabela abaixo).
- Sem MFA, sem hooks de pós-login no Managed — qualquer desafio pós-login é
  responsabilidade do app (rota própria + estado no DB do app).

## Tabela de gatilhos

| Gatilho | Sinal usado | Fluxo proposto com `signIn.emailOtp` | Riscos / cuidados |
|---|---|---|---|
| (c) Dispositivo novo | `userAgent` + IP da sessão Better Auth comparados ao histórico do usuário (tabela própria no DB do app, filtrada por `accountOwnerId`; hash de UA+IP, nunca PII crua em log) | No login bem-sucedido (`/api/auth/login`), comparar o par UA/IP com sessões anteriores: se inédito, **não liberar** o dashboard ainda — enviar `sendVerificationOtp({ email, type: "sign-in" })`, exigir `signIn.emailOtp({ email, otp })` numa rota de challenge e só então prosseguir (ou desafiar pós-login revogando a sessão recém-criada até o OTP ser confirmado) | Falso positivo comum (VPN, troca de rede no mobile, atualização de navegador muda UA) → atrito no login; precisa de tabela de dispositivos + limpeza por idade; o `signIn.emailOtp` de challenge cria uma SEGUNDA sessão — revogar a sessão original/recente explicitamente para não multiplicar sessões |
| (d) Muito tempo sem logar | Data do último login (criação da última sessão — via `getSession`/histórico próprio; alternativa: campo `last_login_at` no perfil do app, mais estável) | Se `agora − último login > limiar` (ex.: 90 dias), aplicar o MESMO challenge do dispositivo novo após `signIn.email`: `sendVerificationOtp` type `sign-in` → `signIn.emailOtp` → libera | Retenção do histórico de sessões no Managed não é garantia contratual — confiar em campo próprio; limiar deve ser configurável (evitar travar usuário legítimo que volta depois de férias); mesmo cuidado de sessão duplicada do (c) |
| (b) Troca de e-mail | — | **INDISPONÍVEL no Managed Neon Auth**: `updateUser` não altera e-mail e não existe endpoint de change e-mail/verificação de novo endereço. Alternativa atual: fluxo manual via suporte (`/dashboard/support`), com verificação de identidade fora do produto | Nenhum fluxo automatizado seguro possível hoje; documentar para o suporte; reavaliar com Better Auth self-managed (`updateUser` com change de e-mail + verificação do novo endereço) ou quando o Managed expuser o recurso |

## Notas de implementação (decisões já tomadas no item a)

- Ordem efetiva `[OTP → changePassword]`: não existe endpoint
  somente-leitura de verificação de senha no Managed, e `verifyEmail` tem
  semântica errada para challenge — o OTP confirma a identidade primeiro e a
  senha atual é validada dentro do `changePassword`; senha atual errada
  aborta (403) sem alterar nada.
- Refinamento possível: `emailOtp.checkVerificationOtp({ email, otp, type })`
  valida o código **sem criar sessão** (existe no mapa de endpoints do SDK
  `@neondatabase/auth` e é usado pelo adaptador Supabase-compat no fluxo
  `recovery`). Se confirmado o suporte no Managed para
  `type: "email-verification"`, substitui o `signIn.emailOtp` no item (a)
  eliminando a rotação de sessão.
- Eventos de segurança registrados: `password_changed`,
  `password_change_denied`, `password_change_otp_denied`,
  `password_change_otp_send_failed` (`recordSecurityEvent`).

## Próximos passos sugeridos

1. Persistir sinais de dispositivo: tabela Drizzle própria
   (`accountOwnerId`, hash UA+IP, `first_seen_at`/`last_seen_at`) escrita no
   login, lida no challenge.
2. Rota de challenge pós-login (`/api/auth/challenge`): exige OTP
   (`sign-in`) e só então marca a sessão como "confiável" (cookie/flag no
   DB), revogando sessões extras criadas pelo `signIn.emailOtp`.
3. Config de limiar de inatividade (env) + teste do falso positivo.
4. Reavaliar troca de e-mail quando o Managed expuser o recurso (ou na
   migração para Better Auth self-managed).
