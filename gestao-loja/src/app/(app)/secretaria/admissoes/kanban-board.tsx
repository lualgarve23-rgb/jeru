"use client";

import { useRef, useState, useTransition } from "react";
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
import type { StatusAdmissao } from "@prisma/client";
import { statusAdmissaoLabels, statusAdmissaoOrder } from "@/lib/labels";
import { Badge } from "@/components/ui/badge";
import {
  moveProcessoAdmissao,
  setCertidoesValidas,
  setFotoProcessoAdmissao,
  reprovarProcessoAdmissao,
} from "../actions";

type Processo = {
  id: string;
  nomeCandidato: string;
  status: StatusAdmissao;
  certidoesValidas: boolean;
  cpf: string | null;
  email: string | null;
  fotoUrl: string | null;
};

function CandidatoAvatar({
  processo,
  className = "h-9 w-9",
}: {
  processo: Pick<Processo, "nomeCandidato" | "fotoUrl">;
  className?: string;
}) {
  if (processo.fotoUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={processo.fotoUrl}
        alt={`Foto de ${processo.nomeCandidato}`}
        className={`${className} shrink-0 rounded-full border object-cover`}
      />
    );
  }
  return (
    <span
      aria-hidden
      className={`${className} flex shrink-0 items-center justify-center rounded-full border bg-muted text-xs font-semibold text-muted-foreground`}
    >
      {processo.nomeCandidato
        .split(/\s+/)
        .map((p) => p[0])
        .filter(Boolean)
        .slice(0, 2)
        .join("")
        .toUpperCase()}
    </span>
  );
}

function Card({ processo }: { processo: Processo }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useDraggable({ id: processo.id });
  const [pending, startTransition] = useTransition();
  const fotoInputRef = useRef<HTMLInputElement>(null);

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
      className="cursor-grab select-none touch-manipulation space-y-2 rounded-lg border bg-card p-3 text-sm shadow-sm outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 active:cursor-grabbing"
    >
      <div className="flex items-center gap-2.5">
        <button
          type="button"
          title={processo.fotoUrl ? "Trocar foto do candidato" : "Adicionar foto do candidato"}
          disabled={pending}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={() => fotoInputRef.current?.click()}
          className="rounded-full outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
        >
          <CandidatoAvatar processo={processo} />
          <span className="sr-only">
            {processo.fotoUrl ? "Trocar" : "Adicionar"} foto de{" "}
            {processo.nomeCandidato}
          </span>
        </button>
        <input
          ref={fotoInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (!file) return;
            const fd = new FormData();
            fd.set("foto", file);
            startTransition(() => {
              void setFotoProcessoAdmissao(processo.id, fd);
            });
          }}
        />
        <div className="min-w-0">
          <p className="truncate font-medium">{processo.nomeCandidato}</p>
          {processo.email && (
            <p className="truncate text-xs text-muted-foreground">
              {processo.email}
            </p>
          )}
        </div>
      </div>
      <div className="flex items-center justify-between gap-2">
        <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <input
            type="checkbox"
            checked={processo.certidoesValidas}
            disabled={pending}
            onPointerDown={(e) => e.stopPropagation()}
            onChange={(e) =>
              startTransition(() => {
                void setCertidoesValidas(processo.id, e.target.checked);
              })
            }
          />
          Certidões válidas
        </label>
        {processo.status !== "REPROVADO" && processo.status !== "INICIADO" && (
          <button
            type="button"
            disabled={pending}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() =>
              startTransition(() => {
                void reprovarProcessoAdmissao(processo.id);
              })
            }
            className="text-xs text-destructive hover:underline"
          >
            Reprovar
          </button>
        )}
      </div>
    </div>
  );
}

function Column({
  status,
  processos,
}: {
  status: StatusAdmissao;
  processos: Processo[];
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
          {statusAdmissaoLabels[status]}
        </h3>
        <Badge variant="outline">{processos.length}</Badge>
      </div>
      {processos.map((p) => (
        <Card key={p.id} processo={p} />
      ))}
    </div>
  );
}

export function AdmissaoKanban({
  processos: initial,
}: {
  processos: Processo[];
}) {
  const [processos, setProcessos] = useState(initial);
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
    const toStatus = over.id as StatusAdmissao;
    const processo = processos.find((p) => p.id === active.id);
    if (!processo || processo.status === toStatus) return;

    const previous = processos;
    setProcessos((prev) =>
      prev.map((p) => (p.id === processo.id ? { ...p, status: toStatus } : p))
    );
    setError(null);
    moveProcessoAdmissao(processo.id, toStatus).then((res) => {
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
          {statusAdmissaoOrder.map((status) => (
            <Column
              key={status}
              status={status}
              processos={processos.filter((p) => p.status === status)}
            />
          ))}
        </div>
        <DragOverlay>
          {active ? (
            <div className="flex w-64 items-center gap-2.5 rounded-lg border bg-card p-3 text-sm shadow-lg">
              <CandidatoAvatar processo={active} />
              {active.nomeCandidato}
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>
    </div>
  );
}
