"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";

type ActionResult = { error?: string; ok?: string } | undefined;

export async function disconnectGoogle(): Promise<ActionResult> {
  const user = await requireRole("VENERAVEL_MESTRE", "SECRETARIO");
  await prisma.lodge.update({
    where: { id: user.lodgeId },
    data: { googleRefreshToken: null, googleEmail: null },
  });
  revalidatePath("/dashboard/loja");
  return { ok: "Conta Google desconectada." };
}

// Frequência mínima (%) exigida para sair de "Instrução e Frequência"
// no Kanban de Progressões — parametrizada por loja
export async function updateMinFreqProgressao(
  _prev: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  const user = await requireRole("VENERAVEL_MESTRE", "SECRETARIO");
  const value = Number(formData.get("minFreq"));
  if (!Number.isInteger(value) || value < 0 || value > 100) {
    return { error: "Informe um percentual inteiro entre 0 e 100." };
  }
  await prisma.lodge.update({
    where: { id: user.lodgeId },
    data: { minFreqProgressao: value },
  });
  revalidatePath("/dashboard/loja");
  revalidatePath("/secretaria/progressoes");
  return { ok: `Frequência mínima definida em ${value}%.` };
}

// Template personalizado do Certificado de Visita (PPTX com os marcadores
// <<NOME DO IRMÃO>>, <<SESSAO>> e opcionalmente <<EMAIL>> e <<VENERAVEL>>).
// O upload extrai as posições e renderiza o fundo em PDF via LibreOffice.
export async function updateCertTemplate(
  _prev: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  const user = await requireRole("VENERAVEL_MESTRE", "SECRETARIO");
  const file = formData.get("template") as File | null;
  if (!file || file.size === 0) {
    return { error: "Selecione o arquivo PPTX do certificado." };
  }
  if (!file.name.toLowerCase().endsWith(".pptx")) {
    return { error: "O template deve ser um arquivo .pptx." };
  }
  if (file.size > 15_000_000) {
    return { error: "Template muito grande — use um PPTX de até 15 MB." };
  }
  const { extrairLayoutDoPptx, gerarFundoDoPptx } = await import(
    "@/lib/certificado"
  );
  const pptx = Buffer.from(await file.arrayBuffer());
  try {
    const layout = await extrairLayoutDoPptx(pptx);
    const fundo = await gerarFundoDoPptx(pptx);
    await prisma.lodge.update({
      where: { id: user.lodgeId },
      data: {
        certFundoPdf: new Uint8Array(fundo),
        certLayout: layout as Prisma.InputJsonValue,
      },
    });
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Falha ao processar o template." };
  }
  revalidatePath("/dashboard/loja");
  return {
    ok: "Template do Certificado de Visita atualizado — confira o preview.",
  };
}

// Volta ao template padrão do sistema
export async function removeCertTemplate(): Promise<ActionResult> {
  const user = await requireRole("VENERAVEL_MESTRE", "SECRETARIO");
  await prisma.lodge.update({
    where: { id: user.lodgeId },
    data: { certFundoPdf: null, certLayout: Prisma.DbNull },
  });
  revalidatePath("/dashboard/loja");
  return { ok: "Template padrão restaurado." };
}

// Nº de capitações vencidas que torna o membro IRREGULAR automaticamente
export async function updateLimiteInadimplencia(
  _prev: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  const user = await requireRole("VENERAVEL_MESTRE", "SECRETARIO", "TESOUREIRO");
  const value = Number(formData.get("limite"));
  if (!Number.isInteger(value) || value < 1 || value > 24) {
    return { error: "Informe um número inteiro entre 1 e 24." };
  }
  await prisma.lodge.update({
    where: { id: user.lodgeId },
    data: { limiteInadimplencia: value },
  });
  revalidatePath("/dashboard/loja");
  revalidatePath("/tesouraria/mensalidades");
  return { ok: `Membros ficam irregulares com ${value} capitação(ões) vencida(s).` };
}
