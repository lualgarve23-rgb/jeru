import JSZip from "jszip";
import { prisma } from "@/lib/prisma";
import { toCsv, brlCsv } from "@/lib/csv";

// Backup completo dos dados da Loja (export por tenant), acionado pelo
// Venerável ou Secretário em Configurações da Loja. Gera um ZIP com:
//  - dados/*.json  → dump integral das tabelas da loja (sem segredos)
//  - planilhas/*.csv → visões amigáveis para Excel/LibreOffice
//  - arquivos/     → PDFs guardados no banco (atas/pranchas gov.br, biblioteca)
//  - LEIA-ME.txt   → o que está no ZIP e o que permanece no Google Drive
//
// Segredos NUNCA saem no backup: hashes de senha, códigos de recuperação,
// chaves Asaas, refresh token do Google e senha de app do Gmail.

const dtf = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo" });
const fmtData = (d: Date | null | undefined) => (d ? dtf.format(d) : "");

// JSON com datas legíveis (ISO) e sem colunas binárias/sensíveis
function toJson(rows: unknown[], omitir: string[] = []) {
  const limpo = rows.map((r) => {
    const obj = { ...(r as Record<string, unknown>) };
    for (const k of omitir) delete obj[k];
    return obj;
  });
  return JSON.stringify(limpo, null, 2);
}

const nomeArquivoSeguro = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._ -]/g, "_")
    .slice(0, 80)
    .trim();

export async function gerarBackupLoja(lodgeId: string): Promise<{
  zip: Buffer;
  fileName: string;
}> {
  const lodge = await prisma.lodge.findUniqueOrThrow({
    where: { id: lodgeId },
  });
  const porLoja = { where: { lodgeId } } as const;
  const porUsuarioDaLoja = { where: { user: { lodgeId } } } as const;

  const [
    users,
    familiares,
    metaRegistros,
    degreeHistory,
    roleHistory,
    cargosRito,
    sessoes,
    presencas,
    instrucoes,
    visitasExternas,
    atas,
    pranchas,
    documents,
    biblioteca,
    invoices,
    expenses,
    transactions,
    categorias,
    donations,
    charityEvents,
    processosAdmissao,
    quittePlacets,
    processosProgressao,
  ] = await Promise.all([
    prisma.user.findMany({ ...porLoja, orderBy: { name: "asc" } }),
    prisma.familyMember.findMany(porUsuarioDaLoja),
    prisma.metaRegistro.findMany(porUsuarioDaLoja),
    prisma.degreeHistory.findMany(porLoja),
    prisma.roleHistory.findMany(porLoja),
    prisma.cargoRito.findMany(porLoja),
    prisma.lodgeSession.findMany({ ...porLoja, orderBy: { date: "asc" } }),
    prisma.attendance.findMany({
      where: { lodgeId },
      include: {
        user: { select: { name: true, cim: true } },
        session: { select: { date: true, type: true } },
      },
      orderBy: { checkedInAt: "asc" },
    }),
    prisma.instrucao.findMany(porLoja),
    prisma.visitaExterna.findMany(porLoja),
    prisma.ata.findMany({ ...porLoja, orderBy: { number: "asc" } }),
    prisma.prancha.findMany({
      ...porLoja,
      orderBy: [{ year: "asc" }, { number: "asc" }],
    }),
    prisma.document.findMany(porLoja),
    prisma.bibliotecaItem.findMany(porLoja),
    prisma.invoice.findMany({
      where: { lodgeId },
      include: { user: { select: { name: true, cim: true } } },
      orderBy: [{ referenceYear: "asc" }, { referenceMonth: "asc" }],
    }),
    prisma.expense.findMany(porLoja),
    prisma.transaction.findMany({ ...porLoja, orderBy: { date: "asc" } }),
    prisma.categoriaFinanceira.findMany(porLoja),
    prisma.donation.findMany(porLoja),
    prisma.charityEvent.findMany(porLoja),
    prisma.processoAdmissao.findMany(porLoja),
    prisma.quittePlacet.findMany(porLoja),
    prisma.processoProgressao.findMany(porLoja),
  ]);

  const zip = new JSZip();

  // ── dados/*.json — dump integral, sem segredos nem binários ──
  const dados = zip.folder("dados")!;
  dados.file(
    "loja.json",
    toJson([lodge], [
      "certFundoPdf",
      "asaasApiKey",
      "asaasWebhookToken",
      "googleRefreshToken",
      "gmailAppPassword",
    ])
  );
  dados.file(
    "membros.json",
    toJson(users, ["passwordHash", "resetCodeHash", "photoUrl", "signatureUrl"])
  );
  dados.file("familiares.json", toJson(familiares));
  dados.file("meta-registros.json", toJson(metaRegistros));
  dados.file("historico-graus.json", toJson(degreeHistory));
  dados.file("historico-cargos.json", toJson(roleHistory));
  dados.file("cargos-rito.json", toJson(cargosRito));
  dados.file("sessoes.json", toJson(sessoes, ["qrToken", "inviteToken"]));
  dados.file(
    "presencas.json",
    toJson(presencas.map(({ user: _u, session: _s, ...resto }) => resto))
  );
  dados.file("instrucoes.json", toJson(instrucoes));
  dados.file("visitas-externas.json", toJson(visitasExternas));
  dados.file("atas.json", toJson(atas, ["govbrPdf"]));
  dados.file("pranchas.json", toJson(pranchas, ["govbrPdf"]));
  dados.file("documentos-drive.json", toJson(documents));
  dados.file("biblioteca.json", toJson(biblioteca, ["arquivo"]));
  dados.file(
    "mensalidades.json",
    toJson(invoices.map(({ user: _u, ...resto }) => resto))
  );
  dados.file("despesas.json", toJson(expenses));
  dados.file("livro-caixa.json", toJson(transactions));
  dados.file("categorias-financeiras.json", toJson(categorias));
  dados.file("doacoes.json", toJson(donations));
  dados.file("eventos-beneficentes.json", toJson(charityEvents));
  dados.file("processos-admissao.json", toJson(processosAdmissao));
  dados.file("quitte-placets.json", toJson(quittePlacets));
  dados.file("processos-progressao.json", toJson(processosProgressao));

  // ── planilhas/*.csv — visões amigáveis ao Excel brasileiro ──
  const planilhas = zip.folder("planilhas")!;
  planilhas.file(
    "membros.csv",
    toCsv(
      ["CIM", "Nome", "E-mail", "Telefone", "Grau", "Cargo", "Status", "Iniciação"],
      users.map((u) => [
        u.cim,
        u.name,
        u.email,
        u.phone ?? "",
        u.degree,
        u.cargoRito ?? u.currentRole,
        u.status,
        fmtData(u.initiationDate),
      ])
    )
  );
  planilhas.file(
    "presencas.csv",
    toCsv(
      ["Data da sessão", "Tipo", "Nome", "CIM", "Visitante", "Loja de origem", "Compareceu"],
      presencas.map((p) => [
        fmtData(p.session.date),
        p.session.type,
        p.user?.name ?? p.visitorName ?? "",
        p.user?.cim ?? p.visitorCim ?? "",
        p.userId ? "Não" : "Sim",
        p.visitorLodge ?? "",
        p.checkedIn ? "Sim" : "Não",
      ])
    )
  );
  planilhas.file(
    "mensalidades.csv",
    toCsv(
      ["Membro", "CIM", "Referência", "Valor (R$)", "Vencimento", "Status", "Pago em"],
      invoices.map((i) => [
        i.user.name,
        i.user.cim,
        `${String(i.referenceMonth).padStart(2, "0")}/${i.referenceYear}`,
        brlCsv(i.amountCents),
        fmtData(i.dueDate),
        i.status,
        fmtData(i.paidAt),
      ])
    )
  );
  planilhas.file(
    "livro-caixa.csv",
    toCsv(
      ["Data", "Tipo", "Categoria", "Descrição", "Valor (R$)"],
      transactions.map((t) => [
        fmtData(t.date),
        t.type,
        t.category ?? "",
        t.description,
        brlCsv(t.amountCents),
      ])
    )
  );
  planilhas.file(
    "despesas.csv",
    toCsv(
      ["Descrição", "Fornecedor", "Categoria", "Valor (R$)", "Vencimento", "Status", "Paga em"],
      expenses.map((e) => [
        e.description,
        e.supplier ?? "",
        e.category ?? "",
        brlCsv(e.amountCents),
        fmtData(e.dueDate),
        e.status,
        fmtData(e.paidAt),
      ])
    )
  );

  // ── arquivos/ — binários guardados no banco ──
  const arquivos = zip.folder("arquivos")!;
  for (const ata of atas) {
    if (ata.govbrPdf) {
      arquivos.file(
        `atas/ata-${String(ata.number).padStart(3, "0")}-govbr.pdf`,
        Buffer.from(ata.govbrPdf)
      );
    }
  }
  for (const p of pranchas) {
    if (p.govbrPdf) {
      arquivos.file(
        `pranchas/prancha-${p.year}-${String(p.number).padStart(3, "0")}-govbr.pdf`,
        Buffer.from(p.govbrPdf)
      );
    }
  }
  for (const item of biblioteca) {
    const ext = item.mimeType === "application/pdf" ? "pdf" : "bin";
    arquivos.file(
      `biblioteca/${nomeArquivoSeguro(item.titulo) || item.id}.${ext}`,
      Buffer.from(item.arquivo)
    );
  }
  if (lodge.certFundoPdf) {
    arquivos.file(
      "certificado-visita-fundo.pdf",
      Buffer.from(lodge.certFundoPdf)
    );
  }

  // ── LEIA-ME.txt ──
  const arquivosNoDrive =
    documents.length +
    atas.filter((a) => a.driveFileId).length +
    pranchas.filter((p) => p.driveFileId).length +
    quittePlacets.filter((q) => q.driveFileId).length +
    visitasExternas.filter((v) => v.certificadoDriveId).length;
  zip.file(
    "LEIA-ME.txt",
    [
      `Backup da Loja ${lodge.name} nº ${lodge.number}`,
      `Gerado em ${dtf.format(new Date())} pelo sistema de gestão.`,
      "",
      "Conteúdo:",
      "  dados/      — todos os registros da loja em JSON (formato técnico, reimportável).",
      "  planilhas/  — membros, presenças, mensalidades, livro-caixa e despesas em CSV (abre no Excel).",
      "  arquivos/   — PDFs guardados no banco: atas e pranchas assinadas no gov.br, acervo da biblioteca e fundo do certificado de visita.",
      "",
      "Por segurança, o backup NÃO contém senhas dos membros nem as credenciais",
      "da loja (chaves Asaas, conexão Google, senha de app do Gmail).",
      "",
      `Arquivos arquivados no Google Drive da Loja (${arquivosNoDrive} referência(s)): atas assinadas,`,
      "pranchas, documentos digitalizados e certificados de visita continuam na pasta da",
      "loja no Drive — os IDs estão em dados/documentos-drive.json e nos demais JSON",
      "(campos driveFileId / certificadoDriveId). Faça também o backup dessa pasta.",
    ].join("\n")
  );

  const buffer = await zip.generateAsync({
    type: "nodebuffer",
    compression: "DEFLATE",
    compressionOptions: { level: 6 },
  });
  const hoje = new Date().toISOString().slice(0, 10);
  return {
    zip: buffer,
    fileName: `backup-loja-${lodge.number}-${hoje}.zip`,
  };
}
