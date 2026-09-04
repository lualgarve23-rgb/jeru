import type { MemberStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { capitacaoVencida } from "@/lib/datas-sp";

// Contexto financeiro de um irmão para quem assina/confere documentos que
// declaram regularidade (Atestado de Regularidade, Nada Consta do Quitte
// Placet): situação sincronizada do cadastro, capitações em aberto (com o
// que já venceu), totais e as últimas pagas. Lido nos cards de Processos —
// a decisão do Tesoureiro deixa de depender de um status possivelmente
// defasado.

export type CapitacaoEmAberto = {
  id: string;
  referencia: string; // "MM/AAAA"
  valorCents: number;
  dueDate: Date;
  vencida: boolean;
};

export type CapitacaoPaga = {
  id: string;
  referencia: string;
  paidAt: Date | null;
  valorCents: number;
};

export type ContextoFinanceiro = {
  status: MemberStatus;
  statusMotivo: string | null;
  emAberto: CapitacaoEmAberto[];
  totalEmAbertoCents: number;
  totalVencidoCents: number;
  ultimasPagas: CapitacaoPaga[];
  asaasAtivo: boolean;
};

export function referenciaCapitacao(mes: number, ano: number) {
  return `${String(mes).padStart(2, "0")}/${ano}`;
}

export function brlCents(cents: number) {
  return (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

// Classifica as capitações em aberto (PENDENTE/VENCIDA) e soma os totais.
// Puro: a data de referência entra por parâmetro (testes e cron).
export function resumirEmAberto(
  invoices: {
    id: string;
    referenceMonth: number;
    referenceYear: number;
    amountCents: number;
    dueDate: Date;
    status: string;
  }[],
  agora: Date = new Date()
) {
  const emAberto: CapitacaoEmAberto[] = invoices
    .filter((i) => i.status === "PENDENTE" || i.status === "VENCIDA")
    .map((i) => ({
      id: i.id,
      referencia: referenciaCapitacao(i.referenceMonth, i.referenceYear),
      valorCents: i.amountCents,
      dueDate: i.dueDate,
      vencida: i.status === "VENCIDA" || capitacaoVencida(i.dueDate, agora),
    }))
    .sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime());
  const totalEmAbertoCents = emAberto.reduce((s, i) => s + i.valorCents, 0);
  const totalVencidoCents = emAberto
    .filter((i) => i.vencida)
    .reduce((s, i) => s + i.valorCents, 0);
  return { emAberto, totalEmAbertoCents, totalVencidoCents };
}

export async function contextoFinanceiroDoIrmao(
  lodgeId: string,
  userId: string,
  agora: Date = new Date()
): Promise<ContextoFinanceiro> {
  const [user, abertas, pagas, lodge] = await Promise.all([
    prisma.user.findUniqueOrThrow({
      where: { id: userId, lodgeId },
      select: { status: true, statusMotivo: true },
    }),
    prisma.invoice.findMany({
      where: { lodgeId, userId, status: { in: ["PENDENTE", "VENCIDA"] } },
      orderBy: { dueDate: "asc" },
      select: {
        id: true,
        referenceMonth: true,
        referenceYear: true,
        amountCents: true,
        dueDate: true,
        status: true,
      },
    }),
    prisma.invoice.findMany({
      where: { lodgeId, userId, status: "PAGA" },
      orderBy: [{ paidAt: "desc" }, { dueDate: "desc" }],
      take: 3,
      select: {
        id: true,
        referenceMonth: true,
        referenceYear: true,
        amountCents: true,
        paidAt: true,
      },
    }),
    prisma.lodge.findUnique({
      where: { id: lodgeId },
      select: { asaasApiKey: true },
    }),
  ]);
  return {
    status: user.status,
    statusMotivo: user.statusMotivo,
    ...resumirEmAberto(abertas, agora),
    ultimasPagas: pagas.map((p) => ({
      id: p.id,
      referencia: referenciaCapitacao(p.referenceMonth, p.referenceYear),
      paidAt: p.paidAt,
      valorCents: p.amountCents,
    })),
    asaasAtivo: !!lodge?.asaasApiKey,
  };
}
