import type { Prisma, PrismaClient } from "@prisma/client";

type Db = PrismaClient | Prisma.TransactionClient;

// Exclusão completa dos dados de uma loja, na ordem certa de FKs (o schema
// não usa onDelete: Cascade na maioria das relações por loja). Definição
// ÚNICA — usada pela exclusão no /admin, pela recriação da loja demo e pela
// restauração de backup.
//
// Regra: TODO modelo do schema com `lodgeId` precisa aparecer aqui (há um
// teste estático em __tests__/lodge-delete-cobertura.test.ts que confere).
// Filhos sem lodgeId caem por cascade do pai: FamilyMember e MetaRegistro
// (User), CandidatoAnexo (ProcessoAdmissao), ProcessoAssinante
// (ProcessoDocumento), AssistenteMensagem (AssistenteConversa).
export async function deleteLodgeData(db: Db, lodgeId: string) {
  const where = { lodgeId };

  // Sem FK para outras tabelas — podem sair primeiro
  await db.auditEvent.deleteMany({ where });
  await db.job.deleteMany({ where });
  await db.notification.deleteMany({ where });

  // Assistente (mensagens caem por cascade da conversa)
  await db.assistenteConversa.deleteMany({ where });

  // Processos da caixa de assinaturas: referenciam User e Prancha
  // (assinantes caem por cascade do documento)
  await db.processoDocumento.deleteMany({ where });

  // Solicitações à Secretaria e Mútua: referenciam User
  await db.atestadoRegularidade.deleteMany({ where });
  await db.pedidoAfastamento.deleteMany({ where });
  await db.mutuaEntrega.deleteMany({ where });
  await db.contatoEsmoler.deleteMany({ where });

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
