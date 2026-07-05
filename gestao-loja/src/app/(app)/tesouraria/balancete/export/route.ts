import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { toCsv, csvResponse, brlCsv } from "@/lib/csv";

// Exporta o livro-caixa do mês em CSV (?mes=&ano=)
export async function GET(request: Request) {
  const user = await requireRole(
    "TESOUREIRO",
    "VENERAVEL_MESTRE",
    "CONSELHO_CONTAS"
  );
  const url = new URL(request.url);
  const now = new Date();
  const month = Number(url.searchParams.get("mes")) || now.getMonth() + 1;
  const year = Number(url.searchParams.get("ano")) || now.getFullYear();
  const start = new Date(year, month - 1, 1);
  const end = new Date(year, month, 1);

  const transactions = await prisma.transaction.findMany({
    where: { lodgeId: user.lodgeId, date: { gte: start, lt: end } },
    orderBy: { date: "asc" },
  });

  const receitas = transactions
    .filter((t) => t.type === "RECEITA")
    .reduce((s, t) => s + t.amountCents, 0);
  const despesas = transactions
    .filter((t) => t.type === "DESPESA")
    .reduce((s, t) => s + t.amountCents, 0);

  const csv = toCsv(
    ["Data", "Tipo", "Categoria", "Descrição", "Valor (R$)"],
    [
      ...transactions.map((t) => [
        t.date.toLocaleDateString("pt-BR"),
        t.type,
        t.category ?? "",
        t.description,
        (t.type === "DESPESA" ? "-" : "") + brlCsv(t.amountCents),
      ]),
      [],
      ["", "", "", "Total de receitas", brlCsv(receitas)],
      ["", "", "", "Total de despesas", "-" + brlCsv(despesas)],
      ["", "", "", "Saldo do mês", brlCsv(receitas - despesas)],
    ]
  );
  return csvResponse(
    `balancete-${String(month).padStart(2, "0")}-${year}.csv`,
    csv
  );
}
