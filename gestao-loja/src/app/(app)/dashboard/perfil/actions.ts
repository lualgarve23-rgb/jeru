"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";

type ActionResult = { error?: string; ok?: string } | undefined;

// Upload da foto do próprio usuário (data URI, até 500 KB)
export async function updateMyPhoto(
  _prev: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  const user = await requireUser();
  const photo = formData.get("photo") as File | null;
  if (!photo || photo.size === 0) {
    return { error: "Selecione uma imagem." };
  }
  if (!photo.type.startsWith("image/")) {
    return { error: "A foto deve ser uma imagem (PNG, JPG...)." };
  }
  if (photo.size > 500_000) {
    return { error: "Foto muito grande — use uma imagem de até 500 KB." };
  }
  const buf = Buffer.from(await photo.arrayBuffer());
  await prisma.user.update({
    where: { id: user.id },
    data: { photoUrl: `data:${photo.type};base64,${buf.toString("base64")}` },
  });
  revalidatePath("/dashboard/perfil");
  return { ok: "Foto atualizada." };
}

export async function removeMyPhoto(): Promise<ActionResult> {
  const user = await requireUser();
  await prisma.user.update({
    where: { id: user.id },
    data: { photoUrl: null },
  });
  revalidatePath("/dashboard/perfil");
  return { ok: "Foto removida." };
}
