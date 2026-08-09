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

// LGPD (#15): o titular pede a exclusão dos seus dados; a Secretaria e o
// Venerável recebem a solicitação na central de notificações e atendem via
// "Anonimizar dados" na ficha do membro (após desligamento do quadro).
export async function solicitarExclusaoDados(
  _prev: ActionResult,
  _formData: FormData
): Promise<ActionResult> {
  const user = await requireUser();
  await prisma.notification.upsert({
    where: {
      lodgeId_sourceKey: {
        lodgeId: user.lodgeId,
        sourceKey: `lgpd-exclusao:${user.id}`,
      },
    },
    create: {
      lodgeId: user.lodgeId,
      type: "MISSING_DATA",
      sourceKey: `lgpd-exclusao:${user.id}`,
      title: `LGPD: ${user.name} solicitou exclusão dos dados pessoais`,
      description:
        "Atender em até 15 dias: concluir pendências do membro, desligá-lo do quadro (status Ex-membro) e usar \"Anonimizar dados (LGPD)\" na ficha.",
      link: `/secretaria/membros/${user.id}`,
    },
    update: { isRead: false, createdAt: new Date() },
  });
  const { auditar } = await import("@/lib/audit");
  await auditar({
    lodgeId: user.lodgeId,
    ator: user,
    acao: "lgpd.solicitar-exclusao",
    entidade: "User",
    entidadeId: user.id,
  });
  return {
    ok: "Solicitação registrada — a Secretaria fará o atendimento em até 15 dias.",
  };
}
