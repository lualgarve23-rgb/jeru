"use client";

import { useState, type ReactNode } from "react";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { Badge } from "@/components/ui/badge";

// Esqueleto compartilhado dos quadros kanban por status (Admissões, Quitte
// Placets...): colunas droppable, cards arrastáveis com atualização otimista
// e rollback quando o servidor recusa o movimento. Cada quadro fornece só a
// lista de colunas, o rótulo, a action de movimentação e o corpo do card.

type ActionResult = { error?: string; ok?: string } | undefined;

type Item<S extends string> = { id: string; status: S };

function DraggableCard<S extends string, T extends Item<S>>({
  item,
  readOnly,
  renderCard,
}: {
  item: T;
  readOnly: boolean;
  renderCard: (item: T) => ReactNode;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useDraggable({ id: item.id, disabled: readOnly });
  return (
    <div
      ref={setNodeRef}
      {...(readOnly ? {} : listeners)}
      {...(readOnly ? {} : attributes)}
      style={{
        transform: transform
          ? `translate3d(${transform.x}px, ${transform.y}px, 0)`
          : undefined,
        opacity: isDragging ? 0.4 : 1,
      }}
      className={`select-none touch-manipulation shadow-card space-y-2 rounded-xl border border-border bg-card p-3 text-sm outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 ${
        readOnly ? "" : "cursor-grab active:cursor-grabbing"
      }`}
    >
      {renderCard(item)}
    </div>
  );
}

function Column<S extends string, T extends Item<S>>({
  status,
  label,
  items,
  readOnly,
  renderCard,
}: {
  status: S;
  label: string;
  items: T[];
  readOnly: boolean;
  renderCard: (item: T) => ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: status, disabled: readOnly });
  return (
    <div
      ref={setNodeRef}
      className={`flex min-h-[180px] w-64 shrink-0 flex-col gap-2 rounded-xl border bg-muted/40 p-3 ${
        isOver ? "ring-2 ring-primary" : ""
      }`}
    >
      <div className="mb-1 flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {label}
        </h3>
        <Badge variant="outline">{items.length}</Badge>
      </div>
      {items.map((item) => (
        <DraggableCard
          key={item.id}
          item={item}
          readOnly={readOnly}
          renderCard={renderCard}
        />
      ))}
    </div>
  );
}

export function StatusKanban<S extends string, T extends Item<S>>({
  columns,
  labels,
  items: initial,
  onMove,
  readOnly = false,
  renderCard,
  renderOverlay,
}: {
  columns: readonly S[];
  labels: Record<string, string>;
  items: T[];
  onMove: (id: string, toStatus: S) => Promise<ActionResult>;
  readOnly?: boolean;
  renderCard: (item: T) => ReactNode;
  renderOverlay: (item: T) => ReactNode;
}) {
  const [items, setItems] = useState(initial);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Sensores separados por dispositivo: mouse arrasta de imediato; no
  // touch o arrasto ativa por toque longo (250ms) — sem isso o navegador
  // trata o gesto como scroll e cancela o drag no celular. Keyboard torna
  // o quadro operável sem mouse (WCAG 2.1.1): espaço pega o card, setas
  // movem, espaço solta.
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 250, tolerance: 8 },
    }),
    useSensor(KeyboardSensor)
  );

  function handleDragStart(event: DragStartEvent) {
    setActiveId(String(event.active.id));
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveId(null);
    const { active, over } = event;
    if (!over) return;
    const toStatus = over.id as S;
    const item = items.find((i) => i.id === active.id);
    if (!item || item.status === toStatus) return;

    const previous = items;
    setItems((prev) =>
      prev.map((i) => (i.id === item.id ? { ...i, status: toStatus } : i))
    );
    setError(null);
    onMove(item.id, toStatus).then((res) => {
      if (res?.error) {
        setItems(previous);
        setError(res.error);
      }
    });
  }

  const active = items.find((i) => i.id === activeId);

  return (
    <div className="space-y-2">
      {error && (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}
      <DndContext
        sensors={sensors}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <div className="flex gap-3 overflow-x-auto pb-2">
          {columns.map((status) => (
            <Column
              key={status}
              status={status}
              label={labels[status] ?? status}
              items={items.filter((i) => i.status === status)}
              readOnly={readOnly}
              renderCard={renderCard}
            />
          ))}
        </div>
        <DragOverlay>{active ? renderOverlay(active) : null}</DragOverlay>
      </DndContext>
    </div>
  );
}
