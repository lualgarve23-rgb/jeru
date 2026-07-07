"use client";

import { useState, useTransition } from "react";
import { degreeLabels, roleLabels } from "@/lib/labels";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  updateDegreeHistory,
  deleteDegreeHistory,
  updateRoleHistory,
  deleteRoleHistory,
} from "../../actions";

type DegreeEntry = { id: string; degree: string; date: string };
type RoleEntry = {
  id: string;
  role: string;
  startDate: string;
  endDate: string | null;
};

function formatBR(iso: string) {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

const selectClass =
  "h-8 w-full rounded-md border bg-transparent px-2 text-sm";

export function HistoricoGraus({ entries }: { entries: DegreeEntry[] }) {
  const [editing, setEditing] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function run(fn: () => Promise<{ error?: string } | undefined>) {
    setError(null);
    startTransition(async () => {
      const res = await fn();
      if (res?.error) setError(res.error);
      else setEditing(null);
    });
  }

  return (
    <div>
      <p className="mb-2 font-semibold">Graus</p>
      {error && (
        <p className="mb-2 text-xs text-destructive" role="alert">
          {error}
        </p>
      )}
      <ul className="space-y-2">
        {entries.map((d) =>
          editing === d.id ? (
            <li key={d.id}>
              <form
                className="flex flex-wrap items-center gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  const fd = new FormData(e.currentTarget);
                  run(() => updateDegreeHistory(d.id, fd));
                }}
              >
                <select name="degree" defaultValue={d.degree} className={selectClass + " w-40"}>
                  {Object.entries(degreeLabels).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
                <Input
                  name="date"
                  type="date"
                  defaultValue={d.date}
                  required
                  className="h-8 w-40"
                />
                <Button type="submit" size="sm" disabled={pending}>
                  Salvar
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => setEditing(null)}
                >
                  Cancelar
                </Button>
              </form>
            </li>
          ) : (
            <li key={d.id} className="flex flex-wrap items-center gap-2">
              <span>
                {degreeLabels[d.degree] ?? d.degree} — {formatBR(d.date)}
              </span>
              <button
                type="button"
                className="text-xs text-primary hover:underline"
                onClick={() => setEditing(d.id)}
              >
                Editar
              </button>
              <button
                type="button"
                disabled={pending}
                className="text-xs text-destructive hover:underline"
                onClick={() => {
                  if (confirm("Excluir este registro de grau?")) {
                    run(() => deleteDegreeHistory(d.id));
                  }
                }}
              >
                Excluir
              </button>
            </li>
          )
        )}
        {entries.length === 0 && (
          <li className="text-muted-foreground">Sem registros.</li>
        )}
      </ul>
    </div>
  );
}

export function HistoricoCargos({ entries }: { entries: RoleEntry[] }) {
  const [editing, setEditing] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function run(fn: () => Promise<{ error?: string } | undefined>) {
    setError(null);
    startTransition(async () => {
      const res = await fn();
      if (res?.error) setError(res.error);
      else setEditing(null);
    });
  }

  return (
    <div>
      <p className="mb-2 font-semibold">Cargos</p>
      {error && (
        <p className="mb-2 text-xs text-destructive" role="alert">
          {error}
        </p>
      )}
      <ul className="space-y-2">
        {entries.map((r) =>
          editing === r.id ? (
            <li key={r.id}>
              <form
                className="flex flex-wrap items-center gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  const fd = new FormData(e.currentTarget);
                  run(() => updateRoleHistory(r.id, fd));
                }}
              >
                <select name="role" defaultValue={r.role} className={selectClass + " w-48"}>
                  {Object.entries(roleLabels)
                    .filter(([value]) => value !== "SUPER_ADMIN")
                    .map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                </select>
                <Input
                  name="startDate"
                  type="date"
                  defaultValue={r.startDate}
                  required
                  className="h-8 w-40"
                  aria-label="Início"
                />
                <Input
                  name="endDate"
                  type="date"
                  defaultValue={r.endDate ?? ""}
                  className="h-8 w-40"
                  aria-label="Fim (vazio = cargo atual)"
                />
                <Button type="submit" size="sm" disabled={pending}>
                  Salvar
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => setEditing(null)}
                >
                  Cancelar
                </Button>
                <p className="w-full text-xs text-muted-foreground">
                  Deixe a data de fim vazia para marcar como cargo atual.
                </p>
              </form>
            </li>
          ) : (
            <li key={r.id} className="flex flex-wrap items-center gap-2">
              <span>
                {roleLabels[r.role] ?? r.role} — {formatBR(r.startDate)}
                {r.endDate ? ` a ${formatBR(r.endDate)}` : " (atual)"}
              </span>
              <button
                type="button"
                className="text-xs text-primary hover:underline"
                onClick={() => setEditing(r.id)}
              >
                Editar
              </button>
              <button
                type="button"
                disabled={pending}
                className="text-xs text-destructive hover:underline"
                onClick={() => {
                  if (confirm("Excluir este registro de cargo?")) {
                    run(() => deleteRoleHistory(r.id));
                  }
                }}
              >
                Excluir
              </button>
            </li>
          )
        )}
        {entries.length === 0 && (
          <li className="text-muted-foreground">Sem registros.</li>
        )}
      </ul>
    </div>
  );
}
