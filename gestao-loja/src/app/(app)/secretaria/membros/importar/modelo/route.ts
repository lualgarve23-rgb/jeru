import { requireRole } from "@/lib/session";

// Modelo CSV da importação por planilha (potências sem portal integrado).
// Excel BR abre e salva com ";" — o importador aceita ";" ou ",".
export const dynamic = "force-dynamic";

const CABECALHO =
  "cim;cpf;nome;email;telefone;profissao;grau;status;data_iniciacao;filiado";
const EXEMPLO =
  "123456;11122233344;José da Silva;jose@email.com;(11) 99999-0000;Engenheiro;MESTRE;ATIVO;15/03/2010;nao";

export async function GET() {
  await requireRole("VENERAVEL_MESTRE", "SECRETARIO");
  // BOM para o Excel reconhecer UTF-8 (acentos nos nomes)
  const csv = `\uFEFF${CABECALHO}\n${EXEMPLO}\n`;
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition":
        'attachment; filename="modelo-importacao-membros.csv"',
    },
  });
}
