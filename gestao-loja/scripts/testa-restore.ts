// Teste manual de ida-e-volta do backup/restauração contra o banco local.
//   npx tsx scripts/testa-restore.ts
import { prisma } from "../src/lib/prisma";
import { gerarBackupLoja } from "../src/lib/backup";
import { restaurarBackupLoja } from "../src/lib/restore";
import { sealSecret, openSecret, isEncryptedSecret } from "../src/lib/secrets";

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

  // Segredo cifrado (AES-256-GCM) gravado antes do ciclo — deve sobreviver ao
  // restore intacto (o backup não o contém; o restore preserva da loja atual).
  const SEGREDO = "senha-app-gmail-de-teste";
  await prisma.lodge.update({
    where: { id: lodge.id },
    data: { gmailAppPassword: sealSecret(SEGREDO) },
  });

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
  const lodgeDepois = await prisma.lodge.findUniqueOrThrow({
    where: { number: "7777" },
  });
  const segredoOk =
    !!lodgeDepois.gmailAppPassword &&
    isEncryptedSecret(lodgeDepois.gmailAppPassword) &&
    openSecret(lodgeDepois.gmailAppPassword) === SEGREDO;
  // Backup não pode conter o segredo (nem cifrado)
  const JSZip = (await import("jszip")).default;
  const zipLido = await JSZip.loadAsync(zip);
  const lojaNoZip = await zipLido.file("dados/loja.json")!.async("string");
  const zipSemSegredo =
    !lojaNoZip.includes(SEGREDO) && !lojaNoZip.includes("gmailAppPassword");

  console.log("Contagens idênticas:", igual);
  console.log("Nome do teste-10 restaurado:", nome !== "NOME ERRADO", `(${nome})`);
  console.log("Senha do teste-01 preservada:", senhaDepois === senhaAntes);
  console.log("Segredo cifrado sobreviveu e decifra:", segredoOk);
  console.log("ZIP não contém o segredo:", zipSemSegredo);
  if (
    !igual ||
    nome === "NOME ERRADO" ||
    senhaDepois !== senhaAntes ||
    !segredoOk ||
    !zipSemSegredo
  ) {
    process.exit(1);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
