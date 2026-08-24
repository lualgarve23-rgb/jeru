"use client";

import { useState } from "react";
import { Label } from "@/components/ui/label";
import { degreeLabels, sessionTypeLabels } from "@/lib/labels";

// Selects de Tipo e Grau da nova sessão. Quando o tipo é EVENTO, o grau
// trava em N/A (e volta para Aprendiz ao sair de Evento).
export function TipoGrauSelects() {
  const [tipo, setTipo] = useState("ORDINARIA");
  const [grau, setGrau] = useState("APRENDIZ");
  const isEvento = tipo === "EVENTO";

  return (
    <>
      <div className="space-y-1">
        <Label htmlFor="type">Tipo</Label>
        <select
          id="type"
          name="type"
          value={tipo}
          onChange={(e) => {
            const novo = e.target.value;
            setTipo(novo);
            if (novo === "EVENTO") setGrau("NA");
            else if (grau === "NA") setGrau("APRENDIZ");
          }}
          className="h-9 w-full rounded-md border bg-transparent px-2 text-sm"
        >
          {Object.entries(sessionTypeLabels).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </div>
      <div className="space-y-1">
        <Label htmlFor="degree">Grau</Label>
        {/* select disabled não entra no FormData — o hidden garante o envio */}
        {isEvento && <input type="hidden" name="degree" value="NA" />}
        <select
          id="degree"
          name={isEvento ? undefined : "degree"}
          value={grau}
          disabled={isEvento}
          onChange={(e) => setGrau(e.target.value)}
          className="h-9 w-full rounded-md border bg-transparent px-2 text-sm disabled:opacity-60"
        >
          {Object.entries(degreeLabels)
            .filter(([value]) => (isEvento ? value === "NA" : true))
            .map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
        </select>
      </div>
    </>
  );
}
