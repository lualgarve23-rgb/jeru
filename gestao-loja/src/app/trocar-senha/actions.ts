"use server";

import bcrypt from "bcryptjs";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { passwordRuleError } from "@/lib/password";

type ActionResult = { error?: string; ok?: string } | undefined;

// Troca obrigatória no primeiro acesso: valida a senha provisória e as regras
// mínimas, limpa a trava mustChangePassword e libera o acesso ao painel.
export async function forcePasswordChange(
  _prev: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  const user = await requireUser();

  const current = String(formData.get("current") ?? "");
  const next = String(formData.get("next") ?? "");
  const confirm = String(formData.get("confirm") ?? "");

  const ruleError = passwordRuleError(next);
  if (ruleError) return { error: ruleError };
  if (next !== confirm) {
    return { error: "A confirmação não confere com a nova senha." };
  }

  const dbUser = await prisma.user.findUniqueOrThrow({
    where: { id: user.id },
    select: { passwordHash: true, cpf: true },
  });
  // aceita a provisória com ou sem máscara (senha inicial = CPF)
  let valid = await bcrypt.compare(current.trim(), dbUser.passwordHash);
  if (!valid) {
    const digits = current.replace(/\D/g, "");
    if (digits) valid = await bcrypt.compare(digits, dbUser.passwordHash);
  }
  if (!valid) return { error: "Senha provisória incorreta." };

  if (next === current || next.replace(/\D/g, "") === dbUser.cpf) {
    return { error: "A nova senha não pode ser igual à provisória nem ao seu CPF." };
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash: await bcrypt.hash(next, 10), mustChangePassword: false },
  });

  redirect("/dashboard");
}
