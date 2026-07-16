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
  if (!["CONJUGE", "FILHO"].includes(parentesco)) {
    return { error: "Parentesco inválido." };
  }
  const birthDate = new Date(birthRaw);
  if (!birthRaw || isNaN(birthDate.getTime()) || birthDate > new Date()) {
    return { error: "Informe uma data de nascimento válida." };
  }
  await prisma.familyMember.create({
    data: { userId, name, parentesco: parentesco as Parentesco, birthDate },
  });
  return { ok: "Familiar cadastrado." };
}
