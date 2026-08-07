// Teste manual de ida-e-volta do backup/restauração contra o banco local.
//   npx tsx scripts/testa-restore.ts
import { prisma } from "../src/lib/prisma";
import { gerarBackupLoja } from "../src/lib/backup";
import { restaurarBackupLoja } from "../src/lib/restore";

async function contagens(lodgeId: string) {
  const where = { lodgeId };
  const [users, sessoes, presencas, atas, invoices, transacoes] =
    await Promise.all([
      prisma.user.count({ where }),
      prisma.lodgeSession.count({ where }),
      prisma.attendance.count({ where }),
      prisma.ata.count({ where }),
      prisma.invoice.count({ where }),
      prisma.transaction.count({ where }),
    ]);
  return { users, sessoes, presencas, atas, invoices, transacoes };
}

async function main() {
  const lodge = await prisma.lodge.findUniqueOrThrow({
    where: { number: "7777" },
  });
  const antes = await contagens(lodge.id);
  const senhaAntes = (await prisma.user.findFirstOrThrow({
    where: { lodgeId: lodge.id, cim: "teste-01" },
  })).passwordHash;

  console.log("Antes:", antes);
  const { zip, fileName } = await gerarBackupLoja(lodge.id);
  console.log(`Backup gerado: ${fileName} (${(zip.length / 1024).toFixed(0)} KB)`);

  // Suja os dados: apaga uma sessão (com presenças) e renomeia um membro
  const sessao = await prisma.lodgeSession.findFirstOrThrow({
    where: { lodgeId: lodge.id, ata: null },
  });
  await prisma.attendance.deleteMany({ where: { sessionId: sessao.id } });
  await prisma.lodgeSession.delete({ where: { id: sessao.id } });
  await prisma.user.updateMany({
    where: { lodgeId: lodge.id, cim: "teste-10" },
    data: { name: "NOME ERRADO" },
  });
  console.log("Dados sujos:", await contagens(lodge.id));

  const { ok, avisos } = await restaurarBackupLoja(zip);
  console.log("Restauração:", ok);
  for (const a of avisos) console.log("Aviso:", a);

  const depois = await contagens(lodge.id);
  console.log("Depois:", depois);
  const igual = JSON.stringify(antes) === JSON.stringify(depois);
  const nome = (await prisma.user.findFirstOrThrow({
    where: { lodgeId: lodge.id, cim: "teste-10" },
  })).name;
  const senhaDepois = (await prisma.user.findFirstOrThrow({
    where: { lodgeId: lodge.id, cim: "teste-01" },
  })).passwordHash;
  console.log("Contagens idênticas:", igual);
  console.log("Nome do teste-10 restaurado:", nome !== "NOME ERRADO", `(${nome})`);
  console.log("Senha do teste-01 preservada:", senhaDepois === senhaAntes);
  if (!igual || nome === "NOME ERRADO" || senhaDepois !== senhaAntes) {
    process.exit(1);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
