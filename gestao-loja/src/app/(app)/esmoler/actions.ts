"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { auditar } from "@/lib/audit";

type ActionResult = { error?: string; ok?: string } | undefined;

// Registro de contato fraterno (Esmoler ou VM) com um irmão da própria loja
export async function registrarContatoEsmoler(
  userId: string,
  _prev: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  const user = await requireRole("ESMOLER", "VENERAVEL_MESTRE");
  const nota = String(formData.get("nota") ?? "").trim();
  if (nota.length < 3) return { error: "Descreva o contato em poucas palavras." };
  if (nota.length > 1000) return { error: "Nota muito longa — use até 1000 caracteres." };
  const irmao = await prisma.user.findFirst({
    where: { id: userId, lodgeId: user.lodgeId },
    select: { id: true, name: true },
  });
  if (!irmao) return { error: "Irmão não encontrado nesta loja." };
  await prisma.contatoEsmoler.create({
    data: { lodgeId: user.lodgeId, userId: irmao.id, autorId: user.id, nota },
  });
  await auditar({
    lodgeId: user.lodgeId,
    ator: { id: user.id, name: user.name },
    acao: "esmoler.contato",
    detalhes: { userId: irmao.id },
  });
  revalidatePath("/esmoler");
  return { ok: `Contato com ${irmao.name.split(" ")[0]} registrado.` };
}
