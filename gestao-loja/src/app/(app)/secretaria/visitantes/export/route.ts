import { requireRole } from "@/lib/session";
import { toCsv, csvResponse } from "@/lib/csv";
import { listarVisitantes } from "@/lib/visitantes";

// Exporta a base de Visitantes em CSV (?q= aplica a mesma busca da tela)
export async function GET(request: Request) {
  const user = await requireRole("SECRETARIO", "VENERAVEL_MESTRE");
  const q = new URL(request.url).searchParams.get("q");
  const visitantes = await listarVisitantes(user.lodgeId, q);
  const csv = toCsv(
    [
      "Nome",
      "CIM",
      "Telefone",
      "E-mail",
      "Loja de origem",
      "Potência",
      "Oriente",
      "Grau",
      "Cargo",
      "Visitas",
      "Primeira visita",
      "Última visita",
      "Observações",
    ],
    visitantes.map((v) => [
      v.nome,
      v.cim ?? "",
      v.telefone ?? "",
      v.email ?? "",
      v.lojaOrigem ?? "",
      v.potencia ?? "",
      v.oriente ?? "",
      v.grau ?? "",
      v.cargo ?? "",
      v.totalVisitas,
      v.primeiraVisita?.toLocaleDateString("pt-BR") ?? "",
      v.ultimaVisita?.toLocaleDateString("pt-BR") ?? "",
      v.observacoes ?? "",
    ])
  );
  return csvResponse("visitantes.csv", csv);
}
