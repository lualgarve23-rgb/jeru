"use server";


import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  Degree,
  Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { auditar } from "@/lib/audit";
import { validarProgressao } from "@/lib/intersticio";
import { mudarStatusMembro } from "@/lib/status-membro";
import type { MemberStatus } from "@prisma/client";
import { saveUserImage, deleteMedia, validarImagem } from "@/lib/media";
import { type ActionResult, requireSecretariaWriter } from "./_shared";

// ───────────────────────── Membros ─────────────────────────

export async function createMember(
  _prev: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  const user = await requireSecretariaWriter();
  const data = {
    cim: String(formData.get("cim")).trim(),
    cpf: String(formData.get("cpf")).replace(/\D/g, ""),
    name: String(formData.get("name")).trim(),
    email: String(formData.get("email")).trim().toLowerCase(),
    phone: (formData.get("phone") as string) || null,
    profession: (formData.get("profession") as string) || null,
    degree: formData.get("degree") as Degree,
    filiado: formData.get("filiado") === "on",
    initiationDate: formData.get("initiationDate")
      ? new Date(String(formData.get("initiationDate")))
      : null,
  };
  if (!data.cim || !data.cpf || !data.name || !data.email) {
    return { error: "Preencha CIM, CPF, nome e e-mail." };
  }
  // Senha inicial aleatória (nunca o CPF): vai por e-mail da loja quando
  // possível; senão é mostrada uma única vez ao Secretário para repassar.
  // O sistema força a troca no primeiro acesso.
  const { criarSenhaInicial } = await import("@/lib/senha-inicial");
  const { passwordHash, senhaParaRepassar } = await criarSenhaInicial({
    lodgeId: user.lodgeId,
    nome: data.name,
    email: data.email,
    cim: data.cim,
  });
  try {
    const member = await prisma.user.create({
      data: { ...data, lodgeId: user.lodgeId, passwordHash, mustChangePassword: true },
    });
    if (data.initiationDate) {
      await prisma.degreeHistory.create({
        data: {
          lodgeId: user.lodgeId,
          userId: member.id,
          degree: data.degree,
          date: data.initiationDate,
        },
      });
    }
    await auditar({
      lodgeId: user.lodgeId,
      ator: user,
      acao: "membro.criar",
      entidade: "User",
      entidadeId: member.id,
      detalhes: { cim: data.cim, nome: data.name, grau: data.degree },
    });
  } catch {
    return { error: "CIM, CPF ou e-mail já cadastrado." };
  }
  revalidatePath("/secretaria/membros");
  if (senhaParaRepassar) {
    // Sem e-mail entregável: a senha aparece aqui uma única vez
    return {
      ok:
        `Membro cadastrado. Não foi possível enviar a senha por e-mail — ` +
        `senha inicial: ${senhaParaRepassar} (anote e repasse ao irmão; ` +
        `ela não será mostrada de novo).`,
    };
  }
  redirect("/secretaria/membros");
}

export async function updateMember(
  memberId: string,
  _prev: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  const user = await requireSecretariaWriter();

  // Imagem de assinatura (VM, Secretário e Orador) — disco local, até 500 KB
  const sigFile = formData.get("signature") as File | null;
  const sigCheck = validarImagem(sigFile, "A assinatura");
  if (sigCheck.error) return { error: sigCheck.error };
  let signatureUrl: string | undefined;
  let assinaturaAntiga: string | null = null;
  if (sigCheck.ok) {
    signatureUrl = await saveUserImage(
      user.lodgeId,
      memberId,
      "signature",
      sigFile!
    );
    assinaturaAntiga =
      (
        await prisma.user.findUnique({
          where: { id: memberId, lodgeId: user.lodgeId },
          select: { signatureUrl: true },
        })
      )?.signatureUrl ?? null;
  }

  // Mudança de situação passa pelo ponto central (cancela assinatura Asaas,
  // cancela capitações futuras, marca status manual, audita e notifica)
  const novoStatus = String(formData.get("status") ?? "") as MemberStatus;
  if (!["ATIVO", "IRREGULAR", "LICENCIADO", "EX_MEMBRO"].includes(novoStatus)) {
    return { error: "Situação inválida." };
  }
  await mudarStatusMembro(prisma, {
    userId: memberId,
    lodgeId: user.lodgeId,
    novoStatus,
    motivo: "alteração manual pela Secretaria",
    porUserId: user.id,
    porNome: user.name,
  });

  await prisma.user.update({
    // filtro composto garante o isolamento por tenant
    where: { id: memberId, lodgeId: user.lodgeId },
    data: {
      name: String(formData.get("name")).trim(),
      email: String(formData.get("email")).trim().toLowerCase(),
      phone: (formData.get("phone") as string) || null,
      profession: (formData.get("profession") as string) || null,
      birthDate: formData.get("birthDate")
        ? new Date(String(formData.get("birthDate")))
        : null,
      address: (formData.get("address") as string) || null,
      rg: (formData.get("rg") as string) || null,
      naturalidade: (formData.get("naturalidade") as string) || null,
      estadoCivil: (formData.get("estadoCivil") as string) || null,
      conjuge: (formData.get("conjuge") as string) || null,
      nomePai: (formData.get("nomePai") as string) || null,
      nomeMae: (formData.get("nomeMae") as string) || null,
      tipoSanguineo: (formData.get("tipoSanguineo") as string) || null,
      filiado: formData.get("filiado") === "on",
      ...(signatureUrl ? { signatureUrl } : {}),
    },
  });
  if (signatureUrl) await deleteMedia(assinaturaAntiga);
  await auditar({
    lodgeId: user.lodgeId,
    ator: user,
    acao: "membro.editar",
    entidade: "User",
    entidadeId: memberId,
    detalhes: {
      nome: String(formData.get("name")).trim(),
      status: String(formData.get("status")),
      assinaturaAlterada: !!signatureUrl,
    },
  });
  revalidatePath(`/secretaria/membros/${memberId}`);
  return { ok: "Dados atualizados." };
}

// Elevação/Exaltação com trava de interstício
export async function elevateDegree(
  memberId: string,
  _prev: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  const user = await requireSecretariaWriter();
  const newDegree = formData.get("degree") as Degree;
  const date = new Date(String(formData.get("date")));

  const member = await prisma.user.findUniqueOrThrow({
    where: { id: memberId, lodgeId: user.lodgeId },
    include: { degreeHistory: { orderBy: { date: "desc" }, take: 1 } },
  });

  const lastDate =
    member.degreeHistory[0]?.date ?? member.initiationDate ?? null;
  const valida = validarProgressao(member.degree, newDegree, lastDate, date);
  if ("error" in valida) return valida;

  await prisma.$transaction([
    prisma.user.update({
      where: { id: memberId, lodgeId: user.lodgeId },
      data: { degree: newDegree },
    }),
    prisma.degreeHistory.create({
      data: { lodgeId: user.lodgeId, userId: memberId, degree: newDegree, date },
    }),
  ]);
  await auditar({
    lodgeId: user.lodgeId,
    ator: user,
    acao: "membro.grau",
    entidade: "User",
    entidadeId: memberId,
    detalhes: { de: member.degree, para: newDegree, data: date.toISOString() },
  });
  revalidatePath(`/secretaria/membros/${memberId}`);
  return { ok: `Grau ${newDegree} registrado.` };
}

// Resolve o valor do select de cargo do rito ("rito:<nome>" ou "" = sem cargo).
// Cargos ritualísticos são gerenciados exclusivamente pelo model CargoRito e
// não interferem no nível de acesso ao sistema (currentRole).
async function resolveCargo(
  lodgeId: string,
  raw: string
): Promise<{ cargoRito: string | null } | { error: string }> {
  if (!raw || raw === "MEMBER") return { cargoRito: null };
  if (!raw.startsWith("rito:")) return { error: "Cargo inválido." };
  const nome = raw.slice(5);
  const cargo = await prisma.cargoRito.findUnique({
    where: { lodgeId_nome: { lodgeId, nome } },
  });
  if (!cargo) return { error: "Cargo do rito não encontrado." };
  return { cargoRito: cargo.nome };
}

// Nomeação de cargo do rito — encerra o cargo anterior no histórico.
// Não altera o nível de acesso (currentRole).
export async function assignRole(
  memberId: string,
  _prev: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  const user = await requireSecretariaWriter();
  const cargo = await resolveCargo(
    user.lodgeId,
    String(formData.get("role"))
  );
  if ("error" in cargo) return { error: cargo.error };
  const startDate = new Date(String(formData.get("startDate")));

  await prisma.$transaction([
    prisma.roleHistory.updateMany({
      where: { userId: memberId, lodgeId: user.lodgeId, endDate: null },
      data: { endDate: startDate },
    }),
    prisma.roleHistory.create({
      data: {
        lodgeId: user.lodgeId,
        userId: memberId,
        role: "MEMBER",
        cargoRito: cargo.cargoRito,
        startDate,
      },
    }),
    prisma.user.update({
      where: { id: memberId, lodgeId: user.lodgeId },
      data: { cargoRito: cargo.cargoRito },
    }),
  ]);
  await auditar({
    lodgeId: user.lodgeId,
    ator: user,
    acao: "membro.cargo-rito",
    entidade: "User",
    entidadeId: memberId,
    detalhes: { cargo: cargo.cargoRito, inicio: startDate.toISOString() },
  });
  revalidatePath(`/secretaria/membros/${memberId}`);
  return { ok: "Cargo registrado." };
}

// Nível de acesso ao sistema (enum Role) — definido por VM/Secretário,
// independente do cargo ritualístico.
export async function setAccessRole(
  memberId: string,
  _prev: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  const user = await requireSecretariaWriter();
  const raw = String(formData.get("accessRole"));
  const permitidos: Role[] = [
    "MEMBER",
    "VENERAVEL_MESTRE",
    "SECRETARIO",
    "TESOUREIRO",
    "CONSELHO_CONTAS",
    "ESMOLER",
  ];
  if (!permitidos.includes(raw as Role)) {
    return { error: "Nível de acesso inválido." };
  }
  if (memberId === user.id && raw !== user.role) {
    return { error: "Você não pode alterar o próprio nível de acesso." };
  }
  await prisma.user.update({
    where: { id: memberId, lodgeId: user.lodgeId },
    data: { currentRole: raw as Role },
  });
  await auditar({
    lodgeId: user.lodgeId,
    ator: user,
    acao: "membro.nivel-acesso",
    entidade: "User",
    entidadeId: memberId,
    detalhes: { para: raw },
  });
  revalidatePath(`/secretaria/membros/${memberId}`);
  return { ok: "Nível de acesso atualizado." };
}

// ─────────────── Cargos do rito (personalizados por Loja) ───────────────

export async function createCargoRito(
  _prev: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  const user = await requireSecretariaWriter();
  const nome = String(formData.get("nome")).trim();
  if (!nome) return { error: "Informe o nome do cargo." };
  try {
    await prisma.cargoRito.create({
      data: { lodgeId: user.lodgeId, nome },
    });
  } catch {
    return { error: "Já existe um cargo com esse nome." };
  }
  revalidatePath("/secretaria/cargos");
  return { ok: "Cargo do rito cadastrado." };
}

export async function deleteCargoRito(cargoId: string): Promise<ActionResult> {
  const user = await requireSecretariaWriter();
  const cargo = await prisma.cargoRito.findUniqueOrThrow({
    where: { id: cargoId, lodgeId: user.lodgeId },
  });
  const emUso = await prisma.user.count({
    where: { lodgeId: user.lodgeId, cargoRito: cargo.nome },
  });
  if (emUso > 0) {
    return {
      error: `Há ${emUso} membro(s) com este cargo — nomeie outro cargo antes de excluir.`,
    };
  }
  await prisma.cargoRito.delete({
    where: { id: cargoId, lodgeId: user.lodgeId },
  });
  revalidatePath("/secretaria/cargos");
  return { ok: "Cargo do rito excluído." };
}

// ─────────────── Correção de histórico (graus e cargos) ───────────────
// O grau atual do membro sempre reflete o registro mais recente do
// histórico; o cargo atual reflete o registro em aberto (sem data fim).

async function syncMemberDegree(lodgeId: string, userId: string) {
  const latest = await prisma.degreeHistory.findFirst({
    where: { lodgeId, userId },
    orderBy: { date: "desc" },
  });
  if (latest) {
    await prisma.user.update({
      where: { id: userId, lodgeId },
      data: { degree: latest.degree },
    });
  }
}

async function syncMemberRole(lodgeId: string, userId: string) {
  const open = await prisma.roleHistory.findFirst({
    where: { lodgeId, userId, endDate: null },
    orderBy: { startDate: "desc" },
  });
  // O histórico rege apenas o cargo do rito; o nível de acesso (currentRole)
  // é gerido separadamente por setAccessRole.
  await prisma.user.update({
    where: { id: userId, lodgeId },
    data: { cargoRito: open?.cargoRito ?? null },
  });
}

export async function updateDegreeHistory(
  entryId: string,
  formData: FormData
): Promise<ActionResult> {
  const user = await requireSecretariaWriter();
  const entry = await prisma.degreeHistory.findUniqueOrThrow({
    where: { id: entryId, lodgeId: user.lodgeId },
  });
  const degree = formData.get("degree") as Degree;
  const date = new Date(String(formData.get("date")));
  if (Number.isNaN(date.getTime())) return { error: "Informe uma data válida." };
  await prisma.degreeHistory.update({
    where: { id: entryId, lodgeId: user.lodgeId },
    data: { degree, date },
  });
  await syncMemberDegree(user.lodgeId, entry.userId);
  revalidatePath(`/secretaria/membros/${entry.userId}`);
  return { ok: "Registro de grau atualizado." };
}

export async function deleteDegreeHistory(
  entryId: string
): Promise<ActionResult> {
  const user = await requireSecretariaWriter();
  const entry = await prisma.degreeHistory.findUniqueOrThrow({
    where: { id: entryId, lodgeId: user.lodgeId },
  });
  await prisma.degreeHistory.delete({
    where: { id: entryId, lodgeId: user.lodgeId },
  });
  await syncMemberDegree(user.lodgeId, entry.userId);
  revalidatePath(`/secretaria/membros/${entry.userId}`);
  return { ok: "Registro de grau excluído." };
}

export async function updateRoleHistory(
  entryId: string,
  formData: FormData
): Promise<ActionResult> {
  const user = await requireSecretariaWriter();
  const entry = await prisma.roleHistory.findUniqueOrThrow({
    where: { id: entryId, lodgeId: user.lodgeId },
  });
  const cargo = await resolveCargo(
    user.lodgeId,
    String(formData.get("role"))
  );
  if ("error" in cargo) return { error: cargo.error };
  const startDate = new Date(String(formData.get("startDate")));
  if (Number.isNaN(startDate.getTime())) {
    return { error: "Informe uma data de início válida." };
  }
  const endRaw = String(formData.get("endDate") ?? "").trim();
  const endDate = endRaw ? new Date(endRaw) : null;
  if (endDate && endDate < startDate) {
    return { error: "A data de fim não pode ser anterior ao início." };
  }
  await prisma.roleHistory.update({
    where: { id: entryId, lodgeId: user.lodgeId },
    data: { role: "MEMBER", cargoRito: cargo.cargoRito, startDate, endDate },
  });
  await syncMemberRole(user.lodgeId, entry.userId);
  revalidatePath(`/secretaria/membros/${entry.userId}`);
  return { ok: "Registro de cargo atualizado." };
}

export async function deleteRoleHistory(
  entryId: string
): Promise<ActionResult> {
  const user = await requireSecretariaWriter();
  const entry = await prisma.roleHistory.findUniqueOrThrow({
    where: { id: entryId, lodgeId: user.lodgeId },
  });
  await prisma.roleHistory.delete({
    where: { id: entryId, lodgeId: user.lodgeId },
  });
  await syncMemberRole(user.lodgeId, entry.userId);
  revalidatePath(`/secretaria/membros/${entry.userId}`);
  return { ok: "Registro de cargo excluído." };
}


// LGPD (#15): anonimiza um EX-MEMBRO a pedido do titular. Apaga dados
// pessoais e arquivos (foto/assinatura/familiares) mas preserva os registros
// institucionais (presenças, mensalidades, atas) já desvinculados de dados
// civis. Irreversível — o login deixa de existir.
export async function anonimizarMembro(
  memberId: string,
  _prev: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  const user = await requireRole("VENERAVEL_MESTRE", "SECRETARIO");
  if (memberId === user.id) {
    return { error: "Não é possível anonimizar o próprio cadastro." };
  }
  if (String(formData.get("confirmar")) !== "ANONIMIZAR") {
    return { error: "Digite ANONIMIZAR para confirmar." };
  }
  const member = await prisma.user.findUnique({
    where: { id: memberId, lodgeId: user.lodgeId },
  });
  if (!member) return { error: "Membro não encontrado." };
  if (member.status !== "EX_MEMBRO") {
    return {
      error:
        "Só ex-membros podem ser anonimizados — primeiro registre o desligamento (status Ex-membro).",
    };
  }

  const anon = `anon-${member.id.slice(-12)}`;
  await prisma.$transaction([
    prisma.familyMember.deleteMany({ where: { userId: memberId } }),
    prisma.metaRegistro.deleteMany({ where: { userId: memberId } }),
    prisma.user.update({
      where: { id: memberId, lodgeId: user.lodgeId },
      data: {
        name: "Ex-membro (dados removidos)",
        cim: anon,
        cpf: anon,
        email: `${anon}@removido.local`,
        phone: null,
        address: null,
        birthDate: null,
        profession: null,
        rg: null,
        naturalidade: null,
        estadoCivil: null,
        conjuge: null,
        nomePai: null,
        nomeMae: null,
        tipoSanguineo: null,
        photoUrl: null,
        signatureUrl: null,
        passwordHash: "!anonimizado", // nunca casa com bcrypt — login impossível
        resetCodeHash: null,
        asaasCustomerId: null,
        asaasSubscriptionId: null,
        cardToken: `revogado-${member.id}`,
        isDataPublic: false,
        showEmail: false,
        showPhone: false,
        showAddress: false,
        showBirthDate: false,
      },
    }),
  ]);
  await Promise.all([
    deleteMedia(member.photoUrl),
    deleteMedia(member.signatureUrl),
  ]);
  await prisma.notification.deleteMany({
    where: { lodgeId: user.lodgeId, sourceKey: `lgpd-exclusao:${memberId}` },
  });
  await auditar({
    lodgeId: user.lodgeId,
    ator: user,
    acao: "lgpd.anonimizar-membro",
    entidade: "User",
    entidadeId: memberId,
    detalhes: { cimOriginal: member.cim }, // rastreabilidade mínima da trilha
  });
  revalidatePath(`/secretaria/membros/${memberId}`);
  return { ok: "Dados pessoais anonimizados — registros institucionais preservados." };
}
