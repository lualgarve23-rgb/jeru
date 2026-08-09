"use server";


import { revalidatePath } from "next/cache";
import {
  StatusAdmissao } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { canWriteSecretaria } from "@/lib/permissions";
import { appUrl } from "@/lib/utils";
import { sendLodgeEmail } from "@/lib/gmail";
import { type ActionResult, requireSecretariaWriter, validarAnexo, gravarAnexoCandidato } from "./_shared";
import { saveAdmissaoFoto, deleteMedia, validarImagem } from "@/lib/media";

// ───────────────────── Pipeline de Admissão (Kanban) ─────────────────────

// Move o card no Kanban — só avança/retrocede uma etapa por vez, e a
// entrada em ESCRUTINIO exige que as certidões já tenham sido validadas.
export async function moveProcessoAdmissao(
  processoId: string,
  toStatus: StatusAdmissao
): Promise<ActionResult> {
  const user = await requireSecretariaWriter();
  const processo = await prisma.processoAdmissao.findUniqueOrThrow({
    where: { id: processoId, lodgeId: user.lodgeId },
  });
  if (processo.status === "INICIADO" || processo.status === "REPROVADO") {
    return { error: "Processo já encerrado." };
  }
  if (toStatus === "ESCRUTINIO" && !processo.certidoesValidas) {
    return {
      error: "Marque as certidões como válidas antes do Escrutínio.",
    };
  }
  const data: Record<string, unknown> = { status: toStatus };
  if (toStatus === "ESCRUTINIO" && !processo.dataEscrutinio) {
    data.dataEscrutinio = new Date();
  }
  await prisma.processoAdmissao.update({
    where: { id: processoId, lodgeId: user.lodgeId },
    data,
  });
  revalidatePath("/secretaria/admissoes");
  return { ok: "Processo atualizado." };
}

export async function setFotoProcessoAdmissao(
  processoId: string,
  formData: FormData
): Promise<ActionResult> {
  const user = await requireSecretariaWriter();
  const file = formData.get("foto") as File | null;
  const v = validarImagem(file, "A foto do candidato");
  if (v.vazio) return { error: "Selecione uma imagem." };
  if (v.error) return { error: v.error };
  const antes = await prisma.processoAdmissao.findUnique({
    where: { id: processoId, lodgeId: user.lodgeId },
    select: { fotoUrl: true },
  });
  if (!antes) return { error: "Processo não encontrado." };
  const key = await saveAdmissaoFoto(user.lodgeId, processoId, file!);
  await prisma.processoAdmissao.update({
    where: { id: processoId, lodgeId: user.lodgeId },
    data: { fotoUrl: key },
  });
  await deleteMedia(antes.fotoUrl);
  revalidatePath("/secretaria/admissoes");
  return { ok: "Foto do candidato atualizada." };
}

export async function setCertidoesValidas(
  processoId: string,
  value: boolean
): Promise<ActionResult> {
  const user = await requireSecretariaWriter();
  await prisma.processoAdmissao.update({
    where: { id: processoId, lodgeId: user.lodgeId },
    data: { certidoesValidas: value },
  });
  revalidatePath("/secretaria/admissoes");
  return { ok: "Certidões atualizadas." };
}

export async function reprovarProcessoAdmissao(
  processoId: string
): Promise<ActionResult> {
  const user = await requireSecretariaWriter();
  await prisma.processoAdmissao.update({
    where: { id: processoId, lodgeId: user.lodgeId },
    data: { status: "REPROVADO", aprovado: false },
  });
  revalidatePath("/secretaria/admissoes");
  return { ok: "Processo reprovado." };
}

// ─────────── Candidatos: indicação pelo padrinho e link público ───────────

// para o candidato baixar e devolver os formulários de indicação.
export async function indicarCandidato(
  _prev: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  const user = await requireUser();
  const nomeCandidato = String(formData.get("nomeCandidato") ?? "").trim();
  if (!nomeCandidato) return { error: "Informe o nome do candidato." };
  const email = String(formData.get("email") ?? "").trim().toLowerCase() || null;
  const fotoFile = formData.get("foto") as File | null;
  const fotoCheck = validarImagem(fotoFile, "A foto do candidato");
  if (fotoCheck.error) return { error: fotoCheck.error };

  const [processo, responsaveis] = await Promise.all([
    prisma.processoAdmissao.create({
      data: {
        lodgeId: user.lodgeId,
        nomeCandidato,
        cpf: String(formData.get("cpf") ?? "").replace(/\D/g, "") || null,
        email,
        phone: String(formData.get("phone") ?? "").trim() || null,

        padrinhoId: user.id,
        observacoes: String(formData.get("observacoes") ?? "").trim() || null,
      },
    }),
    // Avisa a Secretaria e o Venerável de que há um candidato novo a conferir
    prisma.user.findMany({
      where: {
        lodgeId: user.lodgeId,
        currentRole: { in: ["SECRETARIO", "VENERAVEL_MESTRE"] },
      },
      select: { id: true },
    }),
  ]);
  // A chave de media inclui o id do processo — só dá para gravar após o create
  if (fotoCheck.ok) {
    const key = await saveAdmissaoFoto(user.lodgeId, processo.id, fotoFile!);
    await prisma.processoAdmissao.update({
      where: { id: processo.id },
      data: { fotoUrl: key },
    });
  }
  await prisma.notification.createMany({
    data: responsaveis.map((r) => ({
      lodgeId: user.lodgeId,
      userId: r.id,
      title: "Novo candidato indicado",
      description: `${user.name} indicou ${nomeCandidato} para iniciação.`,
      type: "MISSING_DATA" as const,
      sourceKey: `candidato:${processo.id}:${r.id}`,
      link: "/secretaria/admissoes",
    })),
    skipDuplicates: true,
  });

  // Envia o link ao candidato quando o padrinho informou o e-mail
  if (email) {
    try {
      await sendLodgeEmail({
        lodgeId: user.lodgeId,
        to: email,
        subject: "Formulários de indicação — processo de admissão",
        text:
          `Prezado ${nomeCandidato},\n\n` +
          `Você foi indicado por ${user.name}. Acesse o link abaixo para baixar os ` +
          `formulários de indicação, preenchê-los e devolvê-los pelo próprio link:\n\n` +
          `${appUrl()}/candidato/${processo.token}\n\n` +
          `O link é pessoal — não o compartilhe.`,
      });
    } catch (e) {
      console.error("e-mail do candidato", e);
      revalidatePath("/secretaria/admissoes");
      return {
        ok:
          "Candidato cadastrado. Não foi possível enviar o e-mail — copie o link e entregue ao candidato.",
      };
    }
  }
  revalidatePath("/secretaria/admissoes");
  return {
    ok: email
      ? `Candidato cadastrado e link enviado para ${email}.`
      : "Candidato cadastrado. Copie o link e entregue ao candidato.",
  };
}

// Anexo enviado pelo próprio candidato no link público (sem login)
export async function anexarFormularioCandidatoPublico(
  token: string,
  _prev: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  const processo = await prisma.processoAdmissao.findUnique({
    where: { token },
    select: { id: true, status: true, nomeCandidato: true, lodgeId: true, padrinhoId: true },
  });
  if (!processo) return { error: "Link inválido." };
  if (processo.status === "INICIADO" || processo.status === "REPROVADO") {
    return { error: "Este processo já foi encerrado." };
  }
  const valid = validarAnexo(formData.get("arquivo") as File | null);
  if ("error" in valid) return valid;
  await gravarAnexoCandidato(processo.id, valid.file, "candidato");

  const avisar = await prisma.user.findMany({
    where: {
      lodgeId: processo.lodgeId,
      OR: [
        { currentRole: { in: ["SECRETARIO", "VENERAVEL_MESTRE"] } },
        ...(processo.padrinhoId ? [{ id: processo.padrinhoId }] : []),
      ],
    },
    select: { id: true },
  });
  await prisma.notification.createMany({
    data: avisar.map((r) => ({
      lodgeId: processo.lodgeId,
      userId: r.id,
      title: "Formulário do candidato recebido",
      description: `${processo.nomeCandidato} devolveu formulário(s) de indicação.`,
      type: "MISSING_DATA" as const,
      // Chave estável: um aviso por candidato/destinatário, mesmo com vários envios
      sourceKey: `candidato-anexo:${processo.id}:${r.id}`,
      link: "/secretaria/admissoes",
    })),
    skipDuplicates: true,
  });
  revalidatePath(`/candidato/${token}`);
  revalidatePath("/secretaria/admissoes");
  return { ok: "Formulário recebido. Obrigado!" };
}

// Anexos do candidato no painel: só o padrinho ou a Secretaria mexem
function podeEditarAnexosCandidato(
  user: { id: string; role: string },
  processo: { padrinhoId: string | null }
) {
  return canWriteSecretaria(user.role) || processo.padrinhoId === user.id;
}

// Anexo enviado por um irmão (padrinho ou Secretaria) pelo painel
export async function anexarFormularioCandidato(
  processoId: string,
  _prev: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  const user = await requireUser();
  const processo = await prisma.processoAdmissao.findUnique({
    where: { id: processoId, lodgeId: user.lodgeId },
    select: { id: true, padrinhoId: true },
  });
  if (!processo) return { error: "Candidato não encontrado." };
  if (!podeEditarAnexosCandidato(user, processo)) {
    return { error: "Só o padrinho ou a Secretaria podem anexar formulários." };
  }
  const valid = validarAnexo(formData.get("arquivo") as File | null);
  if ("error" in valid) return valid;
  await gravarAnexoCandidato(processo.id, valid.file, user.name);
  revalidatePath("/secretaria/admissoes");
  return { ok: "Formulário anexado." };
}

export async function removerAnexoCandidato(
  anexoId: string
): Promise<ActionResult> {
  const user = await requireUser();
  const anexo = await prisma.candidatoAnexo.findUnique({
    where: { id: anexoId },
    select: { id: true, processo: { select: { lodgeId: true, padrinhoId: true } } },
  });
  if (!anexo || anexo.processo.lodgeId !== user.lodgeId) {
    return { error: "Anexo não encontrado." };
  }
  if (!podeEditarAnexosCandidato(user, anexo.processo)) {
    return { error: "Só o padrinho ou a Secretaria podem remover anexos." };
  }
  await prisma.candidatoAnexo.delete({ where: { id: anexoId } });
  revalidatePath("/secretaria/admissoes");
  return { ok: "Anexo removido." };
}

