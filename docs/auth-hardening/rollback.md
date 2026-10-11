# Rollback (hardening de autenticação)

Todas as mudanças são em código versionado — reversão por `git revert` do(s)
commit(s), sem migração de banco envolvida nesta rodada.

| Mudança | Reversão | Efeito de reverter |
|---|---|---|
| AAL2 em `adminGuard` + `requireAdmin` | Revert | Volta a aceitar sessão aal1 (reabre FIND-001 parcial) |
| `signOut(others)` pós-senha | Revert | Outras sessões sobrevivem à troca (FIND-003 parcial) |
| Rate limits (logout, aceite, seo PATCH) | Revert | Sem throttle nesses caminhos |
| Tema default claro | Revert | SO escuro volta a forçar dark inicial |
| Save/discard do estúdio | Revert | Descartar volta a não recarregar |
| Logo/Menu/hover | Revert | Visual anterior |

Nenhuma reversão desloga usuários, invalida sessões ou toca no banco.
Ordem segura: reverter do mais recente ao mais antigo. Validar com
`tests/admin-guard.test.ts` + build após cada revert.
