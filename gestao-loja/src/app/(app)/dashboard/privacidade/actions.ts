"use server";

import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { revalidatePath } from "next/cache";

type ActionResult = { error?: string; ok?: string } | undefined;

// Painel de Privacidade (LGPD): cada obreiro controla a visibilidade
// dos próprios dados de contato para os demais membros da loja.
export async function updatePrivacy(
  _prev: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  const user = await requireUser();

  const showEmail = formData.get("showEmail") === "on";
  const showPhone = formData.get("showPhone") === "on";
  const showAddress = formData.get("showAddress") === "on";
  const showBirthDate = formData.get("showBirthDate") === "on";

  await prisma.user.update({
    where: { id: user.id },
    data: {
      showEmail,
      showPhone,
      showAddress,
      showBirthDate,
      isDataPublic: showEmail || showPhone || showAddress || showBirthDate,
    },
  });

  revalidatePath("/dashboard/privacidade");
  revalidatePath("/secretaria/membros");
  return { ok: "Preferências de privacidade atualizadas." };
}
