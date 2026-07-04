"use client";

import { useEffect } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function SecretariaError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 rounded-xl border bg-card p-10 text-center">
      <AlertTriangle className="h-10 w-10 text-destructive" aria-hidden />
      <div className="space-y-1">
        <h2 className="text-lg font-semibold">Não foi possível carregar esta tela</h2>
        <p className="text-sm text-muted-foreground">
          Ocorreu um erro inesperado. Tente novamente ou volte mais tarde.
        </p>
      </div>
      <Button type="button" onClick={() => unstable_retry()}>
        <RefreshCw className="mr-2 h-4 w-4" aria-hidden />
        Tentar novamente
      </Button>
    </div>
  );
}
