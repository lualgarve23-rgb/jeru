"use client";

import { useActionState, useEffect, useState } from "react";
import { PenLine } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

type ActionResult = { error?: string; ok?: string } | undefined;

// Assinatura sem sair do dashboard: pré-visualização do documento e
// confirmação por senha como ato formal de assinatura (loja.md §7C).
export function InlineSignDialog({
  title,
  description,
  preview,
  action,
}: {
  title: string;
  description: string;
  preview: string;
  action: (prev: ActionResult, formData: FormData) => Promise<ActionResult>;
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(action, undefined);

  // fecha o diálogo quando a assinatura é registrada com sucesso
  useEffect(() => {
    if (state?.ok) setOpen(false);
  }, [state]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <PenLine className="mr-1.5 h-4 w-4" /> Assinar agora
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <div className="max-h-60 overflow-y-auto whitespace-pre-wrap rounded-md border bg-muted/30 p-3 text-sm">
          {preview}
        </div>

        <form action={formAction} className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="sign-password">Confirme com a sua senha</Label>
            <Input
              id="sign-password"
              name="password"
              type="password"
              autoComplete="current-password"
              placeholder="Sua senha de acesso"
              required
            />
            <p className="text-xs text-muted-foreground">
              A confirmação da senha registra a sua assinatura digital, com
              autor e data/hora.
            </p>
          </div>
          {state?.error && (
            <p className="text-sm text-red-600" role="alert">
              {state.error}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Assinando..." : "Assinar documento"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
