import { prisma } from "@/lib/prisma";
import { gerarAtaPdf } from "@/lib/ata-pdf";
import { resolveParaDataUri } from "@/lib/media";
import { gerarFormularioPreenchido } from "@/lib/formularios-fill";
import { docxParaPdf } from "@/lib/docx-pdf";
import { arquivarVersaoFinalNoDrive, slugNome } from "@/lib/google-drive";

/*
 * Pedido de Afastamento (licença do quadro de obreiros — Form. 116 do GOB).
 *
 * Etapas:
 *  1. O irmão preenche motivo/dias e o sistema gera o REQUERIMENTO em PDF;
 *     ele assina com a PRÓPRIA conta gov.br (OAuth ou portal assinador.iti.br)
 *     → status SOLICITADO.
 *  2. A Loja delibera em sessão; a Secretaria registra a data da sessão e o
 *     artigo do Regulamento (67/68) e o sistema gera o Form. 116 em PDF
 *     → EM_ASSINATURA.
 *  3. Assinaturas gov.br do Form. 116: Secretário primeiro, Venerável Mestre
 *     por último (o VM sela o documento) → ASSINADO.
 *  4. Envio à Guarda dos Selos (Form. 116 + requerimento) e o irmão passa a
 *     LICENCIADO.
 */

export const FORM_116 = "form-116-pedido-licenca.docx";
export const ARTIGOS_AFASTAMENTO = ["67", "68"] as const;
export const DIAS_MAX_AFASTAMENTO = 365;

export type AfastamentoAssinaturas = {
  signedBySecAt: Date | null;
  signedByMasterAt: Date | null;
};

// Ordem de governança das assinaturas do Form. 116: Secretário → VM
export function ordemAssinaturaAfastamento(role: string, p: AfastamentoAssinaturas) {
  if (role === "SECRETARIO") {
    return {
      jaAssinou: !!p.signedBySecAt,
      aguardando: null as string | null,
      ultimaAssinatura: !!p.signedByMasterAt,
    };
  }
  return {
    jaAssinou: !!p.signedByMasterAt,
    aguardando: p.signedBySecAt ? null : "Secretário",
    ultimaAssinatura: !!p.signedBySecAt,
  };
}

export function camposAssinaturaAfastamento(role: string, userId: string) {
  const agora = new Date();
  return role === "SECRETARIO"
    ? { signedBySecId: userId, signedBySecAt: agora }
    : { signedByMasterId: userId, signedByMasterAt: agora };
}

export function cargoAssinanteAfastamento(role: string) {
  return role === "SECRETARIO" ? "Secretário" : "Venerável Mestre";
}

// Etapas da linha do tempo vista pelo irmão (e na caixa de assinaturas)
export function etapasAfastamento(p: {
  status: string;
  requerimentoSignedAt: Date | null;
  dataSessao: Date | null;
  signedBySecAt: Date | null;
  signedByMasterAt: Date | null;
  enviadoAt: Date | null;
  updatedAt?: Date;
}) {
  const indeferido = p.status === "INDEFERIDO";
  return [
    { cargo: "Minha assinatura gov.br", at: p.requerimentoSignedAt },
    {
      cargo: "Deliberação em sessão",
      at: p.dataSessao,
      feito: !!p.dataSessao || indeferido,
    },
    { cargo: "Secretário", at: p.signedBySecAt },
    { cargo: "Venerável Mestre", at: p.signedByMasterAt },
    { cargo: "Envio à Guarda dos Selos", at: p.enviadoAt },
  ];
}

// Com quem o pedido está pendente (texto do badge do solicitante)
export function pendenteComAfastamento(p: {
  status: string;
  signedBySecAt: Date | null;
  enviadoAt: Date | null;
}) {
  switch (p.status) {
    case "AGUARDANDO_OBREIRO":
      return "Aguardando a sua assinatura gov.br";
    case "SOLICITADO":
      return "Pendente com: Secretaria (deliberação em sessão)";
    case "EM_ASSINATURA":
      return `Pendente com: ${p.signedBySecAt ? "Venerável Mestre" : "Secretário"}`;
    case "ASSINADO":
      return p.enviadoAt ? "Licença comunicada à Guarda dos Selos" : "Pendente com: Secretaria (envio)";
    default:
      return "Indeferido";
  }
}

export function statusAfastamentoLabel(status: string) {
  return (
    {
      AGUARDANDO_OBREIRO: "Aguardando assinatura do irmão",
      SOLICITADO: "Aguardando deliberação",
      EM_ASSINATURA: "Form. 116 em assinatura",
      ASSINADO: "Form. 116 assinado",
      INDEFERIDO: "Indeferido",
    }[status] ?? status
  );
}

export function textoRequerimento(dados: {
  nome: string;
  cim: string;
  grau?: string | null;
  lodgeName: string;
  lodgeNumber: string;
  oriente?: string | null;
  dias: number;
  motivo: string;
  dataInicio: Date | null;
}) {
  const hoje = new Date().toLocaleDateString("pt-BR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  const inicio = dados.dataInicio
    ? `, a partir de ${dados.dataInicio.toLocaleDateString("pt-BR")}`
    : "";
  return (
    `Ao Venerável Mestre da ${dados.lodgeName} nº ${dados.lodgeNumber}.\n\n` +
    `Eu, ${dados.nome}, CIM ${dados.cim}, membro do quadro de obreiros desta ` +
    `Augusta Loja, venho respeitosamente requerer LICENÇA do quadro de obreiros ` +
    `pelo prazo de ${dados.dias} dias${inicio}, nos termos do Regulamento Geral ` +
    `da Federação do Grande Oriente do Brasil, pelo motivo a seguir exposto:\n\n` +
    `${dados.motivo.trim()}\n\n` +
    `Comprometo-me a manter em dia as minhas obrigações e a comunicar a esta ` +
    `Loja o meu retorno às atividades.\n\n` +
    `Nestes termos, peço deferimento.\n\n` +
    `Oriente de ${dados.oriente ?? "____"}, ${hoje} da E∴V∴`
  );
}

// PDF do requerimento do irmão (mesmo visual institucional das atas), com o
// campo de assinatura do próprio requerente
export async function gerarRequerimentoPdf(pedidoId: string, lodgeId: string) {
  const p = await prisma.pedidoAfastamento.findUniqueOrThrow({
    where: { id: pedidoId, lodgeId },
    include: {
      lodge: true,
      user: { select: { name: true, cim: true, degree: true, signatureUrl: true } },
    },
  });
  const assinatura = await resolveParaDataUri(p.user.signatureUrl);
  const pdf = await gerarAtaPdf({
    lodgeName: p.lodge.name,
    lodgeNumber: p.lodge.number,
    number: 0,
    titulo: "REQUERIMENTO DE LICENÇA DO QUADRO DE OBREIROS",
    content: textoRequerimento({
      nome: p.user.name,
      cim: p.user.cim,
      grau: p.user.degree,
      lodgeName: p.lodge.name,
      lodgeNumber: p.lodge.number,
      oriente: p.lodge.oriente,
      dias: p.dias,
      motivo: p.motivo,
      dataInicio: p.dataInicio,
    }),
    logoUrl: p.lodge.logoUrl,
    cabecalho: p.lodge.ataCabecalho,
    address: p.lodge.address,
    divisa: p.lodge.ataDivisa,
    signers: [
      {
        name: p.user.name,
        cargo: `Obreiro requerente · CIM ${p.user.cim}`,
        signedAt: p.requerimentoSignedAt,
        signatureUrl: assinatura,
      },
    ],
  });
  return { pedido: p, pdf };
}

// Form. 116 preenchido (Loja, sessão, dias, obreiro, artigo, Secretário) e
// convertido para PDF — é este arquivo que recebe as assinaturas gov.br
export async function gerarForm116Pdf(pedidoId: string, lodgeId: string) {
  const p = await prisma.pedidoAfastamento.findUniqueOrThrow({
    where: { id: pedidoId, lodgeId },
    select: { userId: true, dias: true, dataSessao: true, artigo: true },
  });
  if (!p.dataSessao) throw new Error("Data da sessão não registrada.");
  const d = p.dataSessao;
  const dataSessao = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const docx = await gerarFormularioPreenchido(FORM_116, lodgeId, {
    obreiroId: p.userId,
    dataSessao,
    dias: p.dias,
    dropdown: p.artigo ?? undefined,
  });
  return docxParaPdf(docx);
}

// Pré-condições da assinatura do Form. 116 pelos cargos
export function bloqueioAssinaturaAfastamento(p: {
  status: string;
  formularioPdf: Uint8Array | Buffer | null;
}): string | null {
  if (p.status === "ASSINADO" || p.status === "INDEFERIDO") {
    return "Pedido já encerrado.";
  }
  if (p.status === "AGUARDANDO_OBREIRO") {
    return "O irmão ainda não assinou o requerimento com a conta gov.br dele.";
  }
  if (p.status === "SOLICITADO" || !p.formularioPdf) {
    return "Registre a sessão que deliberou a licença (data e artigo) para gerar o Form. 116 antes das assinaturas.";
  }
  return null;
}

// Versão final do Form. 116 (assinado pelos dois cargos) no Drive da Loja
export async function arquivarAfastamentoNoDrive(
  lodgeId: string,
  uploadedById: string,
  pedidoId: string,
  nomeMembro: string,
  pdf: Buffer
): Promise<string> {
  const r = await arquivarVersaoFinalNoDrive({
    lodgeId,
    uploadedById,
    fileName: `form-116-afastamento-${slugNome(nomeMembro)}-${pedidoId.slice(-6)}-assinado-govbr.pdf`,
    title: `Form. 116 — Pedido de Afastamento — ${nomeMembro} (assinado gov.br)`,
    pdf,
  });
  if (r.driveFileId) {
    await prisma.pedidoAfastamento.update({
      where: { id: pedidoId, lodgeId },
      data: { driveFileId: r.driveFileId },
    });
  }
  return r.aviso;
}
