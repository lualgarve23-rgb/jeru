"use client";

import { useRef, useTransition } from "react";
import type { StatusAdmissao } from "@prisma/client";
import { statusAdmissaoLabels, statusAdmissaoOrder } from "@/lib/labels";
import { StatusKanban } from "@/components/status-kanban";
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

function CardBody({
  processo,
  readOnly,
}: {
  processo: Processo;
  readOnly: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const fotoInputRef = useRef<HTMLInputElement>(null);

  return (
    <>
      <div className="flex items-center gap-2.5">
        {readOnly ? (
          <CandidatoAvatar processo={processo} />
        ) : (
          <>
            <button
              type="button"
              title={
                processo.fotoUrl
                  ? "Trocar foto do candidato"
                  : "Adicionar foto do candidato"
              }
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
          </>
        )}
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
        {readOnly ? (
          <p className="text-xs text-muted-foreground">
            {processo.certidoesValidas
              ? "Certidões válidas"
              : "Certidões pendentes"}
          </p>
        ) : (
          <>
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
            {processo.status !== "REPROVADO" &&
              processo.status !== "INICIADO" && (
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
          </>
        )}
      </div>
    </>
  );
}

export function AdmissaoKanban({
  processos,
  readOnly = false,
}: {
  processos: Processo[];
  readOnly?: boolean;
}) {
  return (
    <StatusKanban<StatusAdmissao, Processo>
      columns={statusAdmissaoOrder}
      labels={statusAdmissaoLabels}
      items={processos}
      onMove={moveProcessoAdmissao}
      readOnly={readOnly}
      renderCard={(p) => <CardBody processo={p} readOnly={readOnly} />}
      renderOverlay={(p) => (
        <div className="flex w-64 items-center gap-2.5 rounded-lg border bg-card p-3 text-sm shadow-lg">
          <CandidatoAvatar processo={p} />
          {p.nomeCandidato}
        </div>
      )}
    />
  );
}
