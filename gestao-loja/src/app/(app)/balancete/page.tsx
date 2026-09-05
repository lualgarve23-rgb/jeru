// Balancete da Loja — leitura para todo o quadro (decisão do VM, 05/09/2026).
// Sem formulário, sem CSV e sem nome de irmão: capitações só como total e
// beneficência só por categoria (regras em src/lib/balancete-quadro.ts).
import { requireUser } from "@/lib/session";
import { redirect } from "next/navigation";
import { partesSaoPaulo } from "@/lib/datas-sp";
import { balanceteDoQuadro, type MesQuadro } from "@/lib/balancete-quadro";
import { InfoDica } from "@/components/info-dica";
import { AJUDA } from "@/lib/ajuda";
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

const MESES = [
  "jan", "fev", "mar", "abr", "mai", "jun",
  "jul", "ago", "set", "out", "nov", "dez",
];

const MESES_LONGOS = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

// Gráfico de barras dos últimos 12 meses em SVG puro (receitas × despesas)
function GraficoUltimos12({ meses, atual }: { meses: MesQuadro[]; atual: { mes: number; ano: number } }) {
  const W = 720;
  const H = 200;
  const padL = 8;
  const padB = 22;
  const padT = 10;
  const max = Math.max(1, ...meses.flatMap((m) => [m.receitasCents, m.despesasCents]));
  const alturaUtil = H - padB - padT;
  const larguraGrupo = (W - padL * 2) / meses.length;
  const larguraBarra = Math.max(4, larguraGrupo * 0.32);
  const y = (v: number) => padT + alturaUtil - (v / max) * alturaUtil;
  return (
    <div className="overflow-x-auto">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="h-auto w-full min-w-[520px]"
        role="img"
        aria-label="Receitas e despesas dos últimos 12 meses"
      >
        <line
          x1={padL}
          x2={W - padL}
          y1={padT + alturaUtil}
          y2={padT + alturaUtil}
          stroke="currentColor"
          strokeOpacity={0.2}
        />
        {meses.map((m, i) => {
          const x0 = padL + i * larguraGrupo + (larguraGrupo - larguraBarra * 2 - 3) / 2;
          const ehAtual = m.mes === atual.mes && m.ano === atual.ano;
          const titulo = `${MESES_LONGOS[m.mes - 1]}/${m.ano}: receitas ${brl(m.receitasCents)}, despesas ${brl(m.despesasCents)}`;
          return (
            <g key={`${m.ano}-${m.mes}`}>
              <title>{titulo}</title>
              <rect
                x={x0}
                y={y(m.receitasCents)}
                width={larguraBarra}
                height={padT + alturaUtil - y(m.receitasCents)}
                rx={2}
                className="fill-success"
                opacity={ehAtual ? 1 : 0.7}
              />
              <rect
                x={x0 + larguraBarra + 3}
                y={y(m.despesasCents)}
                width={larguraBarra}
                height={padT + alturaUtil - y(m.despesasCents)}
                rx={2}
                className="fill-destructive"
                opacity={ehAtual ? 1 : 0.7}
              />
              <text
                x={padL + i * larguraGrupo + larguraGrupo / 2}
                y={H - 6}
                textAnchor="middle"
                fontSize={11}
                fontWeight={ehAtual ? 700 : 400}
                fill="currentColor"
                fillOpacity={0.7}
              >
                {MESES[m.mes - 1]}
                {m.mes === 1 || i === 0 ? `/${String(m.ano).slice(2)}` : ""}
              </text>
            </g>
          );
        })}
      </svg>
      <div className="mt-2 flex gap-4 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1">
          <span className="inline-block h-2.5 w-2.5 rounded-sm bg-success" /> Receitas
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="inline-block h-2.5 w-2.5 rounded-sm bg-destructive" /> Despesas
        </span>
      </div>
    </div>
  );
}

export default async function BalanceteQuadroPage({
  searchParams,
}: {
  searchParams: Promise<{ mes?: string; ano?: string }>;
}) {
  const user = await requireUser();
  if (user.role === "SUPER_ADMIN") redirect("/admin");

  const sp = await searchParams;
  const hoje = partesSaoPaulo(new Date());
  const mesParam = Number(sp.mes);
  const mes = mesParam >= 1 && mesParam <= 12 ? mesParam : hoje.mes;
  const anoParam = Number(sp.ano);
  const ano = anoParam >= 2000 && anoParam <= hoje.ano + 1 ? anoParam : hoje.ano;

  const b = await balanceteDoQuadro(user.lodgeId, mes, ano);
  const titulo = `${MESES_LONGOS[mes - 1]}/${ano}`;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-1 text-2xl font-bold">
          Balancete da Loja
          <InfoDica titulo="Balancete da Loja" texto={AJUDA.balanceteQuadro} />
        </h1>
        <p className="text-sm text-muted-foreground">
          Receitas e despesas de {titulo}, consolidadas pela Tesouraria. Somente leitura.
        </p>
      </div>

      <form className="flex flex-wrap items-end gap-3" method="get">
        <div>
          <label className="text-sm" htmlFor="mes">Mês</label>
          <select
            id="mes"
            name="mes"
            defaultValue={mes}
            className="block h-9 rounded-md border bg-transparent px-2 text-sm"
          >
            {MESES_LONGOS.map((n, i) => (
              <option key={n} value={i + 1}>
                {n}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-sm" htmlFor="ano">Ano</label>
          <input
            id="ano"
            name="ano"
            type="number"
            min={2000}
            max={hoje.ano + 1}
            defaultValue={ano}
            className="block h-9 w-24 rounded-md border bg-transparent px-2 text-sm"
          />
        </div>
        <button className="h-9 rounded-md border px-3 text-sm" type="submit">
          Consultar
        </button>
      </form>

      <div className="grid max-w-2xl grid-cols-1 gap-3 sm:grid-cols-3 sm:gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Receitas</CardTitle>
          </CardHeader>
          <CardContent className="text-xl font-bold text-success">
            {brl(b.receitasCents)}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Despesas</CardTitle>
          </CardHeader>
          <CardContent className="text-xl font-bold text-destructive">
            {brl(b.despesasCents)}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Saldo do mês</CardTitle>
          </CardHeader>
          <CardContent className="text-xl font-bold">{brl(b.saldoCents)}</CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Últimos 12 meses</CardTitle>
          <CardDescription>
            Receitas e despesas mês a mês até {titulo}.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <GraficoUltimos12 meses={b.ultimos12} atual={{ mes, ano }} />
        </CardContent>
      </Card>

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
              {b.porCategoria.map((c) => (
                <TableRow key={`${c.tipo}:${c.nome}`}>
                  <TableCell>{c.nome}</TableCell>
                  <TableCell>
                    <Badge variant={c.tipo === "RECEITA" ? "success" : "warning"}>
                      {c.tipo === "RECEITA" ? "Receita" : "Despesa"}
                    </Badge>
                  </TableCell>
                  <TableCell
                    className={`text-right ${c.tipo === "RECEITA" ? "text-success" : "text-destructive"}`}
                  >
                    {c.tipo === "RECEITA" ? "+" : "−"} {brl(c.totalCents)}
                  </TableCell>
                </TableRow>
              ))}
              {b.porCategoria.length > 0 && (
                <TableRow>
                  <TableCell className="font-semibold">Saldo do mês</TableCell>
                  <TableCell />
                  <TableCell className="text-right font-semibold">{brl(b.saldoCents)}</TableCell>
                </TableRow>
              )}
              {b.porCategoria.length === 0 && (
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

      <Card>
        <CardHeader>
          <CardTitle>Lançamentos do mês</CardTitle>
          <CardDescription>
            Capitações aparecem só como total; beneficência só no consolidado por categoria.
          </CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
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
              {b.capitacoes.quantidade > 0 && (
                <TableRow>
                  <TableCell>—</TableCell>
                  <TableCell className="font-medium">
                    Capitações recebidas — {b.capitacoes.quantidade}{" "}
                    {b.capitacoes.quantidade === 1 ? "irmão" : "irmãos"}
                  </TableCell>
                  <TableCell>Capitações</TableCell>
                  <TableCell className="text-right text-success">
                    + {brl(b.capitacoes.totalCents)}
                  </TableCell>
                </TableRow>
              )}
              {b.lancamentos.map((l, i) => (
                <TableRow key={i}>
                  <TableCell className="whitespace-nowrap">
                    {l.data.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })}
                  </TableCell>
                  <TableCell>{l.descricao}</TableCell>
                  <TableCell>{l.categoria}</TableCell>
                  <TableCell
                    className={`text-right whitespace-nowrap ${l.tipo === "RECEITA" ? "text-success" : "text-destructive"}`}
                  >
                    {l.tipo === "RECEITA" ? "+" : "−"} {brl(l.valorCents)}
                  </TableCell>
                </TableRow>
              ))}
              {b.lancamentos.length === 0 && b.capitacoes.quantidade === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="text-neutral-500">
                    Sem lançamentos no período.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <p className="text-sm text-muted-foreground">
        Balancete consolidado pela Tesouraria; dúvidas com o Tesoureiro ou o Conselho de Contas.
      </p>
    </div>
  );
}
