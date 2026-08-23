"use server";


import { revalidatePath } from "next/cache";
import {
  Degree,
  StatusProgressao } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { dataMinimaProgressao } from "@/lib/intersticio";
import { type ActionResult, requireSecretariaWriter } from "./_shared";

// ───────────────────────── Progressão de Graus ─────────────────────────
// Pipeline do loja.md §4.B — travas: interstício, frequência, Placet da
// Guarda dos Selos e comunicação de 15 dias pós-cerimônia.

function nextDegreeOf(degree: Degree): Degree | null {
  if (degree === "APRENDIZ") return "COMPANHEIRO";
  if (degree === "COMPANHEIRO") return "MESTRE";
  return null;
}

// Data em que o obreiro cumpre o interstício para o grau alvo (null = sem base)
async function intersticeEligibleDate(
  lodgeId: string,
  userId: string,
  grauAlvo: Degree
): Promise<Date | null> {
  const [lastDegree, member] = await Promise.all([
    prisma.degreeHistory.findFirst({
      where: { lodgeId, userId },
      orderBy: { date: "desc" },
    }),
    prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { initiationDate: true },
    }),
  ]);
  return dataMinimaProgressao(
    grauAlvo,
    lastDegree?.date ?? member.initiationDate ?? null
  );
}

export async function createProcessoProgressao(
  _prev: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  const user = await requireSecretariaWriter();
  const userId = String(formData.get("userId") ?? "");
  const member = await prisma.user.findUnique({
    where: { id: userId, lodgeId: user.lodgeId },
    select: { degree: true, status: true, name: true },
  });
  if (!member) return { error: "Obreiro não encontrado." };
  if (member.status !== "ATIVO") {
    return { error: "Somente obreiros ativos podem progredir de grau." };
  }
  const grauAlvo = nextDegreeOf(member.degree);
  if (!grauAlvo) return { error: "Mestre já está no grau máximo simbólico." };

  const aberto = await prisma.processoProgressao.findFirst({
    where: {
      lodgeId: user.lodgeId,
      userId,
      status: { not: "GRAU_CONCEDIDO" },
    },
  });
  if (aberto) return { error: "Já existe processo de progressão em andamento." };

  await prisma.processoProgressao.create({
    data: { lodgeId: user.lodgeId, userId, grauAlvo },
  });
  revalidatePath("/secretaria/progressoes");
  return { ok: `Progressão de ${member.name} iniciada.` };
}

const ORDEM_PROGRESSAO: StatusProgressao[] = [
  "CUMPRIMENTO_INTERSTICIO",
  "INSTRUCAO_E_FREQUENCIA",
  "EXAME_PROFICIENCIA",
  "ESCRUTINIO_PROGRESSAO",
  "AGUARDANDO_PLACET",
  "AGUARDANDO_CERIMONIA",
  "COMUNICACAO_POS_CERIMONIA",
  "GRAU_CONCEDIDO",
];

export async function moveProcessoProgressao(
  processoId: string,
  toStatus: StatusProgressao
): Promise<ActionResult> {
  const user = await requireSecretariaWriter();
  const processo = await prisma.processoProgressao.findUniqueOrThrow({
    where: { id: processoId, lodgeId: user.lodgeId },
    include: { user: { select: { name: true, degree: true } } },
  });
  if (processo.status === "GRAU_CONCEDIDO") {
    return { error: "Processo já encerrado — grau concedido." };
  }
  const fromIdx = ORDEM_PROGRESSAO.indexOf(processo.status);
  const toIdx = ORDEM_PROGRESSAO.indexOf(toStatus);
  if (toIdx === fromIdx) return undefined;

  // Trava 1 — interstício: card só sai da 1ª coluna com o prazo legal cumprido
  if (fromIdx === 0 && toIdx > 0) {
    const eligible = await intersticeEligibleDate(
      user.lodgeId,
      processo.userId,
      processo.grauAlvo
    );
    if (!eligible) {
      return {
        error:
          "Sem data-base do grau atual (iniciação/última progressão) — complete o cadastro do obreiro.",
      };
    }
    if (eligible > new Date()) {
      return {
        error: `Interstício não cumprido: apto a partir de ${eligible.toLocaleDateString("pt-BR")}.`,
      };
    }
  }

  // Trava 2 — frequência: valida o Livro de Presenças durante o processo
  // antes de sair de Instrução e Frequência (mínimo configurável por loja)
  if (
    fromIdx <= ORDEM_PROGRESSAO.indexOf("INSTRUCAO_E_FREQUENCIA") &&
    toIdx > ORDEM_PROGRESSAO.indexOf("INSTRUCAO_E_FREQUENCIA")
  ) {
    const [lodge, sessoes, presencas] = await Promise.all([
      prisma.lodge.findUniqueOrThrow({
        where: { id: user.lodgeId },
        select: { minFreqProgressao: true },
      }),
      prisma.lodgeSession.count({
        where: {
          lodgeId: user.lodgeId,
          date: { gte: processo.dataInicio, lte: new Date() },
        },
      }),
      prisma.attendance.count({
        where: {
          lodgeId: user.lodgeId,
          userId: processo.userId,
          session: { date: { gte: processo.dataInicio, lte: new Date() } },
        },
      }),
    ]);
    if (sessoes > 0) {
      const pct = Math.round((presencas / sessoes) * 100);
      if (pct < lodge.minFreqProgressao) {
        return {
          error: `Frequência insuficiente: ${pct}% (${presencas} presença(s) em ${sessoes} sessão(ões) desde o início do processo). Mínimo da loja: ${lodge.minFreqProgressao}%.`,
        };
      }
    }
  }

  // Trava 2b — instruções: exige o nº de instruções do grau atual definido
  // pela loja antes de sair de Instrução e Frequência
  if (
    fromIdx <= ORDEM_PROGRESSAO.indexOf("INSTRUCAO_E_FREQUENCIA") &&
    toIdx > ORDEM_PROGRESSAO.indexOf("INSTRUCAO_E_FREQUENCIA")
  ) {
    const grauAtual =
      processo.grauAlvo === "COMPANHEIRO" ? Degree.APRENDIZ : Degree.COMPANHEIRO;
    const lodgeInstr = await prisma.lodge.findUniqueOrThrow({
      where: { id: user.lodgeId },
      select: { instrucoesAprendiz: true, instrucoesCompanheiro: true },
    });
    const necessarias =
      grauAtual === "APRENDIZ"
        ? lodgeInstr.instrucoesAprendiz
        : lodgeInstr.instrucoesCompanheiro;
    if (necessarias > 0) {
      const feitas = await prisma.instrucao.count({
        where: { lodgeId: user.lodgeId, userId: processo.userId, degree: grauAtual },
      });
      if (feitas < necessarias) {
        return {
          error: `Instruções insuficientes: ${feitas} de ${necessarias} exigidas pela loja (registradas pelos Vigilantes em Instruções).`,
        };
      }
    }
  }

  // Trava 3a — prancha do Placet: o card só sai de AGUARDANDO_PLACET com a
  // prancha assinada na seção Processos (cadeia gov.br) e enviada
  if (toIdx >= ORDEM_PROGRESSAO.indexOf("AGUARDANDO_CERIMONIA") && processo.pranchaId) {
    const prancha = await prisma.prancha.findUnique({
      where: { id: processo.pranchaId },
      select: {
        govbrSignedAt: true,
        enviadaAt: true,
        driveFileId: true,
        processo: { select: { id: true } },
      },
    });
    // Prancha com anexo (ou já encaminhada aos Processos) exige a cadeia
    // de assinaturas gov.br concluída antes do envio
    if (
      prancha &&
      (prancha.driveFileId || prancha.processo) &&
      !prancha.govbrSignedAt
    ) {
      return {
        error:
          "A prancha do Placet ainda não foi assinada — conclua a cadeia de assinaturas gov.br na seção Processos.",
      };
    }
    if (prancha && !prancha.enviadaAt) {
      return {
        error:
          "A prancha do Placet ainda não foi enviada — faça o envio à Guarda dos Selos (seção Processos ou Pranchas).",
      };
    }
  }

  // Trava 3b — Guarda dos Selos: cerimônia só com o Placet deferido
  if (toIdx >= ORDEM_PROGRESSAO.indexOf("AGUARDANDO_CERIMONIA") && !processo.placetDeferido) {
    return {
      error:
        "Aguarde o deferimento do Placet pela Guarda dos Selos antes de agendar a cerimônia.",
    };
  }

  const data: Record<string, unknown> = { status: toStatus };

  // Escrutínio aprovado → registra a data e expede a prancha do Placet,
  // vinculada ao processo: é ela que trava a saída de AGUARDANDO_PLACET
  // (assinaturas na seção Processos + envio)
  if (toStatus === "AGUARDANDO_PLACET" && !processo.pranchaId) {
    if (!processo.dataAprovacao) data.dataAprovacao = new Date();
    const year = new Date().getFullYear();
    const last = await prisma.prancha.findFirst({
      where: { lodgeId: user.lodgeId, year },
      orderBy: { number: "desc" },
    });
    const rito = processo.grauAlvo === "MESTRE" ? "Exaltação" : "Elevação";
    const prancha = await prisma.prancha.create({
      data: {
        lodgeId: user.lodgeId,
        year,
        number: (last?.number ?? 0) + 1,
        subject: `Solicitação de Placet de ${rito} — ${processo.user.name}`,
        recipient: "Secretaria Estadual da Guarda dos Selos",
        content:
          `Solicitamos o Placet de ${rito.toLowerCase()} do obreiro ${processo.user.name}, ` +
          `aprovado em escrutínio de plenário em ${new Date().toLocaleDateString("pt-BR")}, ` +
          `para o grau de ${processo.grauAlvo === "MESTRE" ? "Mestre" : "Companheiro"}.`,
      },
    });
    data.pranchaId = prancha.id;
    revalidatePath("/secretaria/pranchas");
  }

  // Cerimônia realizada → inicia a contagem dos 15 dias de comunicação
  if (toStatus === "COMUNICACAO_POS_CERIMONIA" && !processo.dataCerimonia) {
    data.dataCerimonia = new Date();
  }

  await prisma.processoProgressao.update({
    where: { id: processoId, lodgeId: user.lodgeId },
    data,
  });

  // Conclusão: atualiza o grau definitivo e o histórico (base do próximo interstício)
  if (toStatus === "GRAU_CONCEDIDO") {
    const date = processo.dataCerimonia ?? new Date();
    await prisma.user.update({
      where: { id: processo.userId, lodgeId: user.lodgeId },
      data: { degree: processo.grauAlvo },
    });
    await prisma.degreeHistory.create({
      data: {
        lodgeId: user.lodgeId,
        userId: processo.userId,
        degree: processo.grauAlvo,
        date,
      },
    });
    revalidatePath("/secretaria/membros");
  }

  revalidatePath("/secretaria/progressoes");
  return { ok: "Processo atualizado." };
}

export async function setPlacetDeferido(
  processoId: string,
  value: boolean
): Promise<ActionResult> {
  const user = await requireSecretariaWriter();
  await prisma.processoProgressao.update({
    where: { id: processoId, lodgeId: user.lodgeId },
    data: { placetDeferido: value },
  });
  revalidatePath("/secretaria/progressoes");
  return { ok: "Placet atualizado." };
}

export async function setComunicadoEnviado(
  processoId: string,
  value: boolean
): Promise<ActionResult> {
  const user = await requireSecretariaWriter();
  await prisma.processoProgressao.update({
    where: { id: processoId, lodgeId: user.lodgeId },
    data: { comunicadoEnviado: value },
  });
  revalidatePath("/secretaria/progressoes");
  return { ok: "Comunicação atualizada." };
}

