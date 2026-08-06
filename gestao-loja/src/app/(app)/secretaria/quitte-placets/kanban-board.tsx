"use client";

import { useState } from "react";
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
import type { StatusPlacet } from "@prisma/client";
import { statusPlacetLabels } from "@/lib/labels";
import { Badge } from "@/components/ui/badge";
import { moveQuittePlacet } from "../actions";

export type PlacetCard = {
  id: string;
  status: StatusPlacet;
  memberName: string;
  memberCim: string;
  quitacaoFinanceira: boolean;
  assinaturas: number;
  temFormulario: boolean;
  enviadoGSelos: boolean;
  dataSolicitacao: string;
};

// Etapas do processo, na ordem em que ele caminha
const COLUNAS: StatusPlacet[] = ["PENDENTE", "EM_ANALISE", "APROVADO", "NEGADO"];

function Etiquetas({ placet }: { placet: PlacetCard }) {
  return (
    <div className="flex flex-wrap gap-1">
      <Badge variant={placet.quitacaoFinanceira ? "success" : "warning"}>
        {placet.quitacaoFinanceira ? "Nada Consta" : "Pendências"}
      </Badge>
      <Badge variant="outline">{placet.assinaturas}/2 assinaturas</Badge>
      {placet.temFormulario && <Badge variant="outline">Form. 122</Badge>}
      {placet.enviadoGSelos && <Badge variant="success">Enviado</Badge>}
    </div>
  );
}

function Card({
  placet,
  readOnly,
}: {
  placet: PlacetCard;
  readOnly: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useDraggable({ id: placet.id, disabled: readOnly });

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
      className={`select-none touch-manipulation space-y-2 rounded-lg border bg-card p-3 text-sm shadow-sm outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 ${
        readOnly ? "" : "cursor-grab active:cursor-grabbing"
      }`}
    >
      <div>
        <p className="font-medium">{placet.memberName}</p>
        <p className="text-xs text-muted-foreground">
          CIM {placet.memberCim} · {placet.dataSolicitacao}
        </p>
      </div>
      <Etiquetas placet={placet} />
    </div>
  );
}

function Column({
  status,
  placets,
  readOnly,
}: {
  status: StatusPlacet;
  placets: PlacetCard[];
  readOnly: boolean;
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
          {statusPlacetLabels[status]}
        </h3>
        <Badge variant="outline">{placets.length}</Badge>
      </div>
      {placets.map((p) => (
        <Card key={p.id} placet={p} readOnly={readOnly} />
      ))}
    </div>
  );
}

export function QuittePlacetKanban({
  placets: initial,
  readOnly = false,
}: {
  placets: PlacetCard[];
  readOnly?: boolean;
}) {
  const [placets, setPlacets] = useState(initial);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 250, tolerance: 8 },
    }),
    useSensor(KeyboardSensor)
  );

  function handleDragEnd(event: DragEndEvent) {
    setActiveId(null);
    const { active, over } = event;
    if (!over) return;
    const toStatus = over.id as StatusPlacet;
    const placet = placets.find((p) => p.id === active.id);
    if (!placet || placet.status === toStatus) return;

    const previous = placets;
    setPlacets((prev) =>
      prev.map((p) => (p.id === placet.id ? { ...p, status: toStatus } : p))
    );
    setError(null);
    moveQuittePlacet(placet.id, toStatus).then((res) => {
      if (res?.error) {
        setPlacets(previous);
        setError(res.error);
      }
    });
  }

  const active = placets.find((p) => p.id === activeId);

  return (
    <div className="space-y-2">
      {error && (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}
      <DndContext
        sensors={sensors}
        onDragStart={(e: DragStartEvent) => setActiveId(String(e.active.id))}
        onDragEnd={handleDragEnd}
      >
        <div className="flex gap-3 overflow-x-auto pb-2">
          {COLUNAS.map((status) => (
            <Column
              key={status}
              status={status}
              placets={placets.filter((p) => p.status === status)}
              readOnly={readOnly}
            />
          ))}
        </div>
        <DragOverlay>
          {active ? (
            <div className="w-64 rounded-lg border bg-card p-3 text-sm shadow-lg">
              {active.memberName}
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>
    </div>
  );
}
