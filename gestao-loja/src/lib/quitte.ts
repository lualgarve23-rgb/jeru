import { prisma } from "@/lib/prisma";
import { arquivarVersaoFinalNoDrive, slugNome } from "@/lib/google-drive";
// Quitte Placet — regras de assinatura gov.br.
// Ordem de governança: Secretário assina primeiro e o Venerável Mestre por
// último (padrão de todos os documentos oficiais: o VM sela o documento).

export type QuitteAssinaturas = {
  signedBySecAt: Date | null;
  signedByMasterAt: Date | null;
};

export function ordemAssinaturaQuitte(role: string, p: QuitteAssinaturas) {
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

export function camposAssinaturaQuitte(role: string, userId: string) {
  const agora = new Date();
  return role === "SECRETARIO"
    ? { signedBySecId: userId, signedBySecAt: agora }
    : { signedByMasterId: userId, signedByMasterAt: agora };
}

export function cargoAssinanteQuitte(role: string) {
  return role === "SECRETARIO" ? "Secretário" : "Venerável Mestre";
}

// Pré-condições comuns às assinaturas (OAuth gov.br e upload do portal ITI).
// Retorna a mensagem de bloqueio, ou null quando o placet pode ser assinado.
export function bloqueioAssinaturaQuitte(p: {
  status: string;
  quitacaoFinanceira: boolean;
  cartaNome: string | null;
  formularioNome: string | null;
  formularioMime: string | null;
  govbrPdf: Uint8Array | Buffer | null;
}): string | null {
  if (p.status === "APROVADO" || p.status === "NEGADO") {
    return "Quitte Placet já encerrado.";
  }
  if (!p.cartaNome) {
    return "Falta a carta de próprio punho do irmão — as assinaturas ficam bloqueadas até ela ser anexada ao pedido.";
  }
  if (!p.quitacaoFinanceira) {
    return "Trava financeira: a Tesouraria ainda não confirmou o Nada Consta.";
  }
  if (!p.formularioNome) {
    return "Anexe o Form. 122 preenchido (em PDF) antes das assinaturas gov.br.";
  }
  if (!p.govbrPdf && p.formularioMime !== "application/pdf") {
    return "O Form. 122 anexado precisa estar em PDF para receber as assinaturas gov.br — substitua o anexo.";
  }
  return null;
}

// Versão final do Quitte Placet (assinado pelos dois cargos) no Drive da Loja.
export async function arquivarQuitteNoDrive(
  lodgeId: string,
  uploadedById: string,
  placetId: string,
  nomeMembro: string,
  pdf: Buffer
): Promise<string> {
  const r = await arquivarVersaoFinalNoDrive({
    lodgeId,
    uploadedById,
    fileName: `quitte-placet-${slugNome(nomeMembro)}-${placetId.slice(-6)}-assinado-govbr.pdf`,
    title: `Quitte Placet — ${nomeMembro} (assinado gov.br)`,
    pdf,
  });
  if (r.driveFileId) {
    await prisma.quittePlacet.update({
      where: { id: placetId, lodgeId },
      data: { driveFileId: r.driveFileId },
    });
  }
  return r.aviso;
}
