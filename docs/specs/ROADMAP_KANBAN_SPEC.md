# Roadmap: Kanban público de sugestões (24/10/2026, rev.2)

DECISÕES DO DONO (rev.2, após revisão da v1 admin-only): a página é do DASHBOARD dos clientes (`/dashboard/roadmap`, sidebar de usuários), na HORIZONTAL como no código kibo original (colunas lado a lado, cards na vertical). **Clientes criam as tasks** (sugestões do que querem que a equipe faça) e **só admins avançam as etapas** (drag entre colunas; `getCurrentAdminUser` define quem arrasta). Modal "Adicionar task" no cabeçalho do Backlog (Dialog existente). Drag-and-drop animado via kibo-ui/kanban (`@dnd-kit`). Dados reais no Neon (`roadmap_tasks`, migration 0004 + SQL do dono no Neon Editor). Mutações: POST = `guard({csrf:true})` qualquer usuário; PATCH/DELETE = guard + verificação `getCurrentAdminUser` (403 admin_required) + trilha `admin_audit_log`. SEM travessões em textos novos. Valide tsc+vitest por item.

## 1. Componente Kanban (src/components/kibo-ui/kanban/index.tsx)
API do exemplo do dono: `KanbanProvider({columns, data, onDataChange, children})`, `KanbanBoard`, `KanbanHeader`, `KanbanCards`, `KanbanCard`, `KanbanOverlay`. `@dnd-kit/core` + `utilities`: PointerSensor distance 8, KeyboardSensor, DragOverlay com dropAnimation. Prop `draggable?: boolean` (default true): quando false, cards ficam estáticos (clientes) sem listeners/cursor-grab. Provider renderiza `columns.map(children)` (boards irmãos dentro do container horizontal da página).

## 2. Layout horizontal (o erro da v1)
A v1 empilhou os boards na VERTICAL (container flex-col). Rev.2: a página envolve o KanbanProvider em `flex min-h-[70dvh] gap-3 overflow-x-auto` e cada `KanbanBoard` (flex-1 min-w-64) fica LADO A LADO na horizontal, cards empilhados na vertical dentro da coluna, igual ao código kibo enviado.

## 3. API (src/app/api/roadmap)
- `GET`: `guard(request)` (qualquer autenticado), lista tasks por `updated_at desc`, no-store.
- `POST`: `guard(request, { csrf: true })` (qualquer autenticado), body `{title, description?}`; stage forçado 'backlog'; `requesterName` auto-preenchido com o `profiles.fullName` da sessão (não é input do cliente). Rate limit default do guard.
- `PATCH /[id]`: guard + csrf + `getCurrentAdminUser()` -> 403 admin_required. Move (stage) e/ou edita. Audit `roadmap_task_moved`/`roadmap_task_updated`.
- `DELETE /[id]`: guard + csrf + admin. Audit `roadmap_task_deleted`.
Helpers puros em `src/lib/roadmap.ts` (`ROADMAP_STAGES`, `validateRoadmapTask`, `validateRoadmapPatch`, `normalizeRoadmapText`), testáveis sem banco (padrão admin-support).

## 4. Página + navegação
`src/app/dashboard/roadmap/page.tsx` (server): `requireUser()` + `getCurrentAdminUser()` (isAdmin) + leitura direta da tabela; renderiza `PageHeader` + `src/components/dashboard/RoadmapBoard.tsx` (client). `app-shared.tsx`: item "Roadmap" (ícone KanbanSquare) entre Conversões e Integrações. Para clientes: hint "Sugira o que a equipe deve fazer a seguir. Nossa equipe move cada pedido entre as etapas."

## 5. Board do cliente
`RoadmapBoard({initialTasks, isAdmin})`: drag + excluir + overlay só para admin; botão "Adicionar task" (todos); modal Dialog (Título, Detalhes); erro real do backend com rollback otimista; contadores por coluna; datas pt-BR.

## 6. Testes
`tests/roadmap.test.ts`: helpers puros (12 testes).

## Fase 2 (pós-lançamento)
Responsável com avatar no card; comentários públicos por task; notificação no inbox quando a sugestão avança de etapa.

## Dependências
`@dnd-kit/core`, `@dnd-kit/utilities` (sortable instalado mas não exigido pela implementação atual).
