"use client";

import { useState, useTransition } from "react";
import { Trash2, TriangleAlert } from "lucide-react";
import { excluirSessao } from "../../actions";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import type { ResumoSessaoExclusao } from "@/lib/sessao-exclusao";
import { avisosExclusaoSessao } from "@/lib/sessao-exclusao";

// Confirmação da exclusão: mostra os dados da sessão e o que será apagado
// antes de o Secretário/VM confirmar. A regra de bloqueio vive no servidor.
export function ExcluirSessaoDialog({
  sessionId,
  resumo,
  bloqueio,
}: {
  sessionId: string;
  resumo: ResumoSessaoExclusao;
  /** Motivo que impede a exclusão (ata fora do rascunho); null = pode excluir */
  bloqueio: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const avisos = avisosExclusaoSessao(resumo);

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (pending) return;
        setOpen(v);
        if (!v) setError(null);
      }}
    >
      <DialogTrigger asChild>
        <Button variant="destructive" disabled={!!bloqueio}>
          <Trash2 className="mr-1.5 h-4 w-4" /> Excluir sessão
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <TriangleAlert className="h-5 w-5 text-destructive" />
            Excluir {resumo.titulo}?
          </DialogTitle>
          <DialogDescription>
            Esta ação é irreversível. Confira os dados antes de confirmar.
          </DialogDescription>
        </DialogHeader>

        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 rounded-md border bg-muted/30 p-3 text-sm">
          <dt className="text-muted-foreground">Sessão</dt>
          <dd className="font-medium">{resumo.titulo}</dd>
          <dt className="text-muted-foreground">Data e hora</dt>
          <dd>{resumo.dataHora}</dd>
          {resumo.grau && (
            <>
              <dt className="text-muted-foreground">Grau</dt>
              <dd>{resumo.grau}</dd>
            </>
          )}
          {resumo.pauta && (
            <>
              <dt className="text-muted-foreground">Pauta</dt>
              <dd className="whitespace-pre-wrap">{resumo.pauta}</dd>
            </>
          )}
          <dt className="text-muted-foreground">Presenças</dt>
          <dd>
            {resumo.presentes} irmão(s)
            {resumo.visitantes > 0 ? ` · ${resumo.visitantes} visitante(s)` : ""}
            {resumo.confirmados > 0 ? ` · ${resumo.confirmados} confirmado(s) pelo convite` : ""}
            {resumo.justificadas > 0 ? ` · ${resumo.justificadas} justificada(s)` : ""}
          </dd>
          <dt className="text-muted-foreground">Ata</dt>
          <dd>
            {resumo.ataRascunho !== null
              ? `Rascunho da Ata nº ${resumo.ataRascunho}`
              : "Nenhuma ata lavrada"}
          </dd>
        </dl>

        <div className="space-y-1 text-sm">
          <p className="font-medium">Ao confirmar:</p>
          <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
            {avisos.map((a) => (
              <li key={a}>{a}</li>
            ))}
          </ul>
        </div>

        {error && (
          <p className="text-sm text-red-600" role="alert">
            {error}
          </p>
        )}

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            disabled={pending}
            onClick={() => setOpen(false)}
          >
            Cancelar
          </Button>
          <Button
            type="button"
            variant="destructive"
            disabled={pending}
            onClick={() => {
              setError(null);
              startTransition(async () => {
                const res = await excluirSessao(sessionId);
                if (res?.error) setError(res.error);
              });
            }}
          >
            {pending ? "Excluindo..." : "Sim, excluir a sessão"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
