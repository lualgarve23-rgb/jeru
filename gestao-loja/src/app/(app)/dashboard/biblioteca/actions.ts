"use server";

import { revalidatePath } from "next/cache";
import { BibliotecaCategoria } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { canWriteSecretaria } from "@/lib/permissions";
import { extraiTexto } from "@/lib/extrai-texto";
import { GRAUS_ACERVO } from "@/lib/graus";

type ActionResult = { error?: string; ok?: string } | undefined;

// Limite por arquivo — o acervo fica no banco (independe do Drive)
const MAX_ARQUIVO_BYTES = 15 * 1024 * 1024; // 15 MB

async function requireSecretariaWriter() {
  const user = await requireUser();
  if (!canWriteSecretaria(user.role)) {
    throw new Error("Sem permissão de escrita na Secretaria.");
  }
  return user;
}

export async function uploadBibliotecaItem(
  _prev: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  const user = await requireSecretariaWriter();
  const titulo = String(formData.get("titulo") ?? "").trim();
  const file = formData.get("file") as File | null;
  if (!titulo || !file || file.size === 0) {
    return { error: "Informe o título e selecione um arquivo." };
  }
  if (file.size > MAX_ARQUIVO_BYTES) {
    return { error: "Arquivo muito grande — o limite é 15 MB." };
  }
  const categoria = String(formData.get("categoria"));
  if (!(categoria in BibliotecaCategoria)) {
    return { error: "Categoria inválida." };
  }
  const grauMinimo = String(formData.get("grauMinimo") ?? "APRENDIZ");
  if (!(GRAUS_ACERVO as readonly string[]).includes(grauMinimo)) {
    return { error: "Nível de acesso inválido." };
  }
  const arquivo = Buffer.from(await file.arrayBuffer());
  const mimeType = file.type || "application/octet-stream";
  await prisma.bibliotecaItem.create({
    data: {
      lodgeId: user.lodgeId,
      uploadedById: user.id,
      titulo,
      autor: String(formData.get("autor") ?? "").trim() || null,
      descricao: String(formData.get("descricao") ?? "").trim() || null,
      categoria: categoria as BibliotecaCategoria,
      grauMinimo: grauMinimo as never,
      arquivo,
      textoExtraido: await extraiTexto(arquivo, mimeType),
      mimeType,
      sizeBytes: file.size,
    },
  });
  revalidatePath("/dashboard/biblioteca");
  return { ok: "Item adicionado à biblioteca da Loja." };
}

// Troca o nível de acesso de um item já enviado (select inline na listagem)
export async function updateBibliotecaGrau(
  id: string,
  grau: string
): Promise<ActionResult> {
  const user = await requireSecretariaWriter();
  if (!(GRAUS_ACERVO as readonly string[]).includes(grau)) {
    return { error: "Nível de acesso inválido." };
  }
  await prisma.bibliotecaItem.update({
    where: { id, lodgeId: user.lodgeId },
    data: { grauMinimo: grau as never },
  });
  revalidatePath("/dashboard/biblioteca");
  return { ok: "Nível de acesso atualizado." };
}

export async function deleteBibliotecaItem(id: string): Promise<ActionResult> {
  const user = await requireSecretariaWriter();
  await prisma.bibliotecaItem.delete({
    where: { id, lodgeId: user.lodgeId },
  });
  revalidatePath("/dashboard/biblioteca");
  return { ok: "Item removido da biblioteca." };
}
