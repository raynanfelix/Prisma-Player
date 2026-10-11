# Task 1 (PRISMA R1.2) — Viewer ID persistente para atribuição entre visitas

Status: **DONE**

## Resumo
Adicionado viewer ID persistente, separado do `sessionId` (que continua random por
load), para atribuição entre visitas do mesmo navegador. Utilitário puro com injeção
de `Storage`, envio no batcher e no `analyticsContext` do pixel embed, persistência
no ingest (omitting quando inválido), e migration 100% aditiva.

## TDD (evidência)

**RED** — `npx vitest run tests/viewer-id.test.ts` (antes de implementar):

```
FAIL tests/viewer-id.test.ts [ tests/viewer-id.test.ts ]
Error: Cannot find module '@/lib/player/viewer-id' imported from '.../tests/viewer-id.test.ts'.
Test Files  1 failed (1)
   Tests   no tests
```

**GREEN** — após implementar `src/lib/player/viewer-id.ts`:

```
✓ tests/viewer-id.test.ts (8 tests) 14ms
Test Files  1 passed (1)
      Tests  8 passed (8)
```

Nota: uma primeira execução GREEN teve 1 falha do próprio teste (UUID de exemplo com
variante inválida `1111` → `8111` no 4º grupo); a implementação estava correta.

## Arquivos alterados

- `tests/viewer-id.test.ts` (novo) — 8 testes: cria/persiste; reusa; inválido->novo;
  storage lança sem crash; IDs distintos; `getViewerId` só lê; lê null p/ inválido;
  `isValidViewerId`.
- `src/lib/player/viewer-id.ts` (novo) — `getOrCreateViewerId(storage?)`,
  `getViewerId(storage?)`, `VIEWER_ID_STORAGE_KEY`, `isValidViewerId`. Sem acesso
  direto a `window`; `crypto` via `globalThis.crypto?.randomUUID` com fallback
  gerador UUID v4; storage injetado (default localiza `window.localStorage`).
- `src/features/player/components/EmbedPlayer.tsx` — `viewerIdRef`, setter no mesmo
  efeito do sessionId (comentário da sessão preservado + novo comentário viewerId),
  `viewerId` no flush body do batcher e no `analyticsContext` do pixel.
- `src/app/api/analytics-events/route.ts` — lê `parsed.body?.viewerId`, valida
  (`isValidViewerId` + max 64), persiste `viewer_id` no upsert de
  `video_live_sessions` e no array de `video_events`; se inválido omite o campo
  (spread condicional → default/null na tabela).
- `supabase/migrations/20260808190000_viewer_id_attribution.sql` (novo) — 100%
  aditivo: `add column if not exists viewer_id text` nas duas tabelas, 2 índices
  parciais `if not exists`, comentário de provenance PRISMA R1.2. Zero DROP.

## Validações

- `npm test` → **71 passed / 0 failed** (11 arquivos). Stderr de
  `account-menu-click.test.tsx` (ECONNREFUSED :3000) é ruído pré-existente, teste passa.
- `npm run typecheck` → limpo.
- `npm run lint -- --no-cache` → 80 erros / 683 warnings **pré-existentes** em arquivos
  não tocados (AnalyticsWorkspace, Footer, Hero, VslStudio, use-mobile,
  use-world-data, etc.). Lint focado nos 4 arquivos alterados
  (`npx eslint ... viewer-id.ts EmbedPlayer.tsx route.ts viewer-id.test.ts`) → **0
  problemas**.
- Grep confirmou que `video_live_sessions`/`video_events` NÃO tinham `viewer_id` antes
  (nenhum match em `supabase/migrations` nem em `src`), então a migration manteve os
  `add column`.

## Commits

- hash e mensagem abaixo (único commit)

## Preocupações / observações

1. Fallback de `randomUUID()` sem `crypto` usa `Math.random` — suficiente para um ID
   de atribuição não criptográfico; regex valida formato v4.
2. Expressão de validação da rota: `viewerId` é `string | null`, validado com
   `isValidViewerId` e `length <= 64`, nunca re-declara tipagem solta.
3. O lint completo do repo está com 80 erros pré-existentes (regras
   `react-hooks/set-state-in-effect` recém-habilitadas etc.) — nenhum relacionado ao
   PRISMA R1.2. Recomendo tarefa separada (ou PRISMA) para limpar.

---

## Revisão R1.2 (fix de findings)

Status: **DONE**

### Findings corrigidos

- **[IMPORTANT] `viewer-id.ts:42` — getter `window.localStorage` fora de try/catch:**
  acesso a `window.localStorage` pode lançar `SecurityError` em iframe `sandbox` sem
  `allow-same-origin` antes mesmo do `getItem`. Extraído `resolveDefaultStorage()` que
  envolve a resolução do store em try/catch e retorna `null` em erro. Teste novo (TDD)
  simula o getter lançando via `vi.stubGlobal("window", new Proxy(...))`.
- **[MINOR] newline final no arquivo** — `src/lib/player/viewer-id.ts` agora termina
  com `\n`.
- **[MINOR] teste do fallback sem crypto** — novo teste stubba `crypto` via
  `vi.stubGlobal("crypto", undefined)` e valida UUID v4 com regex + persistência.

### TDD (evidência)

**RED** — `npx vitest run tests/viewer-id.test.ts` (novos testes adicionados):

```
× viewer-id > returns a fresh viewerId without crashing when the window.localStorage accessor throws
  → expected [Function] to not throw an error but 'Error: SecurityError: The operation i…' was thrown
 Tests  1 failed | 9 passed (10)
```

**GREEN** — após extrair `resolveDefaultStorage()` com try/catch:

```
✓ tests/viewer-id.test.ts (10 tests) 16ms
 Test Files  1 passed (1)
      Tests  10 passed (10)
```

### Validações após fix

- `npm test` → **73 passed / 0 failed** (11 arquivos; +2 novos vs 71 antes).
- `npm run typecheck` → limpo.
- `npx eslint src/lib/player/viewer-id.ts tests/viewer-id.test.ts` → **0 problemas**.

### Commits

- commit do fix abaixo (hash e mensagem no final).