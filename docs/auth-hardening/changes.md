# Mudanças Implementadas (hardening de autenticação)

Sessões anteriores (outra sessão): AAL2 em `adminGuard`, `{user,hasSession}` no
signup, `revoke-all-sessions`, enum `trial_status` fail-closed, `is_account_team_member`
com `EXECUTE` + docs `auth-hardening/*`. Esta sessão:

| Arquivo | Mudança | Motivo |
|---|---|---|
| `src/lib/security/inline-scripts.ts` | Bootstrap do tema só aplica `dark` com escolha explícita (fim do fallback `prefers-color-scheme`) | Tema mudando sozinho |
| `src/features/studio/components/VslStudio.tsx` | Estado real de sujeira (`saved`/`discarding`), `loadConfig` com guarda de corrida, `discardConfig` + Dialog de confirmação, logo `Logo` oficial | Salvar/descartar quebrado; logo errada |
| `src/app/dashboard/videos/page.tsx` | Itens do menu sem hover cinza e sem sombra (ambos os temas) | Hover pedido removido |
| `src/lib/auth/server.ts` | `requireAdmin` exige `aal2` da sessão (igual às APIs) | Consistência página×API |
| `src/app/api/account/password/route.ts` | `signOut({scope:"others"})` pós-troca | Revogar outras sessões |
| `src/app/api/auth/update-password/route.ts` | Idem (fluxo recovery) | Idem |
| `src/app/api/auth/logout/route.ts` | Rate limit 30/min (fail-open documentado) | Anti-spam sem travar saída |
| `src/app/api/account/team/route.ts` | Rate limit do aceite antes dos lookups | Oráculo de inviteId com custo |
| `src/app/api/admin/seo/targets/route.ts` | Rate limit no PATCH | Paridade com o POST |
| `tests/admin-guard.test.ts` | Caso aal1 → 403 `mfa_required` | Cobrir nova barreira |
| `tests/auth-signup-shape.test.ts` | Novo: sem tokens no JSON | Regressão AUTH-02/A11 |
| `tests/csrf-origin.test.ts` | Novo: política Origin/Referer | Documentar comportamento |
| `docs/auth-hardening/*` | Status corrigidos (005 rejeitado, 006 rebaixado, matriz, reconciliação) | Verdade pós-QA |

Decisões de NÃO implementar (com evidência): `cookieOptions` explícitos
(defaults da lib já HttpOnly/Lax/Secure; risco ao `pp_embed` e chunking);
`Origin` obrigatório (sem ganho anti-CSRF, quebra legítimos); nada de
Better Auth.
