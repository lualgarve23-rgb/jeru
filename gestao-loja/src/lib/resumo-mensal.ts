import type { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { sendLodgeEmail, isGmailConfigured } from "@/lib/gmail";
import { SECRETARIA_WRITERS } from "@/lib/permissions";
import { logInfo } from "@/lib/log";

// Resumo mensal da loja por e-mail ao VM e ao Secretário: capitações,
// frequência, processos (caixa de assinaturas) e uso do assistente do mês
// fechado. Enfileirado pelo cron diário no dia 1º (tipo "resumo.mensal").

const MESES = [
  "janeiro",
  "fevereiro",
  "março",
  "abril",
  "maio",
  "junho",
  "julho",
  "agosto",
  "setembro",
  "outubro",
  "novembro",
  "dezembro",
];

function reais(cents: number) {
  return (cents / 100).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

// Dados do resumo de um mês fechado (mes 1–12), separados do envio
// para permitir teste sem SMTP.
export async function dadosResumoMensal(
  lodgeId: string,
  ano: number,
  mes: number
) {
  const inicio = new Date(ano, mes - 1, 1);
  const fim = new Date(ano, mes, 1); // exclusivo
  const periodo = { gte: inicio, lt: fim };

  const [
    capitacoes,
    sessoes,
    presencas,
    visitantes,
    justificadas,
    processosCriados,
    processosAssinados,
    processosAbertos,
    perguntas,
    usuariosAssistente,
    fechamento,
  ] = await Promise.all([
    prisma.invoice.groupBy({
      by: ["status"],
      where: { lodgeId, referenceYear: ano, referenceMonth: mes },
      _count: true,
      _sum: { amountCents: true },
    }),
    prisma.lodgeSession.count({ where: { lodgeId, date: periodo } }),
    prisma.attendance.count({
      where: {
        lodgeId,
        checkedIn: true,
        userId: { not: null },
        session: { date: periodo },
      },
    }),
    prisma.attendance.count({
      where: {
        lodgeId,
        checkedIn: true,
        userId: null,
        session: { date: periodo },
      },
    }),
    prisma.attendance.count({
      where: { lodgeId, justificado: true, session: { date: periodo } },
    }),
    prisma.processoDocumento.count({
      where: { lodgeId, createdAt: periodo },
    }),
    prisma.processoDocumento.count({
      where: { lodgeId, status: "ASSINADO", updatedAt: periodo },
    }),
    prisma.processoDocumento.count({
      where: { lodgeId, status: "EM_ASSINATURA" },
    }),
    prisma.assistenteMensagem.count({
      where: { role: "user", createdAt: periodo, conversa: { lodgeId } },
    }),
    prisma.assistenteConversa.findMany({
      where: { lodgeId, mensagens: { some: { createdAt: periodo } } },
      distinct: ["userId"],
      select: { userId: true },
    }),
    prisma.fechamentoMes.findUnique({
      where: { lodgeId_ano_mes: { lodgeId, ano, mes } },
      select: {
        reabertoAt: true,
        cienciaConselhoAt: true,
        fechadoPor: { select: { name: true } },
      },
    }),
  ]);

  const porStatus = (s: string) =>
    capitacoes.find((c) => c.status === s) ?? { _count: 0, _sum: { amountCents: 0 } };
  const pagas = porStatus("PAGA");
  const pendentes = porStatus("PENDENTE");
  const vencidas = porStatus("VENCIDA");
  const emitidas = capitacoes
    .filter((c) => c.status !== "CANCELADA")
    .reduce((n, c) => n + c._count, 0);

  return {
    capitacoes: {
      emitidas,
      pagas: pagas._count,
      recebidoCents: pagas._sum.amountCents ?? 0,
      emAberto: pendentes._count + vencidas._count,
      emAbertoCents:
        (pendentes._sum.amountCents ?? 0) + (vencidas._sum.amountCents ?? 0),
    },
    frequencia: {
      sessoes,
      presencas,
      mediaPorSessao: sessoes ? Math.round(presencas / sessoes) : 0,
      visitantes,
      justificadas,
    },
    processos: {
      criados: processosCriados,
      assinados: processosAssinados,
      emAssinatura: processosAbertos,
    },
    assistente: {
      perguntas,
      usuarios: usuariosAssistente.length,
    },
    balancete: {
      fechado: !!fechamento && fechamento.reabertoAt == null,
      fechadoPor: fechamento?.fechadoPor.name ?? null,
      cienciaConselho: !!fechamento && fechamento.reabertoAt == null && !!fechamento.cienciaConselhoAt,
    },
  };
}

export type ResumoMensal = Awaited<ReturnType<typeof dadosResumoMensal>>;

// Corpo do e-mail (HTML simples, no estilo dos demais envios da Secretaria)
export function htmlResumoMensal(
  lodgeName: string,
  ano: number,
  mes: number,
  r: ResumoMensal
) {
  const secao = (titulo: string, linhas: string[]) => `
    <tr><td style="padding:16px 24px 0;">
      <p style="margin:0 0 6px;font-size:13px;letter-spacing:1px;text-transform:uppercase;color:#1e3a5f;"><strong>${titulo}</strong></p>
      <p style="margin:0;font-size:14px;color:#3f3f46;line-height:1.8;">${linhas.join("<br/>")}</p>
    </td></tr>`;
  return `<!doctype html>
<html lang="pt-BR">
  <body style="margin:0;padding:0;background:#f4f4f5;font-family:Georgia,'Times New Roman',serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:24px 0;">
      <tr><td align="center">
        <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden;border:1px solid #e4e4e7;">
          <tr>
            <td style="background:#1e3a5f;padding:24px 32px;text-align:center;">
              <p style="margin:0;color:#c9a84c;font-size:13px;letter-spacing:3px;text-transform:uppercase;">Resumo Mensal</p>
              <h1 style="margin:8px 0 0;color:#ffffff;font-size:20px;font-weight:normal;">${lodgeName} — ${MESES[mes - 1]} de ${ano}</h1>
            </td>
          </tr>
          ${secao("Capitações do mês", [
            `Emitidas: <strong>${r.capitacoes.emitidas}</strong> · Pagas: <strong>${r.capitacoes.pagas}</strong> (${reais(r.capitacoes.recebidoCents)})`,
            `Em aberto: <strong>${r.capitacoes.emAberto}</strong> (${reais(r.capitacoes.emAbertoCents)})`,
          ])}
          ${secao("Frequência", [
            `Sessões realizadas: <strong>${r.frequencia.sessoes}</strong> · Presenças: <strong>${r.frequencia.presencas}</strong> (média de ${r.frequencia.mediaPorSessao} por sessão)`,
            `Visitantes: <strong>${r.frequencia.visitantes}</strong> · Ausências justificadas: <strong>${r.frequencia.justificadas}</strong>`,
          ])}
          ${secao("Processos (caixa de assinaturas)", [
            `Abertos no mês: <strong>${r.processos.criados}</strong> · Concluídos no mês: <strong>${r.processos.assinados}</strong>`,
            `Aguardando assinaturas hoje: <strong>${r.processos.emAssinatura}</strong>`,
          ])}
          ${secao("Balancete do mês", [
            r.balancete.fechado
              ? `Fechado por <strong>${r.balancete.fechadoPor ?? "—"}</strong> · Ciência do Conselho: <strong>${r.balancete.cienciaConselho ? "registrada" : "pendente"}</strong>`
              : `<strong>Ainda aberto</strong> — o Tesoureiro precisa fechar o mês na Tesouraria para o quadro consultar o Balancete da Loja`,
          ])}
          ${secao("Assistente IA", [
            `Perguntas no mês: <strong>${r.assistente.perguntas}</strong>, de <strong>${r.assistente.usuarios}</strong> irmão(s)`,
          ])}
          <tr><td style="padding:20px 24px 24px;">
            <p style="margin:0;font-size:12px;color:#a1a1aa;line-height:1.5;">
              Resumo automático enviado no 1º dia do mês ao Venerável Mestre e ao Secretário. Os detalhes estão no painel da loja.
            </p>
          </td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`;
}

function textoResumoMensal(
  lodgeName: string,
  ano: number,
  mes: number,
  r: ResumoMensal
) {
  return [
    `Resumo mensal — ${lodgeName} — ${MESES[mes - 1]} de ${ano}`,
    "",
    `Capitações: ${r.capitacoes.emitidas} emitidas, ${r.capitacoes.pagas} pagas (${reais(r.capitacoes.recebidoCents)}), ${r.capitacoes.emAberto} em aberto (${reais(r.capitacoes.emAbertoCents)}).`,
    `Frequência: ${r.frequencia.sessoes} sessões, ${r.frequencia.presencas} presenças (média ${r.frequencia.mediaPorSessao}/sessão), ${r.frequencia.visitantes} visitantes, ${r.frequencia.justificadas} ausências justificadas.`,
    `Processos: ${r.processos.criados} abertos no mês, ${r.processos.assinados} concluídos, ${r.processos.emAssinatura} aguardando assinaturas.`,
    `Assistente IA: ${r.assistente.perguntas} perguntas de ${r.assistente.usuarios} irmão(s).`,
    r.balancete.fechado
      ? `Balancete: fechado por ${r.balancete.fechadoPor ?? "—"}; ciência do Conselho ${r.balancete.cienciaConselho ? "registrada" : "pendente"}.`
      : "Balancete: ainda aberto — o Tesoureiro precisa fechar o mês.",
  ].join("\n");
}

// Executado pela fila (tipo "resumo.mensal"). Loja sem Gmail configurado ou
// sem VM/Secretário ativo apenas registra e sai (sem retry inútil).
export async function enviarResumoMensal(
  lodgeId: string,
  ano: number,
  mes: number
) {
  if (!(await isGmailConfigured(lodgeId))) {
    logInfo("resumo-mensal.sem-gmail", { lodgeId });
    return;
  }
  const [lodge, destinatarios] = await Promise.all([
    prisma.lodge.findUniqueOrThrow({
      where: { id: lodgeId },
      select: { name: true },
    }),
    prisma.user.findMany({
      where: {
        lodgeId,
        status: "ATIVO",
        currentRole: { in: SECRETARIA_WRITERS as Role[] },
      },
      select: { email: true },
    }),
  ]);
  const emails = destinatarios.map((d) => d.email).filter((e) => e.includes("@"));
  if (!emails.length) {
    logInfo("resumo-mensal.sem-destinatarios", { lodgeId });
    return;
  }

  const r = await dadosResumoMensal(lodgeId, ano, mes);
  await sendLodgeEmail({
    lodgeId,
    to: emails[0],
    cc: emails.slice(1),
    subject: `Resumo mensal — ${MESES[mes - 1]} de ${ano} · ${lodge.name}`,
    text: textoResumoMensal(lodge.name, ano, mes, r),
    html: htmlResumoMensal(lodge.name, ano, mes, r),
  });
  logInfo("resumo-mensal.enviado", { lodgeId, ano, mes, destinatarios: emails.length });
}

// Mês fechado anterior a uma data (para o cron do dia 1º)
export function mesAnterior(hoje: Date) {
  const d = new Date(hoje.getFullYear(), hoje.getMonth() - 1, 1);
  return { ano: d.getFullYear(), mes: d.getMonth() + 1 };
}
