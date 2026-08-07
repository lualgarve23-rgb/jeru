import type { Prisma, PrismaClient } from "@prisma/client";

type Db = PrismaClient | Prisma.TransactionClient;

// Exclusão completa dos dados de uma loja, na ordem certa de FKs (o schema
// não usa onDelete: Cascade nas relações por loja). Definição ÚNICA — usada
// pela exclusão no /admin, pela recriação da loja demo e pela restauração
// de backup. Familiares, registros do Meta e anexos de candidato caem por
// cascade (User e ProcessoAdmissao).
export async function deleteLodgeData(db: Db, lodgeId: string) {
  const where = { lodgeId };
  await db.notification.deleteMany({ where });
  await db.instrucao.deleteMany({ where });
  await db.visitaExterna.deleteMany({ where });
  await db.bibliotecaItem.deleteMany({ where });
  await db.processoProgressao.deleteMany({ where });
  await db.processoAdmissao.deleteMany({ where });
  await db.quittePlacet.deleteMany({ where });
  await db.transaction.deleteMany({ where });
  await db.invoice.deleteMany({ where });
  await db.expense.deleteMany({ where });
  await db.categoriaFinanceira.deleteMany({ where });
  await db.donation.deleteMany({ where });
  await db.charityEvent.deleteMany({ where });
  await db.attendance.deleteMany({ where });
  await db.ata.deleteMany({ where });
  await db.lodgeSession.deleteMany({ where });
  await db.prancha.deleteMany({ where });
  await db.document.deleteMany({ where });
  await db.degreeHistory.deleteMany({ where });
  await db.roleHistory.deleteMany({ where });
  await db.cargoRito.deleteMany({ where });
  await db.user.deleteMany({ where });
  await db.lodge.delete({ where: { id: lodgeId } });
}
