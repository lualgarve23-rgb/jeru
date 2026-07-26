import { Parentesco } from "@prisma/client";
import { prisma } from "@/lib/prisma";

type ActionResult = { error?: string; ok?: string } | undefined;

// Valida e cria um familiar para o usuário indicado (dono já autorizado
// pelo chamador — Secretário/VM na ficha ou o próprio irmão no perfil).
export async function criarFamiliar(
  userId: string,
  formData: FormData
): Promise<ActionResult> {
  const name = String(formData.get("name") ?? "").trim();
  const parentesco = String(formData.get("parentesco") ?? "");
  const birthRaw = String(formData.get("birthDate") ?? "");
  if (!name) return { error: "Informe o nome do familiar." };
  if (!["CONJUGE", "FILHO", "DEPENDENTE"].includes(parentesco)) {
    return { error: "Parentesco inválido." };
  }
  // Data de nascimento é opcional; quando vier, precisa ser válida
  let birthDate: Date | null = null;
  if (birthRaw) {
    birthDate = new Date(birthRaw);
    if (isNaN(birthDate.getTime()) || birthDate > new Date()) {
      return { error: "Informe uma data de nascimento válida." };
    }
  }
  await prisma.familyMember.create({
    data: { userId, name, parentesco: parentesco as Parentesco, birthDate },
  });
  return { ok: "Familiar cadastrado." };
}

// Valida e atualiza um familiar (mesmas regras do cadastro); o chamador já
// garantiu que o familiar pertence a um usuário sob sua alçada
export async function atualizarFamiliar(
  familiarId: string,
  userId: string,
  formData: FormData
): Promise<ActionResult> {
  const name = String(formData.get("name") ?? "").trim();
  const parentesco = String(formData.get("parentesco") ?? "");
  const birthRaw = String(formData.get("birthDate") ?? "");
  if (!name) return { error: "Informe o nome do familiar." };
  if (!["CONJUGE", "FILHO", "DEPENDENTE"].includes(parentesco)) {
    return { error: "Parentesco inválido." };
  }
  let birthDate: Date | null = null;
  if (birthRaw) {
    birthDate = new Date(birthRaw);
    if (isNaN(birthDate.getTime()) || birthDate > new Date()) {
      return { error: "Informe uma data de nascimento válida." };
    }
  }
  const { count } = await prisma.familyMember.updateMany({
    where: { id: familiarId, userId },
    data: { name, parentesco: parentesco as Parentesco, birthDate },
  });
  return count ? { ok: "Familiar atualizado." } : { error: "Familiar não encontrado." };
}
