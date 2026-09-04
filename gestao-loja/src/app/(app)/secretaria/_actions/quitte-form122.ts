"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { aposEventoDaLoja } from "@/lib/apos-evento";
import { logError } from "@/lib/log";
import { auditar } from "@/lib/audit";
import { bloqueioGeracaoForm122, gerarForm122Pdf } from "@/lib/quitte-form122";
import { type ActionResult, requireSecretariaWriter } from "./_shared";

// Gera o Form. 122 preenchido (docx oficial → PDF) e grava como o anexo do
// Quitte Placet — mesmo efeito do upload manual (anexarFormularioQuittePlacet):
// substituir o formulário zera as assinaturas gov.br já colhidas.
export async function gerarFormulario122QuittePlacet(
  placetId: string
): Promise<ActionResult> {
  const user = await requireSecretariaWriter();
  const placet = await prisma.quittePlacet.findUnique({
    where: { id: placetId, lodgeId: user.lodgeId },
    select: { id: true, status: true, dataSessaoComunicacao: true, user: { select: { name: true } } },
  });
  if (!placet) return { error: "Quitte Placet não encontrado." };
  const bloqueio = bloqueioGeracaoForm122(placet);
  if (bloqueio) return { error: bloqueio };

  let pdf: Buffer;
  try {
    pdf = await gerarForm122Pdf(placet.id, user.lodgeId);
  } catch (e) {
    logError("quitte.form122", e, { lodgeId: user.lodgeId, placetId });
    return {
      error:
        "Não foi possível gerar o Form. 122 automaticamente — baixe o modelo preenchido e anexe em PDF.",
    };
  }

  await prisma.quittePlacet.update({
    where: { id: placet.id, lodgeId: user.lodgeId },
    data: {
      formularioArquivo: new Uint8Array(pdf),
      formularioNome: `form-122-quite-placet-${placet.id.slice(-6)}.pdf`,
      formularioMime: "application/pdf",
      formularioEnviadoAt: null,
      govbrPdf: null,
      signedBySecId: null,
      signedBySecAt: null,
      signedByOradorId: null,
      signedByOradorAt: null,
      signedByMasterId: null,
      signedByMasterAt: null,
    },
  });
  await auditar({
    lodgeId: user.lodgeId,
    ator: { id: user.id, name: user.name },
    acao: "quitte.form122.gerado",
    entidade: "QuittePlacet",
    entidadeId: placet.id,
  });
  aposEventoDaLoja(user.lodgeId);
  revalidatePath("/secretaria/quitte-placets");
  revalidatePath("/secretaria/processos");
  return { ok: `Form. 122 de ${placet.user.name} gerado e anexado em PDF.` };
}
