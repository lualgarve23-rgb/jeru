"use client";

// Select inline do nível de acesso (grauMinimo) de um item já enviado —
// salva na troca, sem formulário; visível só para editores da Secretaria.

import { useTransition } from "react";
import { toast } from "sonner";
import { GRAUS_ACERVO, grauMinimoLabels } from "@/lib/graus";

type ActionResult = { error?: string; ok?: string } | undefined;

export function GrauSelect({
  grau,
  action,
}: {
  grau: string;
  action: (grau: string) => Promise<ActionResult>;
}) {
  const [pending, startTransition] = useTransition();
  return (
    <select
      value={grau}
      disabled={pending}
      aria-label="Nível de acesso"
      onChange={(e) => {
        const novo = e.target.value;
        startTransition(async () => {
          const r = await action(novo);
          if (r?.error) toast.error(r.error);
          else toast.success(r?.ok ?? "Nível de acesso atualizado.");
        });
      }}
      className="h-7 rounded-md border bg-transparent px-1.5 text-xs text-muted-foreground disabled:opacity-50"
    >
      {GRAUS_ACERVO.map((g) => (
        <option key={g} value={g}>
          {grauMinimoLabels[g]}
        </option>
      ))}
    </select>
  );
}
