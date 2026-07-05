"use server";

import { revalidatePath } from "next/cache";
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
