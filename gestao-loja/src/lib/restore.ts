import JSZip from "jszip";
import bcrypt from "bcryptjs";
import { randomBytes } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { deleteLodgeData } from "@/lib/lodge-delete";
import { USER_CAMPOS_OMITIDOS } from "@/lib/backup";

// Restauração do backup da Loja (ZIP gerado em /api/backup) — SUPER_ADMIN.
// Substitui TODOS os dados da loja de mesmo número (ou recria a loja, se não
// existir mais), preservando os ids originais — assim as referências ao
// Google Drive (driveFileId etc.) continuam válidas.
//
// O backup não contém segredos, portanto:
//  - credenciais da loja (Asaas, Google, Gmail) são preservadas da loja atual;
//  - senhas: preservadas por CIM quando o membro ainda existe; membros sem
//    senha preservada recebem hash aleatório e recuperam por "Esqueci a senha";
//  - cardToken (carteirinha) é regenerado — o backup não o contém.
//
// Compatível com ZIPs antigos: JSON ausente = modelo pulado; binário ausente
// em campo opcional = null; binário ausente em campo obrigatório = registro
// não restaurado (aviso).
//
// Regra: TODO modelo que backup.ts grava é lido aqui, na ordem de FK — teste
// estático em __tests__/backup-cobertura.test.ts.

type Row = Record<string, unknown>;

async function lerJson(zip: JSZip, nome: string): Promise<Row[]> {
  const file = zip.file(`dados/${nome}`);
  if (!file) return [];
  return JSON.parse(await file.async("string")) as Row[];
}

async function lerBinario(zip: JSZip, caminho: string) {
  const file = zip.file(caminho);
  return file ? Buffer.from(await file.async("nodebuffer")) : null;
}

// Localiza um binário em arquivos/<pasta>/ pelo prefixo "<id>__" (backups
// novos) ou por nome exato legado.
function acharPorId(zip: JSZip, pasta: string, id: string): JSZip.JSZipObject | null {
  let achado: JSZip.JSZipObject | null = null;
  zip.folder(`arquivos/${pasta}`)?.forEach((rel, f) => {
    if (!achado && rel.startsWith(`${id}__`)) achado = f;
  });
  return achado;
}

// Recompõe os campos Bytes gravados por separarBinarios (backup.ts):
// arquivos/<pasta>/<id>__<campo>.<ext>. Campos obrigatórios sem arquivo no
// ZIP deixam o registro de fora (aviso); opcionais viram null.
async function juntarBinarios(
  zip: JSZip,
  pasta: string,
  rows: Row[],
  campos: string[],
  obrigatorios: string[],
  avisos: string[],
  rotulo: string
): Promise<Row[]> {
  const porPrefixo = new Map<string, JSZip.JSZipObject>();
  zip.folder(`arquivos/${pasta}`)?.forEach((rel, f) => {
    const m = /^([^/]+?)__([A-Za-z0-9]+)\.[A-Za-z0-9]+$/.exec(rel);
    if (m) porPrefixo.set(`${m[1]}__${m[2]}`, f);
  });
  const saida: Row[] = [];
  for (const row of rows) {
    const novo: Row = { ...row };
    let faltando: string | null = null;
    for (const campo of campos) {
      const f = porPrefixo.get(`${row.id}__${campo}`);
      if (f) {
        novo[campo] = Buffer.from(await f.async("nodebuffer"));
      } else {
        novo[campo] = null;
        if (obrigatorios.includes(campo)) faltando = campo;
      }
    }
    if (faltando) {
      avisos.push(
        `${rotulo}: arquivo "${faltando}" do registro ${row.id} não encontrado no ZIP — registro não restaurado.`
      );
      continue;
    }
    saida.push(novo);
  }
  return saida;
}

export async function restaurarBackupLoja(zipBuffer: Buffer): Promise<{
  ok: string;
  avisos: string[];
}> {
  const zip = await JSZip.loadAsync(zipBuffer);
  const avisos: string[] = [];

  const lojaRows = await lerJson(zip, "loja.json");
  const loja = lojaRows[0];
  if (!loja?.id || !loja?.number || !loja?.name) {
    throw new Error(
      "ZIP inválido: dados/loja.json não encontrado ou incompleto — use um backup gerado pelo sistema."
    );
  }
  const lodgeId = String(loja.id);
  const numero = String(loja.number);

  const [
    membros,
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
    candidatoAnexos,
    quittePlacets,
    processosProgressao,
    processosDocumento,
    processosAssinantes,
    atestados,
    afastamentos,
    mutuaEntregas,
    contatosEsmoler,
    fechamentosMes,
    notificacoes,
    auditoria,
    conversas,
    mensagens,
  ] = await Promise.all([
    lerJson(zip, "membros.json"),
    lerJson(zip, "familiares.json"),
    lerJson(zip, "meta-registros.json"),
    lerJson(zip, "historico-graus.json"),
    lerJson(zip, "historico-cargos.json"),
    lerJson(zip, "cargos-rito.json"),
    lerJson(zip, "sessoes.json"),
    lerJson(zip, "presencas.json"),
    lerJson(zip, "instrucoes.json"),
    lerJson(zip, "visitas-externas.json"),
    lerJson(zip, "atas.json"),
    lerJson(zip, "pranchas.json"),
    lerJson(zip, "documentos-drive.json"),
    lerJson(zip, "biblioteca.json"),
    lerJson(zip, "mensalidades.json"),
    lerJson(zip, "despesas.json"),
    lerJson(zip, "livro-caixa.json"),
    lerJson(zip, "categorias-financeiras.json"),
    lerJson(zip, "doacoes.json"),
    lerJson(zip, "eventos-beneficentes.json"),
    lerJson(zip, "processos-admissao.json"),
    lerJson(zip, "candidato-anexos.json"),
    lerJson(zip, "quitte-placets.json"),
    lerJson(zip, "processos-progressao.json"),
    lerJson(zip, "processos-documentos.json"),
    lerJson(zip, "processos-assinantes.json"),
    lerJson(zip, "atestados-regularidade.json"),
    lerJson(zip, "pedidos-afastamento.json"),
    lerJson(zip, "mutua-entregas.json"),
    lerJson(zip, "contatos-esmoler.json"),
    lerJson(zip, "fechamentos-mes.json"),
    lerJson(zip, "notificacoes.json"),
    lerJson(zip, "auditoria.json"),
    lerJson(zip, "assistente-conversas.json"),
    lerJson(zip, "assistente-mensagens.json"),
  ]);

  // ── O que preservar da loja atual (segredos ficam fora do backup) ──
  const atual = await prisma.lodge.findFirst({
    where: { OR: [{ id: lodgeId }, { number: numero }] },
    include: {
      users: {
        select: {
          cim: true,
          passwordHash: true,
          photoUrl: true,
          signatureUrl: true,
        },
      },
    },
  });
  if (atual && atual.id !== lodgeId) {
    throw new Error(
      `Já existe outra loja com o número ${numero} (ids diferentes) — exclua-a antes de restaurar, ou o backup não é desta base.`
    );
  }
  const preservado = new Map(
    (atual?.users ?? []).map((u) => [u.cim, u])
  );
  const segredos = atual
    ? {
        asaasApiKey: atual.asaasApiKey,
        asaasWebhookToken: atual.asaasWebhookToken,
        googleRefreshToken: atual.googleRefreshToken,
        gmailAppPassword: atual.gmailAppPassword,
      }
    : {};

  // ── Binários do ZIP ──
  const certFundoPdf = await lerBinario(zip, "certificado-visita-fundo.pdf")
    ?? await lerBinario(zip, "arquivos/certificado-visita-fundo.pdf");

  const govbrPorAta = new Map<string, Buffer>();
  for (const a of atas) {
    const f = await lerBinario(
      zip,
      `arquivos/atas/ata-${String(a.number).padStart(3, "0")}-govbr.pdf`
    );
    if (f) govbrPorAta.set(String(a.id), f);
  }
  const govbrPorPrancha = new Map<string, Buffer>();
  for (const p of pranchas) {
    const f = await lerBinario(
      zip,
      `arquivos/pranchas/prancha-${p.year}-${String(p.number).padStart(3, "0")}-govbr.pdf`
    );
    if (f) govbrPorPrancha.set(String(p.id), f);
  }

  const bibliotecaComArquivo: Row[] = [];
  for (const item of biblioteca) {
    const f = acharPorId(zip, "biblioteca", String(item.id));
    if (f) {
      bibliotecaComArquivo.push({
        ...item,
        arquivo: Buffer.from(await f.async("nodebuffer")),
      });
    } else {
      avisos.push(
        `Biblioteca: arquivo de "${item.titulo}" não encontrado no ZIP (backup antigo?) — item não restaurado.`
      );
    }
  }
  const anexosComArquivo: Row[] = [];
  for (const anexo of candidatoAnexos) {
    const f = acharPorId(zip, "candidatos", String(anexo.id));
    if (f) {
      anexosComArquivo.push({
        ...anexo,
        arquivo: Buffer.from(await f.async("nodebuffer")),
      });
    } else {
      avisos.push(
        `Admissões: anexo "${anexo.nome}" não encontrado no ZIP — não restaurado.`
      );
    }
  }

  // Binários dos modelos gravados por separarBinarios (backup.ts). Quitte
  // Placet de ZIPs antigos trazia os Bytes serializados no JSON — descartados
  // aqui (viram null), pois o Prisma não os aceita nesse formato.
  const processosComArquivo = await juntarBinarios(
    zip, "processos", processosDocumento, ["arquivo", "govbrPdf"], ["arquivo"],
    avisos, "Processos"
  );
  const idsProcessos = new Set(processosComArquivo.map((p) => String(p.id)));
  const quitteComArquivo = await juntarBinarios(
    zip, "quitte-placets", quittePlacets,
    ["cartaArquivo", "ataArquivo", "govbrPdf", "formularioArquivo"], [],
    avisos, "Quitte Placet"
  );
  const atestadosComArquivo = await juntarBinarios(
    zip, "atestados", atestados, ["govbrPdf"], [], avisos, "Atestados"
  );
  const afastamentosComArquivo = await juntarBinarios(
    zip, "afastamentos", afastamentos,
    ["requerimentoPdf", "formularioPdf", "govbrPdf"], [], avisos, "Afastamentos"
  );
  const mutuaComArquivo = await juntarBinarios(
    zip, "mutua", mutuaEntregas, ["arquivo"], [], avisos, "Mútua"
  );

  // ── Membros: senha preservada por CIM, senão hash aleatório ──
  const hashAleatorio = await bcrypt.hash(randomBytes(32).toString("hex"), 10);
  let senhasPreservadas = 0;
  const membrosData = membros.map((m) => {
    const antes = preservado.get(String(m.cim));
    if (antes) senhasPreservadas++;
    // ZIPs antigos podem trazer campos hoje omitidos (cardToken, lockout…):
    // removidos para o cardToken ser regenerado (default cuid) e o estado de
    // autenticação começar limpo.
    const limpo: Row = { ...m };
    for (const k of USER_CAMPOS_OMITIDOS) delete limpo[k];
    return {
      ...limpo,
      passwordHash: antes?.passwordHash ?? hashAleatorio,
      photoUrl: antes?.photoUrl ?? null,
      signatureUrl: antes?.signatureUrl ?? null,
      ...(antes ? {} : { mustChangePassword: true }),
    };
  });
  if (senhasPreservadas < membros.length) {
    avisos.push(
      `${membros.length - senhasPreservadas} membro(s) sem senha preservada — devem usar "Esqueci a senha" no primeiro acesso.`
    );
  }

  // Os JSON do backup são o dump fiel das tabelas; o Prisma aceita datas em
  // ISO-string, então os registros entram como estão (ids originais incluídos).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const cast = (rows: Row[]) => rows as any[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const castRow = (row: Row) => row as any;

  await prisma.$transaction(
    async (tx) => {
      if (atual) await deleteLodgeData(tx, atual.id);
      await tx.lodge.create({
        data: castRow({ ...loja, certFundoPdf, ...segredos }),
      });
      await tx.user.createMany({ data: cast(membrosData) });
      await tx.familyMember.createMany({ data: cast(familiares) });
      await tx.metaRegistro.createMany({ data: cast(metaRegistros) });
      await tx.degreeHistory.createMany({ data: cast(degreeHistory) });
      await tx.roleHistory.createMany({ data: cast(roleHistory) });
      await tx.cargoRito.createMany({ data: cast(cargosRito) });
      await tx.lodgeSession.createMany({ data: cast(sessoes) });
      for (const a of atas) {
        await tx.ata.create({
          data: castRow({
            ...a,
            govbrPdf: govbrPorAta.get(String(a.id)) ?? null,
          }),
        });
      }
      await tx.attendance.createMany({ data: cast(presencas) });
      await tx.instrucao.createMany({ data: cast(instrucoes) });
      await tx.visitaExterna.createMany({ data: cast(visitasExternas) });
      for (const p of pranchas) {
        await tx.prancha.create({
          data: castRow({
            ...p,
            govbrPdf: govbrPorPrancha.get(String(p.id)) ?? null,
          }),
        });
      }
      await tx.document.createMany({ data: cast(documents) });
      await tx.bibliotecaItem.createMany({ data: cast(bibliotecaComArquivo) });
      await tx.categoriaFinanceira.createMany({ data: cast(categorias) });
      await tx.invoice.createMany({ data: cast(invoices) });
      await tx.expense.createMany({ data: cast(expenses) });
      await tx.donation.createMany({ data: cast(donations) });
      await tx.charityEvent.createMany({ data: cast(charityEvents) });
      await tx.transaction.createMany({ data: cast(transactions) });
      await tx.processoAdmissao.createMany({ data: cast(processosAdmissao) });
      await tx.candidatoAnexo.createMany({ data: cast(anexosComArquivo) });
      await tx.quittePlacet.createMany({ data: cast(quitteComArquivo) });
      await tx.processoProgressao.createMany({
        data: cast(processosProgressao),
      });
      // Caixa de assinaturas: documento (FK User + Prancha) e assinantes
      for (const p of processosComArquivo) {
        await tx.processoDocumento.create({ data: castRow(p) });
      }
      await tx.processoAssinante.createMany({
        data: cast(
          processosAssinantes.filter((a) => idsProcessos.has(String(a.documentoId)))
        ),
      });
      await tx.atestadoRegularidade.createMany({ data: cast(atestadosComArquivo) });
      await tx.pedidoAfastamento.createMany({ data: cast(afastamentosComArquivo) });
      await tx.mutuaEntrega.createMany({ data: cast(mutuaComArquivo) });
      await tx.contatoEsmoler.createMany({ data: cast(contatosEsmoler) });
      await tx.fechamentoMes.createMany({ data: cast(fechamentosMes) });
      await tx.notification.createMany({ data: cast(notificacoes) });
      await tx.auditEvent.createMany({ data: cast(auditoria) });
      await tx.assistenteConversa.createMany({ data: cast(conversas) });
      await tx.assistenteMensagem.createMany({ data: cast(mensagens) });
    },
    { timeout: 120_000 }
  );

  return {
    ok: `Loja "${loja.name}" nº ${numero} restaurada: ${membros.length} membros, ${sessoes.length} sessões, ${atas.length} atas, ${invoices.length} mensalidades.`,
    avisos,
  };
}
