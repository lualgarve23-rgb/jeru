"use client";

import type { StatusPlacet } from "@prisma/client";
import { statusPlacetLabels } from "@/lib/labels";
import { Badge } from "@/components/ui/badge";
import { StatusKanban } from "@/components/status-kanban";
import { moveQuittePlacet } from "../actions";

export type PlacetCard = {
  id: string;
  status: StatusPlacet;
  memberName: string;
  memberCim: string;
  quitacaoFinanceira: boolean;
  assinaturas: number;
  temFormulario: boolean;
  enviadoGSelos: boolean;
  dataSolicitacao: string;
};

// Etapas do processo, na ordem em que ele caminha
const COLUNAS: StatusPlacet[] = ["PENDENTE", "EM_ANALISE", "APROVADO", "NEGADO"];

function CardBody({ placet }: { placet: PlacetCard }) {
  return (
    <>
      <div>
        <p className="font-medium">{placet.memberName}</p>
        <p className="text-xs text-muted-foreground">
          CIM {placet.memberCim} · {placet.dataSolicitacao}
        </p>
      </div>
      <div className="flex flex-wrap gap-1">
        <Badge variant={placet.quitacaoFinanceira ? "success" : "warning"}>
          {placet.quitacaoFinanceira ? "Nada Consta" : "Pendências"}
        </Badge>
        <Badge variant="outline">{placet.assinaturas}/2 assinaturas</Badge>
        {placet.temFormulario && <Badge variant="outline">Form. 122</Badge>}
        {placet.enviadoGSelos && <Badge variant="success">Enviado</Badge>}
      </div>
    </>
  );
}

export function QuittePlacetKanban({
  placets,
  readOnly = false,
}: {
  placets: PlacetCard[];
  readOnly?: boolean;
}) {
  return (
    <StatusKanban
      columns={COLUNAS}
      labels={statusPlacetLabels}
      items={placets}
      onMove={moveQuittePlacet}
      readOnly={readOnly}
      renderCard={(p) => <CardBody placet={p} />}
      renderOverlay={(p) => (
        <div className="w-64 rounded-lg border bg-card p-3 text-sm shadow-lg">
          {p.memberName}
        </div>
      )}
    />
  );
}
