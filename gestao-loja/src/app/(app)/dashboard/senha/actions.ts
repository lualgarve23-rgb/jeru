"use server";

import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";

type ActionResult = { error?: string; ok?: string } | undefined;

export async function changePassword(
  _prev: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  const user = await requireUser();

  const current = String(formData.get("current") ?? "");
  const next = String(formData.get("next") ?? "");
  const confirm = String(formData.get("confirm") ?? "");

  if (next.length < 8) {
    return { error: "A nova senha deve ter pelo menos 8 caracteres." };
  }
  if (next !== confirm) {
    return { error: "A confirmação não confere com a nova senha." };
  }

  const dbUser = await prisma.user.findUniqueOrThrow({
    where: { id: user.id },
    select: { passwordHash: true, cpf: true },
  });
  const valid = await bcrypt.compare(current, dbUser.passwordHash);
  if (!valid) {
    return { error: "Senha atual incorreta." };
  }
  if (next === current || next.replace(/\D/g, "") === dbUser.cpf.replace(/\D/g, "")) {
    return { error: "A nova senha não pode ser igual à atual nem ao seu CPF." };
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash: await bcrypt.hash(next, 10) },
  });

  return { ok: "Senha alterada com sucesso." };
}
