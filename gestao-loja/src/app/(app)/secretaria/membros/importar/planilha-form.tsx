"use client";

import { useActionState } from "react";
import { importarMembrosPlanilha, type ImportResult } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const acaoBadge: Record<string, "default" | "secondary" | "outline"> = {
  criar: "default",
  atualizar: "secondary",
  pular: "outline",
};

export function ImportPlanilhaForm() {
  const [state, formAction, pending] = useActionState<ImportResult, FormData>(
    importarMembrosPlanilha,
    undefined
  );
  const resultado = state && "linhas" in state ? state : null;

  return (
    <div className="space-y-6">
      <form action={formAction} className="space-y-3">
        <div className="space-y-1">
          <Label htmlFor="planilha">Arquivo CSV (no modelo)</Label>
          <Input id="planilha" name="planilha" type="file" accept=".csv,text/csv" required />
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="simulacao" defaultChecked className="h-4 w-4" />
          Somente conferir (simulação — não grava nada)
        </label>
        {state && "error" in state && state.error && (
          <p className="text-sm text-destructive" role="alert">
            {state.error}
          </p>
        )}
        {resultado && <p className="text-sm text-success">{resultado.ok}</p>}
        <Button type="submit" disabled={pending}>
          {pending ? "Importando..." : "Importar planilha"}
        </Button>
      </form>

      {resultado && (
        <div className="overflow-x-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>CIM</TableHead>
                <TableHead>Nome</TableHead>
                <TableHead>Grau</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Ação</TableHead>
                <TableHead>Observação</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {resultado.linhas.map((l, i) => (
                <TableRow key={`${l.cim}-${i}`}>
                  <TableCell className="whitespace-nowrap">{l.cim}</TableCell>
                  <TableCell>{l.nome}</TableCell>
                  <TableCell>{l.grau}</TableCell>
                  <TableCell>{l.status}</TableCell>
                  <TableCell>
                    <Badge variant={acaoBadge[l.acao]}>
                      {resultado.simulacao && l.acao !== "pular" ? `${l.acao} (simulação)` : l.acao}
                    </Badge>
                    {l.motivo && (
                      <span className="ml-2 text-xs text-muted-foreground">{l.motivo}</span>
                    )}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">{l.meta}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
