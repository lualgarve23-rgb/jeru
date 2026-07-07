"use client";

import { useState, useTransition } from "react";
import { deleteCargoRito } from "../actions";

export function DeleteCargoButton({
  cargoId,
  nome,
}: {
  cargoId: string;
  nome: string;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <span className="flex items-center gap-2">
      {error && (
        <span className="text-xs text-destructive" role="alert">
          {error}
        </span>
      )}
      <button
        type="button"
        disabled={pending}
        className="text-xs text-destructive hover:underline"
        onClick={() => {
          if (!confirm(`Excluir o cargo "${nome}"?`)) return;
          setError(null);
          startTransition(async () => {
            const res = await deleteCargoRito(cargoId);
            if (res?.error) setError(res.error);
          });
        }}
      >
        Excluir
      </button>
    </span>
  );
}
