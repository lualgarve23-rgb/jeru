// Helpers partilhados pelos módulos de _actions/ — NÃO é "use server":
// aqui podem viver types, constantes e funções não-action.

import { prisma } from "@/lib/prisma";
import { requireUser, requireRole } from "@/lib/session";
import { canWriteSecretaria } from "@/lib/permissions";

export type ActionResult = { error?: string; ok?: string } | undefined;

export async function requireSecretariaWriter() {
  const user = await requireUser();
  if (!canWriteSecretaria(user.role)) {
    throw new Error("Sem permissão de escrita na Secretaria.");
  }
  return user;
}

const ANEXO_MAX_BYTES = 15_000_000;
const ANEXO_TIPOS = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
];

export function validarAnexo(file: File | null): { error: string } | { file: File } {
  if (!file || file.size === 0) return { error: "Selecione o arquivo preenchido." };
  if (!ANEXO_TIPOS.includes(file.type)) {
    return { error: "Envie o formulário em PDF, DOC/DOCX, JPG ou PNG." };
  }
  if (file.size > ANEXO_MAX_BYTES) {
    return { error: "Arquivo muito grande — use até 15 MB." };
  }
  return { file };
}

export async function gravarAnexoCandidato(
  processoId: string,
  file: File,
  enviadoPor: string
) {
  await prisma.candidatoAnexo.create({
    data: {
      processoId,
      nome: file.name.slice(0, 200),
      mimeType: file.type,
      sizeBytes: file.size,
      arquivo: Buffer.from(await file.arrayBuffer()),
      enviadoPor,
    },
  });
}

