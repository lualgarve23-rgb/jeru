import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

function brl(cents: number) {
  return (cents / 100).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

export default async function BalancetePage({
  searchParams,
}: {
  searchParams: Promise<{ mes?: string; ano?: string }>;
}) {
  const user = await requireRole(
    "TESOUREIRO",
    "VENERAVEL_MESTRE",
    "CONSELHO_CONTAS"
  );
  const sp = await searchParams;
  const now = new Date();
  const month = Number(sp.mes) || now.getMonth() + 1;
  const year = Number(sp.ano) || now.getFullYear();
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

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">
        Balancete — {String(month).padStart(2, "0")}/{year}
      </h1>

      <form className="flex flex-wrap items-end gap-3" method="get">
        <div>
          <label className="text-sm" htmlFor="mes">Mês</label>
          <input
            id="mes"
            name="mes"
            type="number"
            min={1}
            max={12}
            defaultValue={month}
            className="block h-9 w-20 rounded-md border bg-transparent px-2 text-sm"
          />
        </div>
        <div>
          <label className="text-sm" htmlFor="ano">Ano</label>
          <input
            id="ano"
            name="ano"
            type="number"
            defaultValue={year}
            className="block h-9 w-24 rounded-md border bg-transparent px-2 text-sm"
          />
        </div>
        <button className="h-9 rounded-md border px-3 text-sm" type="submit">
          Consultar
        </button>
        <a
          className="flex h-9 items-center rounded-md border px-3 text-sm underline-offset-2 hover:underline"
          href={`/tesouraria/balancete/export?mes=${month}&ano=${year}`}
          download
        >
          Exportar CSV
        </a>
      </form>

      <div className="grid max-w-2xl grid-cols-1 gap-3 sm:grid-cols-3 sm:gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Receitas</CardTitle>
          </CardHeader>
          <CardContent className="text-xl font-bold text-green-700">
            {brl(receitas)}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Despesas</CardTitle>
          </CardHeader>
          <CardContent className="text-xl font-bold text-red-700">
            {brl(despesas)}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Saldo do mês</CardTitle>
          </CardHeader>
          <CardContent className="text-xl font-bold">
            {brl(receitas - despesas)}
          </CardContent>
        </Card>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Data</TableHead>
            <TableHead>Descrição</TableHead>
            <TableHead>Categoria</TableHead>
            <TableHead className="text-right">Valor</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {transactions.map((t) => (
            <TableRow key={t.id}>
              <TableCell>{t.date.toLocaleDateString("pt-BR")}</TableCell>
              <TableCell>{t.description}</TableCell>
              <TableCell>{t.category ?? "—"}</TableCell>
              <TableCell
                className={`text-right ${t.type === "RECEITA" ? "text-green-700" : "text-red-700"}`}
              >
                {t.type === "RECEITA" ? "+" : "−"} {brl(t.amountCents)}
              </TableCell>
            </TableRow>
          ))}
          {transactions.length === 0 && (
            <TableRow>
              <TableCell colSpan={4} className="text-neutral-500">
                Sem lançamentos no período.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}
