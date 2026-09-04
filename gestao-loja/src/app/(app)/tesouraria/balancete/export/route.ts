import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { toCsv, csvResponse, brlCsv } from "@/lib/csv";
import { intervaloMesSaoPaulo, partesSaoPaulo } from "@/lib/datas-sp";

// Exporta o livro-caixa do mês em CSV (?mes=&ano=)
export async function GET(request: Request) {
  const user = await requireRole(
    "TESOUREIRO",
    "VENERAVEL_MESTRE",
    "CONSELHO_CONTAS"
  );
  const url = new URL(request.url);
  const hoje = partesSaoPaulo(new Date());
  const mesParam = Number(url.searchParams.get("mes"));
  const month = mesParam >= 1 && mesParam <= 12 ? mesParam : hoje.mes;
  const year = Number(url.searchParams.get("ano")) || hoje.ano;
  // mês civil em São Paulo (não no fuso do servidor)
  const { inicio: start, fim: end } = intervaloMesSaoPaulo(year, month);

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

  const porCategoria = new Map<
    string,
    { tipo: string; categoria: string; total: number }
  >();
  for (const t of transactions) {
    const categoria = t.category ?? "Sem categoria";
    const key = `${t.type}:${categoria}`;
    const atual = porCategoria.get(key) ?? {
      tipo: t.type,
      categoria,
      total: 0,
    };
    atual.total += t.amountCents;
    porCategoria.set(key, atual);
  }
  const consolidado = [...porCategoria.values()].sort(
    (a, b) => a.tipo.localeCompare(b.tipo) || b.total - a.total
  );

  const csv = toCsv(
    ["Data", "Tipo", "Categoria", "Descrição", "Valor (R$)"],
    [
      ...transactions.map((t) => [
        t.date.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" }),
        t.type,
        t.category ?? "",
        t.description,
        (t.type === "DESPESA" ? "-" : "") + brlCsv(t.amountCents),
      ]),
      [],
      ["", "", "", "Total de receitas", brlCsv(receitas)],
      ["", "", "", "Total de despesas", "-" + brlCsv(despesas)],
      ["", "", "", "Saldo do mês", brlCsv(receitas - despesas)],
      [],
      ["Consolidado por categoria"],
      ...consolidado.map((c) => [
        "",
        c.tipo,
        c.categoria,
        "Total da categoria",
        (c.tipo === "DESPESA" ? "-" : "") + brlCsv(c.total),
      ]),
    ]
  );
  return csvResponse(
    `balancete-${String(month).padStart(2, "0")}-${year}.csv`,
    csv
  );
}
