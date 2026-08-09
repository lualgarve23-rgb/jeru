"use server";


import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { criarFamiliar, atualizarFamiliar } from "@/lib/familiares";
import { type ActionResult, requireSecretariaWriter } from "./_shared";

// ───────────── Familiares (cônjuge e filhos) ─────────────

export async function addFamiliar(
  memberId: string,
  _prev: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  const user = await requireSecretariaWriter();
  const member = await prisma.user.findUnique({
    where: { id: memberId, lodgeId: user.lodgeId },
    select: { id: true },
  });
  if (!member) return { error: "Membro não encontrado." };
  const result = await criarFamiliar(memberId, formData);
  revalidatePath(`/secretaria/membros/${memberId}`);
  return result;
}

export async function updateFamiliar(
  memberId: string,
  familiarId: string,
  _prev: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  const user = await requireSecretariaWriter();
  const member = await prisma.user.findUnique({
    where: { id: memberId, lodgeId: user.lodgeId },
    select: { id: true },
  });
  if (!member) return { error: "Membro não encontrado." };
  const result = await atualizarFamiliar(familiarId, memberId, formData);
  revalidatePath(`/secretaria/membros/${memberId}`);
  return result;
}

export async function removeFamiliar(
  memberId: string,
  familiarId: string
): Promise<ActionResult> {
  const user = await requireSecretariaWriter();
  await prisma.familyMember.deleteMany({
    where: { id: familiarId, user: { id: memberId, lodgeId: user.lodgeId } },
  });
  revalidatePath(`/secretaria/membros/${memberId}`);
  return { ok: "Familiar removido." };
}

