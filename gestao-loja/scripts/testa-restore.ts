// Teste manual de ida-e-volta do backup/restauração contra o banco local.
//   npx tsx scripts/testa-restore.ts
import { prisma } from "../src/lib/prisma";
import { gerarBackupLoja } from "../src/lib/backup";
import { restaurarBackupLoja } from "../src/lib/restore";
import { sealSecret, openSecret, isEncryptedSecret } from "../src/lib/secrets";

async function contagens(lodgeId: string) {
  const where = { lodgeId };
  const [
    users, sessoes, presencas, atas, invoices, transacoes,
    quitte, processos, assinantes, atestados, afastamentos, mutua,
    notificacoes, auditoria, conversas, mensagens,
  ] = await Promise.all([
    prisma.user.count({ where }),
    prisma.lodgeSession.count({ where }),
    prisma.attendance.count({ where }),
    prisma.ata.count({ where }),
    prisma.invoice.count({ where }),
    prisma.transaction.count({ where }),
    prisma.quittePlacet.count({ where }),
    prisma.processoDocumento.count({ where }),
    prisma.processoAssinante.count({ where: { documento: { lodgeId } } }),
    prisma.atestadoRegularidade.count({ where }),
    prisma.pedidoAfastamento.count({ where }),
    prisma.mutuaEntrega.count({ where }),
    prisma.notification.count({ where }),
    prisma.auditEvent.count({ where }),
    prisma.assistenteConversa.count({ where }),
    prisma.assistenteMensagem.count({ where: { conversa: { lodgeId } } }),
  ]);
  return {
    users, sessoes, presencas, atas, invoices, transacoes,
    quitte, processos, assinantes, atestados, afastamentos, mutua,
    notificacoes, auditoria, conversas, mensagens,
  };
}

async function main() {
  const lodge = await prisma.lodge.findUniqueOrThrow({
    where: { number: "7777" },
  });
  const antes = await contagens(lodge.id);
  const user01 = await prisma.user.findFirstOrThrow({
    where: { lodgeId: lodge.id, cim: "teste-01" },
  });
  const senhaAntes = user01.passwordHash;
  const cardTokenAntes = user01.cardToken;

  // Registros com Bytes nos modelos novos: têm de ir para arquivos/ e voltar
  // byte a byte (nunca serializados no JSON).
  const PDF_TESTE = Buffer.from("%PDF-1.4 teste-restore " + Date.now());
  await prisma.processoDocumento.create({
    data: {
      lodgeId: lodge.id,
      titulo: "Processo de teste do restore",
      arquivo: PDF_TESTE,
      arquivoNome: "teste.pdf",
      criadoPorId: user01.id,
      assinantes: { create: [{ ordem: 1, cargo: "Venerável Mestre" }] },
    },
  });
  await prisma.mutuaEntrega.upsert({
    where: { userId: user01.id },
    update: { arquivo: PDF_TESTE, nome: "mutua.pdf", mimeType: "application/pdf" },
    create: {
      lodgeId: lodge.id,
      userId: user01.id,
      arquivo: PDF_TESTE,
      nome: "mutua.pdf",
      mimeType: "application/pdf",
    },
  });

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
  const user01Depois = await prisma.user.findFirstOrThrow({
    where: { lodgeId: lodge.id, cim: "teste-01" },
  });
  const senhaDepois = user01Depois.passwordHash;
  const cardTokenRegenerado = user01Depois.cardToken !== cardTokenAntes;
  const processoDepois = await prisma.processoDocumento.findFirst({
    where: { lodgeId: lodge.id, titulo: "Processo de teste do restore" },
    include: { assinantes: true },
  });
  const mutuaDepois = await prisma.mutuaEntrega.findUnique({
    where: { userId: user01Depois.id },
  });
  const binariosOk =
    !!processoDepois &&
    Buffer.from(processoDepois.arquivo).equals(PDF_TESTE) &&
    processoDepois.assinantes.length === 1 &&
    !!mutuaDepois?.arquivo &&
    Buffer.from(mutuaDepois.arquivo).equals(PDF_TESTE);
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
  const membrosNoZip = await zipLido.file("dados/membros.json")!.async("string");
  const zipSemCardToken =
    !membrosNoZip.includes("cardToken") && !membrosNoZip.includes("lockedUntil");
  // Nenhum JSON pode carregar Bytes serializados ({"type":"Buffer",...})
  let jsonSemBytes = true;
  for (const f of Object.values(zipLido.files)) {
    if (f.name.startsWith("dados/") && !f.dir) {
      if ((await f.async("string")).includes('"type": "Buffer"')) {
        jsonSemBytes = false;
        console.log("JSON com Bytes serializados:", f.name);
      }
    }
  }
  const arquivosNoZip = Object.keys(zipLido.files).filter((n) =>
    /^arquivos\/(processos|mutua)\//.test(n)
  );

  console.log("Contagens idênticas:", igual);
  console.log("Nome do teste-10 restaurado:", nome !== "NOME ERRADO", `(${nome})`);
  console.log("Senha do teste-01 preservada:", senhaDepois === senhaAntes);
  console.log("Segredo cifrado sobreviveu e decifra:", segredoOk);
  console.log("ZIP não contém o segredo:", zipSemSegredo);
  console.log("ZIP não contém cardToken/lockout:", zipSemCardToken);
  console.log("cardToken regenerado no restore:", cardTokenRegenerado);
  console.log("JSON sem Bytes serializados:", jsonSemBytes);
  console.log("Binários de processos/Mútua no ZIP:", arquivosNoZip.length, arquivosNoZip);
  console.log("Binários voltaram idênticos (processo + assinante + Mútua):", binariosOk);
  if (
    !igual ||
    nome === "NOME ERRADO" ||
    senhaDepois !== senhaAntes ||
    !segredoOk ||
    !zipSemSegredo ||
    !zipSemCardToken ||
    !cardTokenRegenerado ||
    !jsonSemBytes ||
    arquivosNoZip.length < 2 ||
    !binariosOk
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
