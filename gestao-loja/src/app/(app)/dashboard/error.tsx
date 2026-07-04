"use client";

import { useEffect } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 rounded-xl border bg-card p-10 text-center">
      <AlertTriangle className="h-10 w-10 text-destructive" aria-hidden />
      <div className="space-y-1">
        <h2 className="text-lg font-semibold">Não foi possível carregar o dashboard</h2>
        <p className="text-sm text-muted-foreground">
          Ocorreu um erro inesperado. Tente novamente ou volte mais tarde.
        </p>
      </div>
      <button
        type="button"
        onClick={reset}
        className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
      >
        <RefreshCw className="h-4 w-4" aria-hidden />
        Tentar novamente
      </button>
    </div>
  );
}
