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
