"use client";

import { useState, useTransition } from "react";
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
import type { Degree, StatusProgressao } from "@prisma/client";
import {
  degreeLabels,
  statusProgressaoLabels,
  statusProgressaoOrder,
} from "@/lib/labels";
import { Badge } from "@/components/ui/badge";
import {
  moveProcessoProgressao,
  setPlacetDeferido,
  setComunicadoEnviado,
} from "../actions";

const DAY_MS = 24 * 60 * 60 * 1000;
const COMMUNICATION_DEADLINE_DAYS = 15;

type Processo = {
  id: string;
  nome: string;
  cim: string;
  grauAlvo: Degree;
  status: StatusProgressao;
  placetDeferido: boolean;
  comunicadoEnviado: boolean;
  dataCerimonia: string | null; // ISO
  aptoEm: string | null; // ISO — data em que cumpre o interstício
  freqPct: number | null; // % de presença desde o início do processo
};

// Prazo de comunicação (15 dias pós-cerimônia): dias restantes (negativo = vencido)
function diasRestantes(p: Processo): number | null {
  if (p.status !== "COMUNICACAO_POS_CERIMONIA" || p.comunicadoEnviado) return null;
  if (!p.dataCerimonia) return null;
  const due =
    new Date(p.dataCerimonia).getTime() + COMMUNICATION_DEADLINE_DAYS * DAY_MS;
  return Math.ceil((due - Date.now()) / DAY_MS);
}

function Card({
  processo,
  readOnly,
  minFreq,
}: {
  processo: Processo;
  readOnly: boolean;
  minFreq: number;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useDraggable({ id: processo.id, disabled: readOnly });
  const [pending, startTransition] = useTransition();

  const aptoEm = processo.aptoEm ? new Date(processo.aptoEm) : null;
  const intersticePendente =
    processo.status === "CUMPRIMENTO_INTERSTICIO" &&
    aptoEm !== null &&
    aptoEm > new Date();
  const restantes = diasRestantes(processo);

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      style={{
        transform: transform
          ? `translate3d(${transform.x}px, ${transform.y}px, 0)`
          : undefined,
        opacity: isDragging ? 0.4 : 1,
      }}
      className={`select-none touch-manipulation space-y-2 rounded-lg border bg-card p-3 text-sm shadow-sm outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 ${
        readOnly ? "" : "cursor-grab active:cursor-grabbing"
      } ${restantes !== null && restantes < 0 ? "border-red-500 bg-red-50" : ""}`}
    >
      <p className="font-medium">{processo.nome}</p>
      <p className="text-xs text-muted-foreground">
        CIM {processo.cim} → {degreeLabels[processo.grauAlvo] ?? processo.grauAlvo}
      </p>

      {intersticePendente && aptoEm && (
        <p className="text-xs text-amber-700">
          🔒 Apto em {aptoEm.toLocaleDateString("pt-BR")}
        </p>
      )}
      {processo.status === "INSTRUCAO_E_FREQUENCIA" && (
        <p
          className={`text-xs ${
            processo.freqPct !== null && processo.freqPct < minFreq
              ? "font-medium text-amber-700"
              : "text-muted-foreground"
          }`}
        >
          {processo.freqPct === null
            ? "Sem sessões no período do processo"
            : `Frequência: ${processo.freqPct}% (mínimo ${minFreq}%)`}
        </p>
      )}
      {restantes !== null && (
        <p
          className={`text-xs font-medium ${
            restantes < 0
              ? "text-red-700"
              : restantes <= 3
                ? "text-amber-700"
                : "text-muted-foreground"
          }`}
        >
          {restantes < 0
            ? `Comunicação vencida há ${-restantes} dia(s)`
            : `Comunicação: ${restantes} dia(s) restante(s)`}
        </p>
      )}

      {!readOnly && processo.status !== "GRAU_CONCEDIDO" && (
        <div className="space-y-1">
          <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <input
              type="checkbox"
              checked={processo.placetDeferido}
              disabled={pending}
              onPointerDown={(e) => e.stopPropagation()}
              onChange={(e) =>
                startTransition(() => {
                  void setPlacetDeferido(processo.id, e.target.checked);
                })
              }
            />
            Placet deferido (G∴ dos Selos)
          </label>
          {processo.status === "COMUNICACAO_POS_CERIMONIA" && (
            <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <input
                type="checkbox"
                checked={processo.comunicadoEnviado}
                disabled={pending}
                onPointerDown={(e) => e.stopPropagation()}
                onChange={(e) =>
                  startTransition(() => {
                    void setComunicadoEnviado(processo.id, e.target.checked);
                  })
                }
              />
              Comunicação enviada (Sua Sessão)
            </label>
          )}
        </div>
      )}
    </div>
  );
}

function Column({
  status,
  processos,
  readOnly,
  minFreq,
}: {
  status: StatusProgressao;
  processos: Processo[];
  readOnly: boolean;
  minFreq: number;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: status });
  return (
    <div
      ref={setNodeRef}
      className={`flex min-h-[200px] w-64 shrink-0 flex-col gap-2 rounded-xl border bg-muted/40 p-3 ${
        isOver ? "ring-2 ring-primary" : ""
      }`}
    >
      <div className="mb-1 flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {statusProgressaoLabels[status]}
        </h3>
        <Badge variant="outline">{processos.length}</Badge>
      </div>
      {processos.map((p) => (
        <Card key={p.id} processo={p} readOnly={readOnly} minFreq={minFreq} />
      ))}
    </div>
  );
}

export function ProgressaoKanban({
  processos: initial,
  readOnly,
  minFreq,
}: {
  processos: Processo[];
  readOnly: boolean;
  minFreq: number;
}) {
  const [processos, setProcessos] = useState(initial);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // mesmos sensores do Kanban de Admissão: mouse imediato, toque longo no
  // celular, teclado para acessibilidade (espaço pega/solta, setas movem)
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
    const toStatus = over.id as StatusProgressao;
    const processo = processos.find((p) => p.id === active.id);
    if (!processo || processo.status === toStatus) return;

    const previous = processos;
    setProcessos((prev) =>
      prev.map((p) => (p.id === processo.id ? { ...p, status: toStatus } : p))
    );
    setError(null);
    moveProcessoProgressao(processo.id, toStatus).then((res) => {
      if (res?.error) {
        setProcessos(previous);
        setError(res.error);
      }
    });
  }

  const active = processos.find((p) => p.id === activeId);

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
          {statusProgressaoOrder.map((status) => (
            <Column
              key={status}
              status={status}
              processos={processos.filter((p) => p.status === status)}
              readOnly={readOnly}
              minFreq={minFreq}
            />
          ))}
        </div>
        <DragOverlay>
          {active ? (
            <div className="w-64 rounded-lg border bg-card p-3 text-sm shadow-lg">
              {active.nome}
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>
    </div>
  );
}
