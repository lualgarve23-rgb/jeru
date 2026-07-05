import { prisma } from "@/lib/prisma";

// Inadimplência automática (idempotente):
// 1. capitações PENDENTE com vencimento passado viram VENCIDA
// 2. membro ATIVO com >= limiteInadimplencia capitações vencidas vira IRREGULAR
// 3. membro IRREGULAR que voltou a ficar abaixo do limite volta a ATIVO
// LICENCIADO e EX_MEMBRO nunca são alterados aqui.
export async function syncInadimplencia(lodgeId: string) {
  const lodge = await prisma.lodge.findUniqueOrThrow({
    where: { id: lodgeId },
    select: { limiteInadimplencia: true },
  });

  await prisma.invoice.updateMany({
    where: { lodgeId, status: "PENDENTE", dueDate: { lt: new Date() } },
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
    select: { id: true, status: true },
  });

  const toIrregular: string[] = [];
  const toAtivo: string[] = [];
  for (const m of members) {
    const count = overdueByUser.get(m.id) ?? 0;
    if (m.status === "ATIVO" && count >= lodge.limiteInadimplencia) {
      toIrregular.push(m.id);
    } else if (m.status === "IRREGULAR" && count < lodge.limiteInadimplencia) {
      toAtivo.push(m.id);
    }
  }
  if (toIrregular.length > 0) {
    await prisma.user.updateMany({
      where: { id: { in: toIrregular } },
      data: { status: "IRREGULAR" },
    });
  }
  if (toAtivo.length > 0) {
    await prisma.user.updateMany({
      where: { id: { in: toAtivo } },
      data: { status: "ATIVO" },
    });
  }
  return { irregulares: toIrregular.length, regularizados: toAtivo.length };
}
