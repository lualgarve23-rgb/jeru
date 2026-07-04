"use server";

import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { signAta, signQuittePlacet } from "@/app/(app)/secretaria/actions";

type ActionResult = { error?: string; ok?: string } | undefined;

// Assinatura inline no dashboard: a re-digitação da senha é o ato formal
// de assinatura (loja.md §7C) — confere antes de delegar à action de negócio.
async function confirmPassword(password: string): Promise<string | null> {
  if (!password) return "Digite sua senha para confirmar a assinatura.";
  const user = await requireUser();
  const dbUser = await prisma.user.findUniqueOrThrow({
    where: { id: user.id },
    select: { passwordHash: true },
  });
  const valid = await bcrypt.compare(password, dbUser.passwordHash);
  return valid ? null : "Senha incorreta — assinatura não registrada.";
}

export async function signAtaInline(
  ataId: string,
  _prev: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  const error = await confirmPassword(String(formData.get("password") ?? ""));
  if (error) return { error };
  const result = await signAta(ataId);
  revalidatePath("/dashboard");
  return result;
}

export async function signQuittePlacetInline(
  placetId: string,
  _prev: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  const error = await confirmPassword(String(formData.get("password") ?? ""));
  if (error) return { error };
  const result = await signQuittePlacet(placetId);
  revalidatePath("/dashboard");
  return result;
}
