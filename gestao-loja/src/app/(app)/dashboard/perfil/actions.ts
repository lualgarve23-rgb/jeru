"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { criarFamiliar, atualizarFamiliar } from "@/lib/familiares";
import { saveUserImage, deleteMedia, validarImagem } from "@/lib/media";

type ActionResult = { error?: string; ok?: string } | undefined;

// Upload da foto do próprio usuário (disco local via lib/media, até 500 KB)
export async function updateMyPhoto(
  _prev: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  const user = await requireUser();
  const photo = formData.get("photo") as File | null;
  const v = validarImagem(photo, "A foto");
  if (v.vazio) return { error: "Selecione uma imagem." };
  if (v.error) return { error: v.error };
  const key = await saveUserImage(user.lodgeId, user.id, "photo", photo!);
  const antes = await prisma.user.findUnique({
    where: { id: user.id },
    select: { photoUrl: true },
  });
  await prisma.user.update({
    where: { id: user.id },
    data: { photoUrl: key },
  });
  await deleteMedia(antes?.photoUrl);
  revalidatePath("/dashboard/perfil");
  return { ok: "Foto atualizada." };
}

// ───────────── Aniversário e familiares (auto-serviço) ─────────────

export async function updateMyBirthDate(
  _prev: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  const user = await requireUser();
  const raw = String(formData.get("birthDate") ?? "");
  const birthDate = new Date(raw);
  if (!raw || isNaN(birthDate.getTime()) || birthDate > new Date()) {
    return { error: "Informe uma data de nascimento válida." };
  }
  await prisma.user.update({
    where: { id: user.id },
    data: { birthDate },
  });
  revalidatePath("/dashboard/perfil");
  return { ok: "Data de nascimento atualizada." };
}

export async function addMeuFamiliar(
  _prev: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  const user = await requireUser();
  const result = await criarFamiliar(user.id, formData);
  revalidatePath("/dashboard/perfil");
  return result;
}

export async function updateMeuFamiliar(
  familiarId: string,
  _prev: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  const user = await requireUser();
  const result = await atualizarFamiliar(familiarId, user.id, formData);
  revalidatePath("/dashboard/perfil");
  return result;
}

export async function removeMeuFamiliar(
  familiarId: string
): Promise<ActionResult> {
  const user = await requireUser();
  await prisma.familyMember.deleteMany({
    where: { id: familiarId, userId: user.id },
  });
  revalidatePath("/dashboard/perfil");
  return { ok: "Familiar removido." };
}

export async function removeMyPhoto(): Promise<ActionResult> {
  const user = await requireUser();
  const antes = await prisma.user.findUnique({
    where: { id: user.id },
    select: { photoUrl: true },
  });
  await prisma.user.update({
    where: { id: user.id },
    data: { photoUrl: null },
  });
  await deleteMedia(antes?.photoUrl);
  revalidatePath("/dashboard/perfil");
  return { ok: "Foto removida." };
}
