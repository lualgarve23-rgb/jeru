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

// Clique no card abre a documentação do processo (bloco do Form. 122 mais
// abaixo na página). O drag só ativa após 4px/toque longo, então o clique
// simples não conflita com o arrasto.
function abrirDocumentacao(id: string) {
  const alvo = document.getElementById(`form-placet-${id}`);
  if (!alvo) return; // perfis sem escrita não veem o bloco de documentação
  window.location.hash = `form-placet-${id}`;
  alvo.scrollIntoView({ behavior: "smooth", block: "start" });
}

function CardBody({ placet }: { placet: PlacetCard }) {
  return (
    <div
      className="cursor-pointer space-y-2"
      onClick={() => abrirDocumentacao(placet.id)}
      title="Abrir documentação do processo"
    >
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
    </div>
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
