import { prisma } from "@/lib/prisma";
import { intervaloMesSaoPaulo, partesSaoPaulo } from "@/lib/datas-sp";
import { requireRole } from "@/lib/session";
import { InfoDica } from "@/components/info-dica";
import { AJUDA } from "@/lib/ajuda";
import { canWriteTesouraria } from "@/lib/permissions";
import {
  createReceita,
  deleteCategoria,
  fecharMes,
  reabrirMes,
  registrarCienciaBalancete,
} from "../actions";
import {
  buscarFechamento,
  carimboFechamento,
  estaFechado,
  mesFechavel,
  totaisDivergem,
} from "@/lib/fechamento-mes";
import { ActionForm, ActionButton } from "@/components/action-form";
import { CategoriaSelect } from "@/components/categoria-select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
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
  const hoje = partesSaoPaulo(new Date());
  const mesParam = Number(sp.mes);
  const month = mesParam >= 1 && mesParam <= 12 ? mesParam : hoje.mes;
  const year = Number(sp.ano) || hoje.ano;
  // mês civil em São Paulo (não no fuso do servidor)
  const { inicio: start, fim: end } = intervaloMesSaoPaulo(year, month);

  const isWriter = canWriteTesouraria(user.role);
  const [transactions, categorias, fechamento] = await Promise.all([
    prisma.transaction.findMany({
      where: { lodgeId: user.lodgeId, date: { gte: start, lt: end } },
      orderBy: { date: "asc" },
    }),
    prisma.categoriaFinanceira.findMany({
      where: { lodgeId: user.lodgeId },
      orderBy: [{ tipo: "asc" }, { nome: "asc" }],
    }),
    buscarFechamento(user.lodgeId, year, month),
  ]);

  const receitas = transactions
    .filter((t) => t.type === "RECEITA")
    .reduce((s, t) => s + t.amountCents, 0);
  const despesas = transactions
    .filter((t) => t.type === "DESPESA")
    .reduce((s, t) => s + t.amountCents, 0);

  // Consolidado por categoria (tags): totais de cada grupo no mês
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

  // Fechamento mensal: carimbo, botões e divergência entre totais gravados e atuais
  const carimbo = carimboFechamento(fechamento);
  const fechado = estaFechado(fechamento);
  const fechavel = mesFechavel(year, month);
  const divergente =
    fechado && fechamento
      ? totaisDivergem(fechamento, { receitasCents: receitas, despesasCents: despesas })
      : false;
  const referencia = `${String(month).padStart(2, "0")}/${year}`;

  return (
    <div className="space-y-6">
      <h1 className="flex items-center gap-1 text-2xl font-bold">
        Balancete — {String(month).padStart(2, "0")}/{year}
        <InfoDica titulo="Balancete" texto={AJUDA.balancete} />
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

      <Card id="fechamento">
        <CardHeader>
          <CardTitle className="flex flex-wrap items-center gap-2 text-base">
            Fechamento do mês
            <Badge
              variant={
                carimbo.status === "fechado"
                  ? fechamento?.cienciaConselhoAt
                    ? "success"
                    : "warning"
                  : "outline"
              }
            >
              {carimbo.status === "fechado"
                ? fechamento?.cienciaConselhoAt
                  ? "Fechado · ciência registrada"
                  : "Fechado · aguardando ciência"
                : carimbo.status === "reaberto"
                  ? "Reaberto"
                  : "Aberto"}
            </Badge>
          </CardTitle>
          <CardDescription>{carimbo.texto}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          {fechado && fechamento && (
            <p className="text-muted-foreground">
              Totais gravados no fechamento: receitas {brl(fechamento.receitasCents)} ·
              despesas {brl(fechamento.despesasCents)} · saldo {brl(fechamento.saldoCents)}
              {fechamento.observacao ? ` — “${fechamento.observacao}”` : ""}
            </p>
          )}
          {divergente && (
            <p className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-amber-900 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-200">
              Há lançamentos posteriores ao fechamento: os totais atuais do mês diferem dos
              gravados. Reabra e feche novamente para atualizar o que o quadro vê.
            </p>
          )}
          {isWriter && !fechado && fechavel && (
            <ActionForm action={fecharMes} submitLabel={`Fechar ${referencia}`}>
              <input type="hidden" name="mes" value={month} />
              <input type="hidden" name="ano" value={year} />
              <div className="space-y-1">
                <Label htmlFor="observacao">Observação (opcional)</Label>
                <Input id="observacao" name="observacao" maxLength={500} placeholder="Ex.: conferido com o extrato bancário" />
              </div>
              <p className="text-xs text-muted-foreground">
                Ao fechar, os totais do mês ficam congelados, o Conselho de Contas é avisado para
                registrar a ciência e o quadro passa a ver este mês no Balancete da Loja. Lançamentos
                manuais com data neste mês ficam bloqueados até uma reabertura.
              </p>
            </ActionForm>
          )}
          {isWriter && !fechado && !fechavel && (
            <p className="text-muted-foreground">
              O mês só pode ser fechado depois de terminar.
            </p>
          )}
          {isWriter && fechado && (
            <ActionForm action={reabrirMes} submitLabel={`Reabrir ${referencia}`}>
              <input type="hidden" name="mes" value={month} />
              <input type="hidden" name="ano" value={year} />
              <div className="space-y-1">
                <Label htmlFor="motivo">Motivo da reabertura (obrigatório)</Label>
                <Input id="motivo" name="motivo" required maxLength={500} />
              </div>
              <p className="text-xs text-muted-foreground">
                Reabrir esconde o mês do quadro e avisa o Conselho; feche de novo ao terminar os ajustes.
              </p>
            </ActionForm>
          )}
          {user.role === "CONSELHO_CONTAS" && fechado && !fechamento?.cienciaConselhoAt && (
            <ActionButton
              action={registrarCienciaBalancete.bind(null, month, year)}
              label={`Registrar ciência do balancete ${referencia}`}
            />
          )}
        </CardContent>
      </Card>

      <div className="grid max-w-2xl grid-cols-1 gap-3 sm:grid-cols-3 sm:gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Receitas</CardTitle>
          </CardHeader>
          <CardContent className="text-xl font-bold text-success">
            {brl(receitas)}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Despesas</CardTitle>
          </CardHeader>
          <CardContent className="text-xl font-bold text-destructive">
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

      {isWriter && (
        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Lançar receita</CardTitle>
              <CardDescription>
                Receita manual (tronco, eventos, doações…) — entra direto no
                livro-caixa. As capitações do Asaas/Pix continuam automáticas.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ActionForm action={createReceita} submitLabel="Lançar receita">
                <div className="space-y-1">
                  <Label htmlFor="description">Descrição</Label>
                  <Input id="description" name="description" required />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label htmlFor="amount">Valor (R$)</Label>
                    <Input
                      id="amount"
                      name="amount"
                      type="number"
                      step="0.01"
                      min="0.01"
                      required
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="date">Data</Label>
                    <Input
                      id="date"
                      name="date"
                      type="date"
                      defaultValue={new Date().toISOString().slice(0, 10)}
                      required
                    />
                  </div>
                </div>
                <CategoriaSelect
                  categorias={categorias
                    .filter((c) => c.tipo === "RECEITA")
                    .map((c) => c.nome)}
                />
              </ActionForm>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Categorias cadastradas</CardTitle>
              <CardDescription>
                Tags usadas nos formulários de receitas e despesas. Novas
                categorias são criadas nos próprios formulários.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              {(["RECEITA", "DESPESA"] as const).map((tipo) => (
                <div key={tipo}>
                  <p className="mb-1 font-medium">
                    {tipo === "RECEITA" ? "Receitas" : "Despesas"}
                  </p>
                  <div className="flex flex-wrap items-center gap-2">
                    {categorias
                      .filter((c) => c.tipo === tipo)
                      .map((c) => (
                        <span key={c.id} className="inline-flex items-center gap-1">
                          <Badge variant="outline">{c.nome}</Badge>
                          <ActionButton
                            action={deleteCategoria.bind(null, c.id)}
                            label="×"
                            variant="outline"
                          />
                        </span>
                      ))}
                    {categorias.filter((c) => c.tipo === tipo).length === 0 && (
                      <span className="text-muted-foreground">Nenhuma.</span>
                    )}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Consolidado por categoria</CardTitle>
          <CardDescription>
            Totais do mês agrupados pelas categorias dos lançamentos.
          </CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Categoria</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead className="text-right">Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {consolidado.map((c) => (
                <TableRow key={`${c.tipo}:${c.categoria}`}>
                  <TableCell>{c.categoria}</TableCell>
                  <TableCell>
                    <Badge
                      variant={c.tipo === "RECEITA" ? "success" : "warning"}
                    >
                      {c.tipo === "RECEITA" ? "Receita" : "Despesa"}
                    </Badge>
                  </TableCell>
                  <TableCell
                    className={`text-right ${c.tipo === "RECEITA" ? "text-success" : "text-destructive"}`}
                  >
                    {c.tipo === "RECEITA" ? "+" : "−"} {brl(c.total)}
                  </TableCell>
                </TableRow>
              ))}
              {consolidado.length > 0 && (
                <TableRow>
                  <TableCell className="font-semibold">Saldo do mês</TableCell>
                  <TableCell />
                  <TableCell className="text-right font-semibold">
                    {brl(receitas - despesas)}
                  </TableCell>
                </TableRow>
              )}
              {consolidado.length === 0 && (
                <TableRow>
                  <TableCell colSpan={3} className="text-neutral-500">
                    Sem lançamentos no período.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

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
                className={`text-right ${t.type === "RECEITA" ? "text-success" : "text-destructive"}`}
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
