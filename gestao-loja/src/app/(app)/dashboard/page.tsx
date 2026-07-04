import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { INTERSTICE_MONTHS } from "@/lib/permissions";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  roleLabels,
  degreeLabels,
  memberStatusLabels,
  sessionTypeLabels,
  ataStatusLabels,
  invoiceStatusLabels,
  expenseStatusLabels,
  ataStatusTone,
  invoiceStatusTone,
  expenseStatusTone,
  type BadgeTone,
} from "@/lib/labels";
import { InlineSignDialog } from "@/components/inline-sign-dialog";
import { signAtaInline, signQuittePlacetInline } from "./sign-actions";

function brl(cents: number) {
  return (cents / 100).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

const statValueTone: Record<"danger" | "success", string> = {
  danger: "text-red-700",
  success: "text-green-700",
};

function Stat({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "danger" | "success";
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardDescription>{label}</CardDescription>
        <CardTitle className={`text-2xl ${tone ? statValueTone[tone] : ""}`}>
          {value}
        </CardTitle>
      </CardHeader>
      {hint && (
        <CardContent className="pt-0 text-sm text-muted-foreground">
          {hint}
        </CardContent>
      )}
    </Card>
  );
}

function StatusBadge({ status, tone }: { status: string; tone: BadgeTone }) {
  return <Badge variant={tone}>{status}</Badge>;
}

function monthRange(d = new Date()) {
  return {
    start: new Date(d.getFullYear(), d.getMonth(), 1),
    end: new Date(d.getFullYear(), d.getMonth() + 1, 1),
  };
}

async function monthBalance(lodgeId: string) {
  const { start, end } = monthRange();
  const tx = await prisma.transaction.groupBy({
    by: ["type"],
    where: { lodgeId, date: { gte: start, lt: end } },
    _sum: { amountCents: true },
  });
  const receitas = tx.find((t) => t.type === "RECEITA")?._sum.amountCents ?? 0;
  const despesas = tx.find((t) => t.type === "DESPESA")?._sum.amountCents ?? 0;
  return { receitas, despesas, saldo: receitas - despesas };
}

// Atalhos de gestão de membros (Secretário e Venerável Mestre)
function MemberManagementCard() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Gestão de membros</CardTitle>
        <CardDescription>
          Cadastro, dados civis/maçônicos, graus (interstício) e cargos.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-wrap gap-4 text-sm">
        <Link
          href="/secretaria/membros"
          className="font-medium underline underline-offset-4"
        >
          Ver e gerenciar membros →
        </Link>
        <Link
          href="/secretaria/membros/novo"
          className="font-medium underline underline-offset-4"
        >
          Cadastrar novo membro →
        </Link>
      </CardContent>
    </Card>
  );
}

// ───────────── Obreiro ─────────────

async function MemberDashboard({
  userId,
  lodgeId,
}: {
  userId: string;
  lodgeId: string;
}) {
  const yearStart = new Date(new Date().getFullYear(), 0, 1);
  const [me, openInvoices, lastDegree, sessionsYear, myAttendances] =
    await Promise.all([
      prisma.user.findUniqueOrThrow({
        where: { id: userId },
        select: { degree: true, status: true, initiationDate: true },
      }),
      prisma.invoice.findMany({
        where: { lodgeId, userId, status: { in: ["PENDENTE", "VENCIDA"] } },
        orderBy: { dueDate: "asc" },
      }),
      prisma.degreeHistory.findFirst({
        where: { lodgeId, userId },
        orderBy: { date: "desc" },
      }),
      prisma.lodgeSession.count({
        where: { lodgeId, date: { gte: yearStart, lte: new Date() } },
      }),
      prisma.attendance.count({
        where: { lodgeId, userId, session: { date: { gte: yearStart } } },
      }),
    ]);

  const emAberto = openInvoices.reduce((s, i) => s + i.amountCents, 0);
  const vencidas = openInvoices.filter(
    (i) => i.status === "VENCIDA" || i.dueDate < new Date()
  ).length;

  // Interstício para o próximo grau
  const nextDegree =
    me.degree === "APRENDIZ"
      ? "COMPANHEIRO"
      : me.degree === "COMPANHEIRO"
        ? "MESTRE"
        : null;
  let intersticeHint: string | undefined;
  if (nextDegree) {
    const base = lastDegree?.date ?? me.initiationDate;
    if (base) {
      const eligible = new Date(base);
      eligible.setMonth(eligible.getMonth() + INTERSTICE_MONTHS[nextDegree]);
      const nextDegreeLabel = degreeLabels[nextDegree] ?? nextDegree;
      intersticeHint =
        eligible <= new Date()
          ? `Interstício para ${nextDegreeLabel} cumprido`
          : `Apto a ${nextDegreeLabel} a partir de ${eligible.toLocaleDateString("pt-BR")}`;
    }
  }

  const freq =
    sessionsYear > 0
      ? `${Math.round((myAttendances / sessionsYear) * 100)}%`
      : "—";

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label="Grau"
          value={degreeLabels[me.degree] ?? me.degree}
          hint={intersticeHint}
        />
        <Stat
          label="Situação"
          value={memberStatusLabels[me.status] ?? me.status}
          tone={me.status === "IRREGULAR" ? "danger" : undefined}
        />
        <Stat
          label="Frequência no ano"
          value={freq}
          hint={`${myAttendances} presença(s) em ${sessionsYear} sessão(ões)`}
        />
        <Stat
          label="Mensalidades em aberto"
          value={brl(emAberto)}
          hint={
            vencidas > 0
              ? `${vencidas} vencida(s)`
              : `${openInvoices.length} pendente(s)`
          }
          tone={vencidas > 0 ? "danger" : undefined}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Minhas mensalidades em aberto</CardTitle>
        </CardHeader>
        <CardContent>
          {openInvoices.length === 0 ? (
            <p className="text-sm text-green-700">
              Nenhuma pendência. Tudo em dia!
            </p>
          ) : (
            <ul className="space-y-2">
              {openInvoices.map((i) => (
                <li key={i.id}>
                  <Link
                    href={`/tesouraria/mensalidades/${i.id}`}
                    className="flex flex-col gap-1 rounded-md border p-3 text-sm transition-colors hover:bg-muted/50 sm:flex-row sm:items-center sm:justify-between sm:gap-2"
                  >
                    <span className="flex min-w-0 flex-wrap items-center gap-2">
                      <span>
                        {i.description} — vence em{" "}
                        {i.dueDate.toLocaleDateString("pt-BR")}
                      </span>
                      <StatusBadge
                        status={invoiceStatusLabels[i.status] ?? i.status}
                        tone={invoiceStatusTone(i.status)}
                      />
                    </span>
                    <span className="shrink-0 font-medium">{brl(i.amountCents)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Privacidade (LGPD)</CardTitle>
          <CardDescription>
            Controle quais dados de contato os demais membros podem ver.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Link
            href="/dashboard/privacidade"
            className="text-sm font-medium underline underline-offset-4"
          >
            Abrir Painel de Privacidade →
          </Link>
        </CardContent>
      </Card>
    </>
  );
}

// ───────────── Secretário ─────────────

async function SecretarioDashboard({ lodgeId }: { lodgeId: string }) {
  const [
    byStatus,
    byDegree,
    pendingAtas,
    pendingAtasCount,
    nextSessions,
    pranchasYear,
  ] = await Promise.all([
    prisma.user.groupBy({
      by: ["status"],
      where: { lodgeId },
      _count: true,
    }),
    prisma.user.groupBy({
      by: ["degree"],
      where: { lodgeId, status: "ATIVO" },
      _count: true,
    }),
    prisma.ata.findMany({
      where: {
        lodgeId,
        status: { in: ["RASCUNHO", "AGUARDANDO_ASSINATURAS"] },
      },
      include: { session: true },
      orderBy: { number: "desc" },
      take: 5,
    }),
    prisma.ata.count({
      where: {
        lodgeId,
        status: { in: ["RASCUNHO", "AGUARDANDO_ASSINATURAS"] },
      },
    }),
    prisma.lodgeSession.findMany({
      where: { lodgeId, date: { gte: new Date() } },
      orderBy: { date: "asc" },
      take: 5,
    }),
    prisma.prancha.count({
      where: { lodgeId, year: new Date().getFullYear() },
    }),
  ]);

  const count = (s: string) =>
    byStatus.find((r) => r.status === s)?._count ?? 0;
  const degreeSummary = byDegree
    .map((d) => `${d._count} ${(degreeLabels[d.degree] ?? d.degree).toLowerCase()}`)
    .join(" · ");
  const irregulares = count("IRREGULAR");

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label="Membros ativos"
          value={String(count("ATIVO"))}
          hint={degreeSummary || undefined}
        />
        <Stat
          label="Irregulares"
          value={String(irregulares)}
          tone={irregulares > 0 ? "danger" : undefined}
        />
        <Stat label="Atas pendentes" value={String(pendingAtasCount)} />
        <Stat label="Pranchas no ano" value={String(pranchasYear)} />
      </div>

      <MemberManagementCard />

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Atas aguardando lavratura/assinatura</CardTitle>
          </CardHeader>
          <CardContent>
            {pendingAtas.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhuma pendência.</p>
            ) : (
              <ul className="space-y-2 text-sm">
                {pendingAtas.map((a) => (
                  <li key={a.id}>
                    <Link
                      href={`/secretaria/atas/${a.id}`}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3 transition-colors hover:bg-muted/50"
                    >
                      <span className="min-w-0">
                        Ata nº {a.number} —{" "}
                        {a.session.date.toLocaleDateString("pt-BR")}
                      </span>
                      <StatusBadge
                        status={ataStatusLabels[a.status] ?? a.status}
                        tone={ataStatusTone(a.status)}
                      />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
            {pendingAtasCount > pendingAtas.length && (
              <p className="mt-2 text-xs text-muted-foreground">
                +{pendingAtasCount - pendingAtas.length} outra(s) não exibida(s)
              </p>
            )}
            <Link
              href="/secretaria/atas"
              className="mt-3 block text-sm underline underline-offset-4"
            >
              Ver todas as atas →
            </Link>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Próximas sessões</CardTitle>
          </CardHeader>
          <CardContent>
            {nextSessions.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Nenhuma sessão agendada.
              </p>
            ) : (
              <ul className="space-y-2 text-sm">
                {nextSessions.map((s) => (
                  <li
                    key={s.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3"
                  >
                    <span className="min-w-0">
                      {s.date.toLocaleDateString("pt-BR")} —{" "}
                      {sessionTypeLabels[s.type] ?? s.type}
                    </span>
                    <Badge variant="outline">
                      {degreeLabels[s.degree] ?? s.degree}
                    </Badge>
                  </li>
                ))}
              </ul>
            )}
            <Link
              href="/secretaria/sessoes"
              className="mt-3 block text-sm underline underline-offset-4"
            >
              Gerenciar sessões →
            </Link>
          </CardContent>
        </Card>
      </div>
    </>
  );
}

// ───────────── Tesoureiro ─────────────

async function TesoureiroDashboard({ lodgeId }: { lodgeId: string }) {
  const [{ receitas, despesas, saldo }, overdue, pendingExpenses] =
    await Promise.all([
      monthBalance(lodgeId),
      prisma.invoice.findMany({
        where: {
          lodgeId,
          status: { in: ["PENDENTE", "VENCIDA"] },
          dueDate: { lt: new Date() },
        },
        include: { user: { select: { name: true, cim: true } } },
        orderBy: { dueDate: "asc" },
      }),
      prisma.expense.findMany({
        where: { lodgeId, status: "PENDENTE_APROVACAO" },
        orderBy: { createdAt: "asc" },
      }),
    ]);

  const inadimplencia = overdue.reduce((s, i) => s + i.amountCents, 0);

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Receitas do mês" value={brl(receitas)} />
        <Stat label="Despesas do mês" value={brl(despesas)} />
        <Stat
          label="Saldo do mês"
          value={brl(saldo)}
          tone={saldo < 0 ? "danger" : undefined}
        />
        <Stat
          label="Inadimplência"
          value={brl(inadimplencia)}
          hint={`${overdue.length} mensalidade(s) vencida(s)`}
          tone={inadimplencia > 0 ? "danger" : undefined}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Mensalidades vencidas</CardTitle>
          </CardHeader>
          <CardContent>
            {overdue.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhuma inadimplência.</p>
            ) : (
              <ul className="space-y-2 text-sm">
                {overdue.slice(0, 8).map((i) => (
                  <li key={i.id}>
                    <Link
                      href={`/tesouraria/mensalidades/${i.id}`}
                      className="flex flex-col gap-1 rounded-md border p-3 transition-colors hover:bg-muted/50 sm:flex-row sm:items-center sm:justify-between sm:gap-2"
                    >
                      <span className="flex min-w-0 flex-wrap items-center gap-2">
                        <span>
                          {i.user.name} (CIM {i.user.cim}) — {i.description}
                        </span>
                        <StatusBadge
                          status={invoiceStatusLabels[i.status] ?? i.status}
                          tone={invoiceStatusTone(i.status)}
                        />
                      </span>
                      <span className="shrink-0 font-medium">{brl(i.amountCents)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
            {overdue.length > 8 && (
              <p className="mt-2 text-xs text-muted-foreground">
                +{overdue.length - 8} outra(s) não exibida(s)
              </p>
            )}
            <Link
              href="/tesouraria/mensalidades"
              className="mt-3 block text-sm underline underline-offset-4"
            >
              Ver mensalidades →
            </Link>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Despesas aguardando aprovação</CardTitle>
            <CardDescription>
              Exigem assinatura dupla (VM + Tesoureiro).
            </CardDescription>
          </CardHeader>
          <CardContent>
            {pendingExpenses.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhuma pendência.</p>
            ) : (
              <ul className="space-y-2 text-sm">
                {pendingExpenses.map((e) => (
                  <li
                    key={e.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3"
                  >
                    <span className="min-w-0 break-words">{e.description}</span>
                    <span className="shrink-0 font-medium">{brl(e.amountCents)}</span>
                  </li>
                ))}
              </ul>
            )}
            <Link
              href="/tesouraria/despesas"
              className="mt-3 block text-sm underline underline-offset-4"
            >
              Ver despesas →
            </Link>
          </CardContent>
        </Card>
      </div>
    </>
  );
}

// ───────────── Venerável Mestre ─────────────

async function VmDashboard({ lodgeId }: { lodgeId: string }) {
  const [{ saldo }, ativos, atasToSign, expensesToApprove, placetsToSign] =
    await Promise.all([
      monthBalance(lodgeId),
      prisma.user.count({ where: { lodgeId, status: "ATIVO" } }),
      prisma.ata.findMany({
        where: {
          lodgeId,
          status: "AGUARDANDO_ASSINATURAS",
          signedByMasterId: null,
        },
        include: { session: true },
        orderBy: { number: "asc" },
      }),
      prisma.expense.findMany({
        where: {
          lodgeId,
          status: "PENDENTE_APROVACAO",
          approvedByMasterId: null,
        },
        orderBy: { createdAt: "asc" },
      }),
      prisma.quittePlacet.findMany({
        where: {
          lodgeId,
          quitacaoFinanceira: true, // trava financeira já liberada
          signedByMasterId: null,
          status: { in: ["PENDENTE", "EM_ANALISE"] },
        },
        include: { user: { select: { name: true, cim: true } } },
        orderBy: { dataSolicitacao: "asc" },
      }),
    ]);

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Membros ativos" value={String(ativos)} />
        <Stat
          label="Saldo do mês"
          value={brl(saldo)}
          tone={saldo < 0 ? "danger" : undefined}
        />
        <Stat
          label="Atas p/ assinar"
          value={String(atasToSign.length)}
          tone={atasToSign.length > 0 ? "danger" : undefined}
        />
        <Stat
          label="Despesas p/ aprovar"
          value={String(expensesToApprove.length)}
          tone={expensesToApprove.length > 0 ? "danger" : undefined}
        />
      </div>

      <MemberManagementCard />

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Atas aguardando minha assinatura</CardTitle>
            <CardDescription>
              Assine sem sair do dashboard — a senha confirma o ato.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {atasToSign.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhuma pendência.</p>
            ) : (
              <ul className="space-y-2 text-sm">
                {atasToSign.map((a) => (
                  <li
                    key={a.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3"
                  >
                    <Link
                      href={`/secretaria/atas/${a.id}`}
                      className="min-w-0 underline-offset-4 hover:underline"
                    >
                      Ata nº {a.number} —{" "}
                      {a.session.date.toLocaleDateString("pt-BR")}
                    </Link>
                    <InlineSignDialog
                      title={`Assinar Ata nº ${a.number}`}
                      description={`Balaústre da sessão de ${a.session.date.toLocaleDateString("pt-BR")}. Ao completar a dupla assinatura o documento é selado.`}
                      preview={a.content || "(sem conteúdo)"}
                      action={signAtaInline.bind(null, a.id)}
                    />
                  </li>
                ))}
              </ul>
            )}
            <Link
              href="/secretaria/atas"
              className="mt-3 block text-sm underline underline-offset-4"
            >
              Ir para as atas →
            </Link>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Quitte Placets aguardando minha assinatura</CardTitle>
            <CardDescription>
              Quitação financeira já confirmada pela Tesouraria.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {placetsToSign.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhuma pendência.</p>
            ) : (
              <ul className="space-y-2 text-sm">
                {placetsToSign.map((p) => (
                  <li
                    key={p.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3"
                  >
                    <span className="min-w-0">
                      {p.user.name} (CIM {p.user.cim}) — solicitado em{" "}
                      {p.dataSolicitacao.toLocaleDateString("pt-BR")}
                    </span>
                    <InlineSignDialog
                      title={`Assinar Quitte Placet de ${p.user.name}`}
                      description="Documento de desligamento com Nada Consta da Tesouraria. Ao completar a dupla assinatura o documento é emitido."
                      preview={`Obreiro: ${p.user.name} (CIM ${p.user.cim})\nSolicitado em: ${p.dataSolicitacao.toLocaleDateString("pt-BR")}\nMotivo: ${p.motivo || "não informado"}\nQuitação financeira: confirmada (Nada Consta)`}
                      action={signQuittePlacetInline.bind(null, p.id)}
                    />
                  </li>
                ))}
              </ul>
            )}
            <Link
              href="/secretaria/quitte-placets"
              className="mt-3 block text-sm underline underline-offset-4"
            >
              Ir para os Quitte Placets →
            </Link>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Despesas aguardando minha aprovação</CardTitle>
          </CardHeader>
          <CardContent>
            {expensesToApprove.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhuma pendência.</p>
            ) : (
              <ul className="space-y-2 text-sm">
                {expensesToApprove.map((e) => (
                  <li
                    key={e.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3"
                  >
                    <span className="min-w-0 break-words">{e.description}</span>
                    <span className="shrink-0 font-medium">{brl(e.amountCents)}</span>
                  </li>
                ))}
              </ul>
            )}
            <Link
              href="/tesouraria/despesas"
              className="mt-3 block text-sm underline underline-offset-4"
            >
              Ir para as despesas →
            </Link>
          </CardContent>
        </Card>
      </div>
    </>
  );
}

// ───────────── Conselho de Contas (somente leitura) ─────────────

async function ConselhoDashboard({ lodgeId }: { lodgeId: string }) {
  const yearStart = new Date(new Date().getFullYear(), 0, 1);
  const [{ receitas, despesas, saldo }, ytd, recentExpenses, overdueCount] =
    await Promise.all([
      monthBalance(lodgeId),
      prisma.transaction.groupBy({
        by: ["type"],
        where: { lodgeId, date: { gte: yearStart } },
        _sum: { amountCents: true },
      }),
      prisma.expense.findMany({
        where: { lodgeId, status: { in: ["APROVADA", "PAGA"] } },
        include: {
          approvedByMaster: { select: { name: true } },
          approvedByTreasurer: { select: { name: true } },
        },
        orderBy: { updatedAt: "desc" },
        take: 8,
      }),
      prisma.invoice.count({
        where: {
          lodgeId,
          status: { in: ["PENDENTE", "VENCIDA"] },
          dueDate: { lt: new Date() },
        },
      }),
    ]);

  const recYtd = ytd.find((t) => t.type === "RECEITA")?._sum.amountCents ?? 0;
  const despYtd = ytd.find((t) => t.type === "DESPESA")?._sum.amountCents ?? 0;

  return (
    <>
      <p className="text-sm text-muted-foreground">
        Acesso de fiscalização — somente leitura em Secretaria e Tesouraria.
      </p>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Receitas do mês" value={brl(receitas)} />
        <Stat label="Despesas do mês" value={brl(despesas)} />
        <Stat
          label="Saldo do mês"
          value={brl(saldo)}
          hint={`Acumulado no ano: ${brl(recYtd - despYtd)}`}
          tone={saldo < 0 ? "danger" : undefined}
        />
        <Stat
          label="Mensalidades vencidas"
          value={String(overdueCount)}
          tone={overdueCount > 0 ? "danger" : undefined}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Despesas aprovadas recentemente</CardTitle>
          <CardDescription>
            Verificação da trava de aprovação dupla (VM + Tesoureiro).
          </CardDescription>
        </CardHeader>
        <CardContent>
          {recentExpenses.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nenhuma despesa aprovada.
            </p>
          ) : (
            <ul className="space-y-2 text-sm">
              {recentExpenses.map((e) => (
                <li key={e.id} className="rounded-md border p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="min-w-0 break-words">{e.description}</span>
                    <span className="shrink-0 font-medium">{brl(e.amountCents)}</span>
                  </div>
                  <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    VM: {e.approvedByMaster?.name ?? "—"} · Tesoureiro:{" "}
                    {e.approvedByTreasurer?.name ?? "—"}
                    <StatusBadge
                      status={expenseStatusLabels[e.status] ?? e.status}
                      tone={expenseStatusTone(e.status)}
                    />
                  </p>
                </li>
              ))}
            </ul>
          )}
          <Link
            href="/tesouraria/balancete"
            className="mt-3 block text-sm underline underline-offset-4"
          >
            Ver balancete →
          </Link>
        </CardContent>
      </Card>
    </>
  );
}

// ───────────── Página ─────────────

export default async function DashboardPage() {
  const user = await requireUser();
  if (user.role === "SUPER_ADMIN") redirect("/admin");

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <Badge variant="secondary">{roleLabels[user.role] ?? user.role}</Badge>
      </div>

      {user.role === "SECRETARIO" && (
        <SecretarioDashboard lodgeId={user.lodgeId} />
      )}
      {user.role === "TESOUREIRO" && (
        <TesoureiroDashboard lodgeId={user.lodgeId} />
      )}
      {user.role === "VENERAVEL_MESTRE" && (
        <VmDashboard lodgeId={user.lodgeId} />
      )}
      {user.role === "CONSELHO_CONTAS" && (
        <ConselhoDashboard lodgeId={user.lodgeId} />
      )}
      {user.role === "MEMBER" && (
        <MemberDashboard userId={user.id} lodgeId={user.lodgeId} />
      )}
    </div>
  );
}
