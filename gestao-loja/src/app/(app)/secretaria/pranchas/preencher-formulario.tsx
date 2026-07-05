"use client";

import { useState } from "react";
import { Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

type Membro = { id: string; name: string; cim: string };

// Diálogo "Preencher automaticamente" de um formulário GOB: coleta as
// entradas que o mapa do formulário usa (obreiro, data da sessão, candidato)
// e baixa o DOCX preenchido pela rota /secretaria/formularios.
export function PreencherFormulario({
  arquivo,
  titulo,
  usaObreiro,
  usaCandidato,
  usaDataSessao,
  membros,
}: {
  arquivo: string;
  titulo: string;
  usaObreiro: boolean;
  usaCandidato: boolean;
  usaDataSessao: boolean;
  membros: Membro[];
}) {
  const [open, setOpen] = useState(false);
  const [obreiroId, setObreiroId] = useState("");
  const [dataSessao, setDataSessao] = useState("");
  const [candidato, setCandidato] = useState("");

  function baixar() {
    const params = new URLSearchParams({ arquivo });
    if (obreiroId) params.set("obreiroId", obreiroId);
    if (dataSessao) params.set("dataSessao", dataSessao);
    if (candidato) params.set("candidato", candidato);
    window.location.href = `/secretaria/formularios?${params.toString()}`;
    setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button
          type="button"
          className="inline-flex items-center gap-1 text-xs text-primary underline underline-offset-2"
          title="Preencher automaticamente com os dados da Loja"
        >
          <Wand2 className="h-3 w-3" /> preencher
        </button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-base">
            Preencher — {titulo}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Os dados da Loja, do Oriente e dos cargos atuais (Venerável,
            Secretário, Orador, Tesoureiro) são preenchidos automaticamente.
            Campos específicos ficam em branco para completar no Word.
          </p>
          {usaObreiro && (
            <div className="space-y-1">
              <Label htmlFor={`obreiro-${arquivo}`}>Obreiro</Label>
              <select
                id={`obreiro-${arquivo}`}
                value={obreiroId}
                onChange={(e) => setObreiroId(e.target.value)}
                className="h-9 w-full rounded-md border bg-transparent px-2 text-sm"
              >
                <option value="">— não preencher —</option>
                {membros.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name} (CIM {m.cim})
                  </option>
                ))}
              </select>
            </div>
          )}
          {usaCandidato && (
            <div className="space-y-1">
              <Label htmlFor={`candidato-${arquivo}`}>Nome do candidato</Label>
              <Input
                id={`candidato-${arquivo}`}
                value={candidato}
                onChange={(e) => setCandidato(e.target.value)}
                placeholder="opcional"
              />
            </div>
          )}
          {usaDataSessao && (
            <div className="space-y-1">
              <Label htmlFor={`sessao-${arquivo}`}>Data da sessão</Label>
              <Input
                id={`sessao-${arquivo}`}
                type="date"
                value={dataSessao}
                onChange={(e) => setDataSessao(e.target.value)}
              />
            </div>
          )}
          <Button onClick={baixar} className="w-full">
            Baixar DOCX preenchido
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
