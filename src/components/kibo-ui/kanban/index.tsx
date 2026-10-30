"use client";

import {
  type Announcements,
  type DndContextProps,
  type DragEndEvent,
  type DragStartEvent,
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  closestCorners,
} from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import {
  type CSSProperties,
  type ReactNode,
  createContext,
  useContext,
  useMemo,
  useState,
  type ElementType,
} from "react";

export type KanbanColumnProps = {
  id: string;
  name: string;
  color?: string;
};

export type KanbanItem = {
  id: string;
  column: string;
} & Record<string, unknown>;

type KanbanContextProps = {
  columns: KanbanColumnProps[];
  data: KanbanItem[];
  activeItemId: string | null;
  draggable: boolean;
};

const KanbanContext = createContext<KanbanContextProps | undefined>(undefined);

function useKanban() {
  const context = useContext(KanbanContext);
  if (!context) {
    throw new Error("useKanban deve ser usado dentro de KanbanProvider");
  }
  return context;
}

export function KanbanProvider({
  announcements,
  children,
  columns,
  data,
  onDataChange,
  onDragEnd,
  onDragStart,
  overlay,
  draggable,
  ...props
}: {
  announcements?: Announcements;
  children: (column: KanbanColumnProps) => ReactNode;
  columns: KanbanColumnProps[];
  data: KanbanItem[];
  onDataChange: (data: KanbanItem[]) => void;
  overlay?: (item: KanbanItem) => ReactNode;
  draggable?: boolean;
} & Omit<DndContextProps, "children">) {
  const [activeItemId, setActiveItemId] = useState<string | null>(null);
  const sensors = useSensors(
    ...(draggable === false
      ? []
      : [
          useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
          useSensor(KeyboardSensor),
        ]),
  );

  const findItem = (id: string) => data.find((item) => item.id === id);

  const handleDragStart = (event: DragStartEvent) => {
    setActiveItemId(String(event.active.id));
    onDragStart?.(event);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveItemId(null);
    onDragEnd?.(event);
    const { active, over } = event;
    if (!over) return;
    const activeItem = findItem(String(active.id));
    if (!activeItem) return;
    const overId = String(over.id);
    const isColumn = columns.some((column) => column.id === overId);
    const targetColumn = isColumn
      ? overId
      : (findItem(overId)?.column ?? activeItem.column);
    if (targetColumn === activeItem.column) return;
    onDataChange(
      data.map((item) =>
        item.id === activeItem.id ? { ...item, column: targetColumn } : item,
      ),
    );
  };

  const value = useMemo(
    () => ({ columns, data, activeItemId, draggable: draggable !== false }),
    [columns, data, activeItemId, draggable],
  );

  return (
    <KanbanContext.Provider value={value}>
      <DndContext
        accessibility={{ announcements }}
        collisionDetection={closestCorners}
        onDragEnd={handleDragEnd}
        onDragStart={handleDragStart}
        sensors={sensors}
        {...props}
      >
        {columns.map((column) => children(column))}
        <KanbanOverlay>{overlay}</KanbanOverlay>
      </DndContext>
    </KanbanContext.Provider>
  );
}

export function KanbanBoard({ id, children }: { id: string; children: ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id });
  const { data } = useKanban();
  const items = data.filter((item) => item.column === id);
  return (
    <div
      className={`flex min-w-64 flex-1 shrink-0 flex-col rounded-xl border border-slate-200 bg-slate-100/70 transition-colors dark:border-zinc-800 dark:bg-zinc-900/50 ${isOver ? "border-selected/60 bg-selected/5" : ""}`}
      data-board={id}
      ref={setNodeRef}
    >
      {children}
      {items.length === 0 ? (
        <p className="px-3 pb-3 text-[11px] text-slate-400 dark:text-zinc-500">Vazio</p>
      ) : null}
    </div>
  );
}

export function KanbanHeader({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2 px-3 pb-2 pt-3">
      {children}
    </div>
  );
}

export function KanbanCards({
  id,
  children,
}: {
  id: string;
  children: (item: KanbanItem) => ReactNode;
}) {
  const { data } = useKanban();
  const items = data.filter((item) => item.column === id);
  return (
    <div className="flex flex-1 flex-col gap-2 px-2 pb-2">
      {items.map((item) => children(item))}
    </div>
  );
}

export function KanbanCard({
  column,
  id,
  name,
  children,
}: {
  column: string;
  id: string;
  name: string;
  children: ReactNode;
}) {
  const { draggable: canDrag } = useKanban();
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id, disabled: !canDrag });
  const style: CSSProperties = {
    transform: CSS.Translate.toString(transform),
    opacity: isDragging ? 0.4 : 1,
    touchAction: "none",
  };

  // Filter attributes to only include valid DOM attributes for React 19 compatibility
  const validAttributes = canDrag
    ? Object.fromEntries(
        Object.entries(attributes).filter(([key]) =>
          key.startsWith("data-") || key.startsWith("aria-") || ["id", "role", "tabIndex"].includes(key)
        )
      )
    : {};
  const validListeners = canDrag ? listeners : {};

  return (
    <div
      {...validAttributes}
      {...validListeners}
      className={`${canDrag ? "cursor-grab" : "cursor-default"} rounded-xl border border-slate-200 bg-white p-3 shadow-xs dark:border-zinc-800 dark:bg-card ${isDragging ? "ring-2 ring-selected/40" : "hover:border-slate-300 dark:hover:border-zinc-700"}`}
      data-dragging={isDragging ? "" : undefined}
      style={style}
      ref={setNodeRef}
      aria-roledescription="Cartão arrastável"
      data-name={name}
      data-column={column}
    >
      {children}
    </div>
  );
}

/** Overlay do card sendo arrastado. Montado automaticamente pelo KanbanProvider via prop `overlay`. */
export function KanbanOverlay({ children }: { children?: (item: KanbanItem) => ReactNode }) {
  const { activeItemId, data } = useKanban();
  return (
    <DragOverlay dropAnimation={{ duration: 180, easing: "cubic-bezier(0.18, 0.67, 0.6, 1.22)" }}>
      {((active: { id: string } | null) => {
        if (!active) return null;
        const item = data.find((entry) => entry.id === active.id);
        if (!item || !children) return null;
        return (
          <div className="w-64 rotate-2 cursor-grabbing rounded-xl border border-slate-200 bg-white p-3 shadow-xl ring-2 ring-selected/50 dark:border-zinc-700 dark:bg-card">
            {children(item)}
          </div>
        );
      }) as unknown as React.ReactNode}
    </DragOverlay>
  );
}
