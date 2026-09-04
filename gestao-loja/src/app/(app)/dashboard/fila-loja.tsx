import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { resumoFilaDaLoja, diasDesde } from "@/lib/pendencias";
import { frequenciaAnual, MIN_SESSOES_PARA_ALERTA } from "@/lib/frequencia";
import { InlineSignDialog } from "@/components/inline-sign-dialog";
import { approveExpenseInline } from "./sign-actions";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { AlertTriangle, Clock3, ListChecks } from "lucide-react";

/* Fila da Loja — visão do Venerável: todos os processos em andamento com
   quem estão parados e há quantos dias, gargalos por cargo, semáforos de
   governança e aprovação inline das despesas na vez dele. */

function brl(cents: number) {
  return (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

type Cor = "verde" | "amarelo" | "vermelho";

const COR: Record<Cor, string> = {
  verde: "bg-success text-white",
  amarelo: "bg-amber-400 text-slate-950",
  vermelho: "bg-destructive text-white",
};

function Semaforo({
  label,
  valor,
  hint,
  cor,
  href,
}: {
  label: string;
  valor: string;
  hint?: string;
  cor: Cor;
  href: string;
}) {
  return (
    <Link
      href={href}
      className="shadow-card card-lift flex items-center gap-3 rounded-2xl border border-border bg-card p-4"
    >
      <span className={cn("h-3.5 w-3.5 shrink-0 rounded-full", COR[cor])} aria-hidden />
      <span className="min-w-0">
        <span className="block text-xs text-muted-foreground">{label}</span>
        <span className="block text-lg font-bold leading-tight tabular-nums">{valor}</span>
        {hint && <span className="block text-xs text-muted-foreground">{hint}</span>}
      </span>
    </Link>
  );
}

export async function FilaLoja({ lodgeId }: { lodgeId: string }) {
  const agora = new Date();
  const [fila, lodge, membros, frequencia, despesasVm, lgpd] = await Promise.all([
    resumoFilaDaLoja(lodgeId, agora),
    prisma.lodge.findUniqueOrThrow({
      where: { id: lodgeId },
      select: { minFreqProgressao: true, limiteInadimplencia: true },
    }),
    prisma.user.groupBy({
      by: ["status"],
      where: { lodgeId, status: { in: ["ATIVO", "IRREGULAR"] } },
      _count: true,
    }),
    frequenciaAnual(lodgeId),
    prisma.expense.findMany({
      where: { lodgeId, status: "PENDENTE_APROVACAO", approvedByMasterId: null },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        description: true,
        supplier: true,
        amountCents: true,
        dueDate: true,
        category: true,
        approvedByTreasurerId: true,
      },
    }),
    prisma.notification.findMany({
      where: { lodgeId, isRead: false, sourceKey: { startsWith: "lgpd-exclusao:" } },
      select: { id: true, createdAt: true, link: true },
    }),
  ]);

  const ativos = membros.find((m) => m.status === "ATIVO")?._count ?? 0;
  const irregulares = membros.find((m) => m.status === "IRREGULAR")?._count ?? 0;
  const quadro = ativos + irregulares;
  const pctIrregular = quadro ? Math.round((irregulares / quadro) * 100) : 0;

  const comFreq = frequencia.filter(
    (f) => f.percentual != null && f.sessoesComputadas >= MIN_SESSOES_PARA_ALERTA
  );
  const media = comFreq.length
    ? Math.round(comFreq.reduce((s, f) => s + (f.percentual ?? 0), 0) / comFreq.length)
    : null;
  const abaixo = comFreq.filter((f) => (f.percentual ?? 0) < lodge.minFreqProgressao).length;

  const lgpdVencendo = lgpd.filter((n) => diasDesde(n.createdAt, agora) >= 10).length;
  const lgpdVencido = lgpd.filter((n) => diasDesde(n.createdAt, agora) > 15).length;

  return (
    <>
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <Semaforo
          label="Inadimplência"
          valor={`${irregulares} irregular(es)`}
          hint={quadro ? `${pctIrregular}% do quadro` : undefined}
          cor={irregulares === 0 ? "verde" : pctIrregular >= 20 ? "vermelho" : "amarelo"}
          href="/tesouraria/mensalidades"
        />
        <Semaforo
          label="Frequência média no ano"
          valor={media == null ? "—" : `${media}%`}
          hint={
            media == null
              ? `Menos de ${MIN_SESSOES_PARA_ALERTA} sessões computadas`
              : `${abaixo} irmão(s) abaixo de ${lodge.minFreqProgressao}%`
          }
          cor={
            media == null
              ? "verde"
              : media < lodge.minFreqProgressao
                ? "vermelho"
                : abaixo > 0
                  ? "amarelo"
                  : "verde"
          }
          href="/secretaria/sessoes"
        />
        <Semaforo
          label="Processos parados há +7 dias"
          valor={String(fila.paradosMais7Dias)}
          hint={`${fila.itens.length} em andamento`}
          cor={
            fila.paradosMais7Dias === 0
              ? "verde"
              : fila.paradosMais7Dias >= 3
                ? "vermelho"
                : "amarelo"
          }
          href="/secretaria/processos"
        />
        <Semaforo
          label="Prazos LGPD (15 dias)"
          valor={String(lgpd.length)}
          hint={
            lgpd.length === 0
              ? "Nenhum pedido de exclusão"
              : lgpdVencido > 0
                ? `${lgpdVencido} fora do prazo`
                : lgpdVencendo > 0
                  ? `${lgpdVencendo} vencendo`
                  : "Dentro do prazo"
          }
          cor={lgpdVencido > 0 ? "vermelho" : lgpd.length > 0 ? "amarelo" : "verde"}
          href={lgpd[0]?.link ?? "/dashboard/notificacoes"}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ListChecks className="h-5 w-5 shrink-0" /> Fila da Loja
            </CardTitle>
            <CardDescription>
              Todos os processos em andamento e com quem cada um está parado.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {fila.gargalos.length > 0 && (
              <div className="mb-3 flex flex-wrap gap-2">
                {fila.gargalos.slice(0, 4).map((g) => (
                  <span
                    key={g.cargo}
                    className={cn(
                      "rounded-full px-2.5 py-1 text-xs font-medium",
                      g.maisAntigoDias > 7
                        ? "bg-destructive/10 text-destructive"
                        : "bg-gold-soft text-gold-text"
                    )}
                  >
                    {g.cargo}: {g.itens} item(ns) · até {g.maisAntigoDias} dia(s)
                  </span>
                ))}
              </div>
            )}
            {fila.itens.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhum processo em andamento.</p>
            ) : (
              <ul className="space-y-2 text-sm">
                {fila.itens.slice(0, 10).map((i) => (
                  <li key={i.chave}>
                    <Link
                      href={i.link}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-background p-3 transition-colors hover:bg-muted/50"
                    >
                      <span className="min-w-0">
                        <span className="block truncate font-medium">{i.titulo}</span>
                        <span className="block text-xs text-muted-foreground">
                          Parado com {i.paradoCom}
                        </span>
                      </span>
                      <span
                        className={cn(
                          "flex shrink-0 items-center gap-1 text-xs font-medium",
                          i.dias > 7 ? "text-destructive" : "text-muted-foreground"
                        )}
                      >
                        <Clock3 className="h-3.5 w-3.5" /> há {i.dias} dia(s)
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
            {fila.itens.length > 10 && (
              <p className="mt-2 text-xs text-muted-foreground">
                +{fila.itens.length - 10} outro(s) não exibido(s)
              </p>
            )}
            <Link
              href="/secretaria/processos"
              className="mt-3 block text-sm font-medium text-primary hover:underline"
            >
              Abrir a caixa de assinaturas →
            </Link>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Despesas aguardando minha aprovação</CardTitle>
            <CardDescription>
              Aprove sem sair do dashboard — a senha confirma o ato. A despesa
              é liberada quando VM e Tesoureiro aprovam.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {despesasVm.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhuma pendência.</p>
            ) : (
              <ul className="space-y-2 text-sm">
                {despesasVm.map((e) => (
                  <li
                    key={e.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-background p-3"
                  >
                    <span className="min-w-0">
                      <span className="block break-words font-medium">{e.description}</span>
                      <span className="block text-xs text-muted-foreground">
                        {brl(e.amountCents)}
                        {e.supplier ? ` · ${e.supplier}` : ""}
                        {e.approvedByTreasurerId ? " · Tesoureiro já aprovou" : ""}
                      </span>
                    </span>
                    <InlineSignDialog
                      title={`Aprovar despesa — ${brl(e.amountCents)}`}
                      description="Aprovação do Venerável Mestre. A despesa só é liberada com a dupla aprovação (VM + Tesoureiro)."
                      preview={[
                        e.description,
                        e.supplier ? `Fornecedor: ${e.supplier}` : null,
                        e.category ? `Categoria: ${e.category}` : null,
                        e.dueDate ? `Vencimento: ${e.dueDate.toLocaleDateString("pt-BR")}` : null,
                        `Valor: ${brl(e.amountCents)}`,
                      ]
                        .filter(Boolean)
                        .join("\n")}
                      action={approveExpenseInline.bind(null, e.id)}
                      triggerLabel="Aprovar agora"
                      submitLabel="Aprovar despesa"
                      pendingLabel="Aprovando..."
                    />
                  </li>
                ))}
              </ul>
            )}
            <Link
              href="/tesouraria/despesas"
              className="mt-3 block text-sm font-medium text-primary hover:underline"
            >
              Ir para as despesas →
            </Link>
          </CardContent>
        </Card>
      </div>

      {fila.paradosMais7Dias > 0 && (
        <p className="flex items-center gap-2 text-xs text-muted-foreground">
          <AlertTriangle className="h-3.5 w-3.5 text-destructive" /> Itens parados há
          mais de 7 dias aparecem em vermelho — vale cobrar o cargo responsável.
        </p>
      )}
    </>
  );
}
