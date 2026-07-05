"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { grausInstrucaoPermitidos } from "@/lib/permissions";

type ActionResult = { error?: string; ok?: string } | undefined;

export async function registrarInstrucao(
  _prev: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  const user = await requireUser();
  const memberId = String(formData.get("memberId"));
  const date = new Date(String(formData.get("date")));
  const tema = String(formData.get("tema") ?? "").trim() || null;
  if (!memberId || isNaN(date.getTime())) {
    return { error: "Selecione o obreiro e a data da instrução." };
  }

  const member = await prisma.user.findUnique({
    where: { id: memberId, lodgeId: user.lodgeId },
    select: { degree: true, name: true },
  });
  if (!member) return { error: "Obreiro não encontrado." };
  const permitidos: string[] = grausInstrucaoPermitidos(user.role);
  if (!permitidos.includes(member.degree)) {
    return {
      error: `Sem permissão para registrar instrução de ${member.degree === "APRENDIZ" ? "Aprendiz (2º Vigilante)" : "Companheiro (1º Vigilante)"}.`,
    };
  }

  await prisma.instrucao.create({
    data: {
      lodgeId: user.lodgeId,
      userId: memberId,
      degree: member.degree,
      date,
      tema,
      registradaPorId: user.id,
    },
  });
  revalidatePath("/dashboard/instrucoes");
  return { ok: `Instrução de ${member.name} registrada.` };
}

export async function removerInstrucao(
  instrucaoId: string
): Promise<ActionResult> {
  const user = await requireUser();
  const instrucao = await prisma.instrucao.findUnique({
    where: { id: instrucaoId },
  });
  if (!instrucao || instrucao.lodgeId !== user.lodgeId) {
    return { error: "Instrução não encontrada." };
  }
  const podeGerir = ["VENERAVEL_MESTRE", "SECRETARIO"].includes(user.role);
  if (!podeGerir && instrucao.registradaPorId !== user.id) {
    return { error: "Somente quem registrou (ou VM/Secretário) pode remover." };
  }
  await prisma.instrucao.delete({ where: { id: instrucaoId } });
  revalidatePath("/dashboard/instrucoes");
  return { ok: "Instrução removida." };
}
