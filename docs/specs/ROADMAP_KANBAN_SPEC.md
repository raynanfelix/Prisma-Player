# Roadmap: Kanban admin (24/10/2026)

DECISÕES DO DONO: página `/admin/roadmap` apenas para admins (o layout admin já impõe `requireAdmin`); colunas Backlog / Faremos / Estamos preparando / Pronto; botão "Adicionar task" no cabeçalho da coluna Backlog abre o modal Dialog que já usamos (`src/components/ui/Dialog.tsx`); drag-and-drop com animação de arrastar via kibo-ui/kanban (`@dnd-kit`); dados reais no Neon (tabela `roadmap_tasks`, migration drizzle 0004 + SQL idempotente para o dono aplicar no Neon Editor, padrão 0003); mutações com `adminGuard` + trilha `admin_audit_log` (contrato `admin-guard.ts:19`); rate limit fail-closed 60/min por admin; SEM travessões em textos novos. Valide tsc+vitest por item.

## 1. Componente Kanban (src/components/kibo-ui/kanban/index.tsx)
Novo componente kibo-ui com a API do exemplo do dono: `KanbanProvider({columns, data, onDataChange, children})`, `KanbanBoard({id})`, `KanbanHeader`, `KanbanCards({id})`, `KanbanCard({column, id, name, children})`. Implementação com `@dnd-kit/core` + `@dnd-kit/utilities` + `@dnd-kit/sortable`: PointerSensor com activation distance 8 (clique vira drag com a animação de arrastar), KeyboardSensor para acessibilidade, DragOverlay com o card flutuante, colunas droppable e cards draggable. Ao soltar: o item muda de coluna via `onDataChange` (otimista no cliente) e o cliente dispara PATCH. Estilos com os tokens do repo (dark: zinc, rounded-xl, bg-card, border slate/zinc).

## 2. Schema + migration (roadmap_tasks)
`drizzle/schema.ts`: tabela `roadmap_tasks` - `id uuid pk defaultRandom`, `title text notNull` (2 a 200 chars na validação), `description text` (ate 2000), `requester_name text` (ate 80, "quem pediu"), `stage text notNull default 'backlog'` com CHECK in ('backlog','faremos','preparando','pronto'), `created_at`/`updated_at` timestamptz notNull default now. Migration gerada com `npx drizzle-kit generate` (0004). SQL idempotente do dono no Neon Editor entregue no fim (padrão 0003 do billing). Superfície platform-level (sem user_id: só admins tocam).

## 3. API admin (src/app/api/admin/roadmap)
- `GET /api/admin/roadmap`: `adminGuard`, lista todas as tasks ordenadas por `updated_at desc`, no-store.
- `POST /api/admin/roadmap`: `adminGuard` + csrf + fail-closed 60/min, body `{title, description?, requesterName?, stage?}` validado por `src/lib/admin/roadmap.ts` (`validateRoadmapTask`), cria com stage default 'backlog', audit `roadmap_task_created`.
- `PATCH /api/admin/roadmap/[id]`: move (stage) e/ou edita (title/description/requesterName), audit `roadmap_task_moved` ou `roadmap_task_updated`.
- `DELETE /api/admin/roadmap/[id]`: audit `roadmap_task_deleted`.
Helpers puros em `src/lib/admin/roadmap.ts` (`STAGES`, `validateRoadmapTask`, `validateStage`) testáveis sem banco (padrão admin-support).

## 4. Página + navegação
`src/app/admin/roadmap/page.tsx` (server component, lê a tabela direto, sem chamada HTTP) renderiza `src/components/admin/RoadmapBoard.tsx` (client: Kanban + modal + PATCH no fim do drag + fallback GET em erro). `AdminShell.tsx`: item "Roadmap" (ícone KanbanSquare) no grupo "Command center", antes de "Crescimento".

## 5. Modal Adicionar task (Dialog existente)
No cabeçalho do Backlog: botão "Adicionar task" abre `ui/Dialog` (título, descrição opcional, "Solicitado por" opcional, select de coluna inicial default Backlog). Erro real do backend exibido no modal (padrão fefe88a), busy state, `router.refresh()` no sucesso.

## 6. Testes
`tests/roadmap-admin.test.ts`: helpers puros (validação de title/description/requesterName/stage, transições), espelhando `tests/admin-support.test.ts`. Componente e rotas cobertos por tsc + os testes de helpers.

## Fase 2 (fora do escopo hoje, registrado)
Entrada pública de sugestões (dashboard/cliente alimenta o Backlog) e atribuição de responsável por task com avatar no card.

## Dependências novas (concretas e verificadas)
`@dnd-kit/core`, `@dnd-kit/utilities`, `@dnd-kit/sortable` para o drag animado pedido pelo dono. Nenhuma outra.
