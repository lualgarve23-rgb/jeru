"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";

type ActionResult = { error?: string; ok?: string } | undefined;

// Formulário genérico para server actions que retornam { error | ok }.
export function ActionForm({
  action,
  submitLabel,
  children,
  className,
}: {
  action: (prev: ActionResult, formData: FormData) => Promise<ActionResult>;
  submitLabel: string;
  children: React.ReactNode;
  className?: string;
}) {
  const [state, formAction, pending] = useActionState(action, undefined);
  return (
    <form action={formAction} className={className ?? "space-y-3"}>
      {children}
      {state?.error && (
        <p className="text-sm text-red-600" role="alert">
          {state.error}
        </p>
      )}
      {state?.ok && <p className="text-sm text-green-700">{state.ok}</p>}
      <Button type="submit" disabled={pending}>
        {pending ? "Processando..." : submitLabel}
      </Button>
    </form>
  );
}

// Botão isolado para actions sem campos (assinar, enviar, check-in).
export function ActionButton({
  action,
  label,
  variant = "default",
}: {
  action: () => Promise<ActionResult>;
  label: string;
  variant?: "default" | "outline" | "destructive" | "secondary";
}) {
  const [state, formAction, pending] = useActionState(
    async () => action(),
    undefined
  );
  return (
    <form action={formAction} className="inline-flex flex-col gap-1">
      <Button type="submit" variant={variant} disabled={pending}>
        {pending ? "..." : label}
      </Button>
      {state?.error && <p className="text-sm text-red-600">{state.error}</p>}
      {state?.ok && <p className="text-sm text-green-700">{state.ok}</p>}
    </form>
  );
}
