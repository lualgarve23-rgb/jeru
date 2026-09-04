"use client";

import { useActionState, useState } from "react";
import { NotebookPen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { registrarContatoEsmoler } from "./actions";

type ActionResult = { error?: string; ok?: string } | undefined;

// "Registrar contato": abre um campo de nota inline e grava pela action
export function RegistrarContato({ userId, nome }: { userId: string; nome: string }) {
  const [aberto, setAberto] = useState(false);
  const [state, formAction, pending] = useActionState(
    async (prev: ActionResult, fd: FormData) => {
      const r = await registrarContatoEsmoler(userId, prev, fd);
      if (r?.ok) setAberto(false);
      return r;
    },
    undefined
  );

  if (!aberto) {
    return (
      <div className="space-y-1">
        <Button type="button" size="sm" variant="outline" onClick={() => setAberto(true)}>
          <NotebookPen className="mr-1.5 h-4 w-4" /> Registrar contato
        </Button>
        {state?.ok && <p className="text-xs text-success">{state.ok}</p>}
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-2">
      <div className="space-y-1">
        <Label htmlFor={`nota-${userId}`}>Como foi o contato com {nome.split(" ")[0]}?</Label>
        <textarea
          id={`nota-${userId}`}
          name="nota"
          required
          minLength={3}
          maxLength={1000}
          rows={3}
          placeholder="Ex.: liguei, está bem; passa por dificuldade financeira e vai procurar a Tesouraria."
          className="w-full rounded-md border border-border bg-transparent px-3 py-2 text-sm"
        />
      </div>
      {state?.error && (
        <p className="text-sm text-destructive" role="alert">
          {state.error}
        </p>
      )}
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? "Salvando..." : "Salvar contato"}
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={() => setAberto(false)}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}
