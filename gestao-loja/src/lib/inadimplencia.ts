import { prisma } from "@/lib/prisma";
import { inicioDoDiaSaoPaulo } from "@/lib/datas-sp";
import { notificarEvento, usuariosDoCargo } from "@/lib/notificar-evento";

export const MOTIVO_INADIMPLENCIA = "inadimplencia";

// Inadimplência automática (idempotente):
// 1. capitações PENDENTE com vencimento passado (dia já encerrado em São
//    Paulo) viram VENCIDA
// 2. membro ATIVO com >= limiteInadimplencia capitações vencidas vira IRREGULAR
//    (statusMotivo = "inadimplencia")
// 3. membro IRREGULAR *por inadimplência* que voltou a ficar abaixo do limite
//    volta a ATIVO
// LICENCIADO, EX_MEMBRO e IRREGULAR marcado manualmente (statusMotivo ≠
// "inadimplencia") nunca são alterados aqui — status manual é decisão da
// Secretaria (lib/status-membro.ts).
export async function syncInadimplencia(lodgeId: string) {
  const lodge = await prisma.lodge.findUniqueOrThrow({
    where: { id: lodgeId },
    select: { limiteInadimplencia: true },
  });

  await prisma.invoice.updateMany({
    where: { lodgeId, status: "PENDENTE", dueDate: { lt: inicioDoDiaSaoPaulo() } },
    data: { status: "VENCIDA" },
  });

  const overdue = await prisma.invoice.groupBy({
    by: ["userId"],
    where: { lodgeId, status: "VENCIDA" },
    _count: { _all: true },
  });
  const overdueByUser = new Map(overdue.map((o) => [o.userId, o._count._all]));

  const members = await prisma.user.findMany({
    where: { lodgeId, status: { in: ["ATIVO", "IRREGULAR"] } },
    select: { id: true, name: true, status: true, statusMotivo: true },
  });

  const toIrregular: typeof members = [];
  const toAtivo: typeof members = [];
  for (const m of members) {
    const count = overdueByUser.get(m.id) ?? 0;
    if (m.status === "ATIVO" && count >= lodge.limiteInadimplencia) {
      toIrregular.push(m);
    } else if (
      m.status === "IRREGULAR" &&
      m.statusMotivo === MOTIVO_INADIMPLENCIA &&
      count < lodge.limiteInadimplencia
    ) {
      toAtivo.push(m);
    }
  }
  if (toIrregular.length > 0) {
    await prisma.user.updateMany({
      where: { id: { in: toIrregular.map((m) => m.id) }, lodgeId },
      data: { status: "IRREGULAR", statusMotivo: MOTIVO_INADIMPLENCIA, statusManualAt: null },
    });
  }
  if (toAtivo.length > 0) {
    await prisma.user.updateMany({
      where: { id: { in: toAtivo.map((m) => m.id) }, lodgeId },
      data: { status: "ATIVO", statusMotivo: null, statusManualAt: null },
    });
  }

  if (toIrregular.length > 0 || toAtivo.length > 0) {
    const esmoleres = await usuariosDoCargo(prisma, lodgeId, "ESMOLER");
    const ts = Date.now();
    for (const m of toIrregular) {
      const n = overdueByUser.get(m.id) ?? 0;
      await notificarEvento(prisma, {
        lodgeId,
        sourceKey: `status:${m.id}:IRREGULAR:${ts}:self`,
        userId: m.id,
        type: "FINANCIAL_APPROVAL",
        title: "Sua situação passou a Irregular (capitações em atraso)",
        description: `Há ${n} capitação(ões) vencida(s). Regularize os pagamentos para voltar a Ativo automaticamente.`,
        link: "/tesouraria/mensalidades",
      });
      for (const e of esmoleres) {
        await notificarEvento(prisma, {
          lodgeId,
          sourceKey: `status:${m.id}:IRREGULAR:${ts}:esm:${e}`,
          userId: e,
          type: "FINANCIAL_APPROVAL",
          title: `${m.name} passou a Irregular por inadimplência`,
          description: `${n} capitação(ões) vencida(s). Vale um contato fraterno.`,
          link: `/secretaria/membros/${m.id}`,
        });
      }
    }
    for (const m of toAtivo) {
      await notificarEvento(prisma, {
        lodgeId,
        sourceKey: `status:${m.id}:ATIVO:${ts}:self`,
        userId: m.id,
        type: "FINANCIAL_APPROVAL",
        title: "Sua situação voltou a Ativo",
        description: "As capitações em atraso foram regularizadas. Obrigado, irmão!",
        link: "/tesouraria/mensalidades",
      });
      for (const e of esmoleres) {
        await notificarEvento(prisma, {
          lodgeId,
          sourceKey: `status:${m.id}:ATIVO:${ts}:esm:${e}`,
          userId: e,
          type: "FINANCIAL_APPROVAL",
          title: `${m.name} voltou a Ativo`,
          description: "Capitações regularizadas.",
          link: `/secretaria/membros/${m.id}`,
        });
      }
    }
  }
  return { irregulares: toIrregular.length, regularizados: toAtivo.length };
}
