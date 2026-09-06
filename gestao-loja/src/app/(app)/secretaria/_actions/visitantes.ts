"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { auditar } from "@/lib/audit";
import { normalizarTelefone } from "@/lib/visitantes";
import { requireSecretariaWriter, type ActionResult } from "./_shared";

const campo = (fd: FormData, k: string, max = 200) => {
  const s = String(fd.get(k) ?? "").trim().replace(/\s+/g, " ");
  return s ? s.slice(0, max) : null;
};

function lerFicha(formData: FormData) {
  const nome = campo(formData, "nome");
  if (!nome) return { error: "Informe o nome do visitante." } as const;
  const email = campo(formData, "email")?.toLowerCase() ?? null;
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { error: "E-mail inválido." } as const;
  }
  return {
    data: {
      nome,
      cim: campo(formData, "cim", 40),
      email,
      telefone: normalizarTelefone(formData.get("telefone")),
      lojaOrigem: campo(formData, "lojaOrigem"),
      potencia: campo(formData, "potencia", 80),
      oriente: campo(formData, "oriente", 120),
      grau: campo(formData, "grau", 60),
      cargo: campo(formData, "cargo", 80),
      observacoes: campo(formData, "observacoes", 2000),
    },
  } as const;
}

// Cadastro manual pela Secretaria (visitante anunciado, sem check-in ainda)
export async function criarVisitante(
  _prev: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  const user = await requireSecretariaWriter();
  const lido = lerFicha(formData);
  if ("error" in lido) return { error: lido.error };
  const v = await prisma.visitante.create({
    data: { lodgeId: user.lodgeId, ...lido.data },
    select: { id: true },
  });
  await auditar({
    lodgeId: user.lodgeId,
    ator: user,
    acao: "visitante.criar",
    entidade: "Visitante",
    entidadeId: v.id,
    detalhes: { nome: lido.data.nome, lojaOrigem: lido.data.lojaOrigem },
  });
  revalidatePath("/secretaria/visitantes");
  redirect(`/secretaria/visitantes/${v.id}`);
}

export async function atualizarVisitante(
  visitanteId: string,
  _prev: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  const user = await requireSecretariaWriter();
  const atual = await prisma.visitante.findUnique({
    where: { id: visitanteId, lodgeId: user.lodgeId },
    select: { id: true },
  });
  if (!atual) return { error: "Visitante não encontrado." };
  const lido = lerFicha(formData);
  if ("error" in lido) return { error: lido.error };
  await prisma.visitante.update({ where: { id: visitanteId }, data: lido.data });
  await auditar({
    lodgeId: user.lodgeId,
    ator: user,
    acao: "visitante.editar",
    entidade: "Visitante",
    entidadeId: visitanteId,
    detalhes: { nome: lido.data.nome },
  });
  revalidatePath("/secretaria/visitantes");
  revalidatePath(`/secretaria/visitantes/${visitanteId}`);
  return { ok: "Ficha do visitante atualizada." };
}

// Mescla duplicidades: as presenças do registro "duplicado" passam para o
// mantido, campos vazios do mantido são completados e o duplicado é excluído.
export async function mesclarVisitantes(
  manterId: string,
  _prev: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  const user = await requireSecretariaWriter();
  const duplicadoId = String(formData.get("duplicadoId") ?? "");
  if (!duplicadoId) return { error: "Selecione o cadastro duplicado." };
  if (duplicadoId === manterId) return { error: "Escolha um cadastro diferente." };
  const [manter, duplicado] = await Promise.all([
    prisma.visitante.findUnique({ where: { id: manterId, lodgeId: user.lodgeId } }),
    prisma.visitante.findUnique({ where: { id: duplicadoId, lodgeId: user.lodgeId } }),
  ]);
  if (!manter || !duplicado) return { error: "Visitante não encontrado." };
  const completa: Record<string, string | null> = {};
  for (const k of [
    "cim",
    "email",
    "telefone",
    "lojaOrigem",
    "potencia",
    "oriente",
    "grau",
    "cargo",
  ] as const) {
    if (!manter[k] && duplicado[k]) completa[k] = duplicado[k];
  }
  if (duplicado.observacoes) {
    completa.observacoes = [manter.observacoes, duplicado.observacoes]
      .filter(Boolean)
      .join("\n");
  }
  await prisma.$transaction([
    prisma.attendance.updateMany({
      where: { visitanteId: duplicadoId, lodgeId: user.lodgeId },
      data: { visitanteId: manterId },
    }),
    prisma.visitante.update({ where: { id: manterId }, data: completa }),
    prisma.visitante.delete({ where: { id: duplicadoId } }),
  ]);
  await auditar({
    lodgeId: user.lodgeId,
    ator: user,
    acao: "visitante.mesclar",
    entidade: "Visitante",
    entidadeId: manterId,
    detalhes: { mantido: manter.nome, excluido: duplicado.nome, duplicadoId },
  });
  revalidatePath("/secretaria/visitantes");
  revalidatePath(`/secretaria/visitantes/${manterId}`);
  return { ok: `Cadastros mesclados: "${duplicado.nome}" foi incorporado a "${manter.nome}".` };
}

// Exclui a ficha; as presenças no Livro ficam (só perdem o vínculo)
export async function excluirVisitante(visitanteId: string): Promise<ActionResult> {
  const user = await requireSecretariaWriter();
  const v = await prisma.visitante.findUnique({
    where: { id: visitanteId, lodgeId: user.lodgeId },
    select: { nome: true },
  });
  if (!v) return { error: "Visitante não encontrado." };
  await prisma.visitante.delete({ where: { id: visitanteId } });
  await auditar({
    lodgeId: user.lodgeId,
    ator: user,
    acao: "visitante.excluir",
    entidade: "Visitante",
    entidadeId: visitanteId,
    detalhes: { nome: v.nome },
  });
  revalidatePath("/secretaria/visitantes");
  redirect("/secretaria/visitantes");
}
