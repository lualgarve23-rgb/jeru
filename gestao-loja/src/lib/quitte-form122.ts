import { prisma } from "@/lib/prisma";
import { gerarFormularioPreenchido } from "@/lib/formularios-fill";
import { docxParaPdf } from "@/lib/docx-pdf";

/*
 * Form. 122 (Quite Placet) gerado pelo sistema — mesmo pipeline do Form. 116
 * do afastamento: o .docx oficial do GOB (public/formularios-gob) é preenchido
 * com Loja, Oriente, data da sessão de comunicação, obreiro e cargos atuais
 * (VM, Secretário e Orador — mapa em formularios-fill.ts) e convertido para
 * PDF pelo LibreOffice, pronto para as assinaturas gov.br.
 */

export const FORM_122 = "form-122-quite-placet.docx";

// Pré-condição do preenchimento (a data da sessão entra no formulário)
export function bloqueioGeracaoForm122(p: {
  status: string;
  dataSessaoComunicacao: Date | null;
}): string | null {
  if (p.status === "APROVADO") return "Quitte Placet já emitido — o formulário não pode ser trocado.";
  if (p.status === "NEGADO") return "Quitte Placet negado.";
  if (!p.dataSessaoComunicacao) {
    return "Registre em Processos a data da sessão em que o pedido foi comunicado à Loja — ela entra no Form. 122.";
  }
  return null;
}

export function dataIsoLocal(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export async function gerarForm122Pdf(placetId: string, lodgeId: string): Promise<Buffer> {
  const p = await prisma.quittePlacet.findUniqueOrThrow({
    where: { id: placetId, lodgeId },
    select: { userId: true, status: true, dataSessaoComunicacao: true },
  });
  const bloqueio = bloqueioGeracaoForm122(p);
  if (bloqueio) throw new Error(bloqueio);
  const docx = await gerarFormularioPreenchido(FORM_122, lodgeId, {
    obreiroId: p.userId,
    dataSessao: dataIsoLocal(p.dataSessaoComunicacao as Date),
  });
  return docxParaPdf(docx);
}
