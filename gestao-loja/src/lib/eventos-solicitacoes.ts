import { prisma } from "@/lib/prisma";
import { notificarEvento, usuariosDoCargo } from "@/lib/notificar-evento";
import { enfileirar } from "@/lib/fila";
import { linkProcessos } from "@/lib/notifications";
import { logError } from "@/lib/log";

// Avisos de EVENTO ao solicitante em cada etapa e desfecho das solicitações
// (atestado, Quitte Placet, afastamento), ao criador de um processo genérico
// concluído e ao outro assinante da ata. Gravados direto na central
// (sourceKey `evento:...`, fora da varredura de pendências — o sync não os
// apaga; o cron limpa os lidos/antigos). Nunca derrubam a operação principal.
//
// sourceKeys gerados (reutilizáveis pelo dashboard "Minha vez" e assistente):
//   evento:atestado:<id>:tes|sec|concluido
//   evento:quitte:<id>:SECRETARIO|ORADOR|aprovado|negado|enviado
//   evento:afastamento:<id>:sec|vm|indeferido|enviado
//   evento:processo:<id>:concluido
//   evento:ata:<id>:vm|sec
//   evento:cadastro-status já vem de status-membro.ts (prefixo status:)

const fmt = (d: Date | null | undefined) => (d ? d.toLocaleDateString("pt-BR") : "");

// ── Atestado de Regularidade ──
export async function eventoAtestado(lodgeId: string, atestadoId: string) {
  try {
    const a = await prisma.atestadoRegularidade.findUnique({
      where: { id: atestadoId, lodgeId },
      select: {
        userId: true,
        status: true,
        signedByTesAt: true,
        signedBySecAt: true,
        signedByMasterAt: true,
      },
    });
    if (!a) return;
    if (a.status === "ASSINADO") {
      await notificarEvento(prisma, {
        lodgeId,
        userId: a.userId,
        sourceKey: `evento:atestado:${atestadoId}:concluido`,
        type: "PENDING_SIGNATURE",
        title: "Seu Atestado de Regularidade está pronto",
        description:
          "Assinado via gov.br pelo Tesoureiro, pelo Secretário e pelo Venerável Mestre. Baixe o PDF na seção Atestado de Regularidade — ele também segue por e-mail.",
        link: "/secretaria/atestados",
      });
      await enfileirar("solicitacao.concluida", { lodgeId, tipo: "atestado", id: atestadoId });
      return;
    }
    const etapa = a.signedBySecAt ? "sec" : a.signedByTesAt ? "tes" : null;
    if (!etapa) return;
    const quem = etapa === "sec" ? "O Secretário assinou" : "O Tesoureiro assinou";
    const proximo = etapa === "sec" ? "Venerável Mestre" : "Secretário";
    await notificarEvento(prisma, {
      lodgeId,
      userId: a.userId,
      sourceKey: `evento:atestado:${atestadoId}:${etapa}`,
      type: "PENDING_SIGNATURE",
      title: `Atestado de Regularidade: ${quem.toLowerCase()}`,
      description: `${quem} o seu atestado no gov.br — agora está com o ${proximo}. Acompanhe em Atestado de Regularidade.`,
      link: "/secretaria/atestados",
    });
  } catch (e) {
    logError("evento.atestado", e, { atestadoId });
  }
}

// ── Quitte Placet ──
export async function eventoQuitte(
  lodgeId: string,
  placetId: string,
  etapa: "assinatura" | "negado" | "enviado"
) {
  try {
    const p = await prisma.quittePlacet.findUnique({
      where: { id: placetId, lodgeId },
      select: {
        userId: true,
        status: true,
        parecerNegativa: true,
        signedBySecAt: true,
        signedByOradorAt: true,
        signedByMasterAt: true,
      },
    });
    if (!p) return;
    const base = { lodgeId, userId: p.userId, link: "/solicitacoes", type: "PENDING_SIGNATURE" as const };
    if (etapa === "negado") {
      await notificarEvento(prisma, {
        ...base,
        type: "DEADLINE_WARNING",
        sourceKey: `evento:quitte:${placetId}:negado`,
        title: "Seu pedido de Quitte Placet foi negado",
        description: `Parecer da Secretaria: ${p.parecerNegativa ?? "—"}`,
      });
      return;
    }
    if (etapa === "enviado") {
      await notificarEvento(prisma, {
        ...base,
        sourceKey: `evento:quitte:${placetId}:enviado`,
        title: "Quitte Placet enviado à Guarda dos Selos",
        description:
          "O Form. 122 assinado via gov.br foi enviado à Guarda dos Selos. Sua situação no quadro passou a Ex-membro.",
      });
      return;
    }
    if (p.status === "APROVADO") {
      await notificarEvento(prisma, {
        ...base,
        sourceKey: `evento:quitte:${placetId}:aprovado`,
        title: "Seu Quitte Placet foi aprovado",
        description:
          "Assinado via gov.br pelo Secretário, pelo Orador e pelo Venerável Mestre. A Secretaria fará o envio à Guarda dos Selos; o PDF segue por e-mail.",
      });
      await enfileirar("solicitacao.concluida", { lodgeId, tipo: "quitte", id: placetId });
      return;
    }
    const etapaSig = p.signedByOradorAt ? "ORADOR" : p.signedBySecAt ? "SECRETARIO" : null;
    if (!etapaSig) return;
    const quem = etapaSig === "ORADOR" ? "O Orador assinou" : "O Secretário assinou";
    const proximo = etapaSig === "ORADOR" ? "Venerável Mestre" : "Orador";
    await notificarEvento(prisma, {
      ...base,
      sourceKey: `evento:quitte:${placetId}:${etapaSig}`,
      title: `Quitte Placet: ${quem.toLowerCase()}`,
      description: `${quem} o seu Quitte Placet no gov.br — agora está com o ${proximo} (ordem: Secretário, Orador e Venerável Mestre).`,
    });
  } catch (e) {
    logError("evento.quitte", e, { placetId });
  }
}

// ── Pedido de Afastamento (Form. 116) ──
export async function eventoAfastamento(
  lodgeId: string,
  pedidoId: string,
  etapa: "assinatura" | "indeferido" | "enviado"
) {
  try {
    const p = await prisma.pedidoAfastamento.findUnique({
      where: { id: pedidoId, lodgeId },
      select: {
        userId: true,
        status: true,
        parecer: true,
        dias: true,
        signedBySecAt: true,
        signedByMasterAt: true,
        user: { select: { licencaFim: true } },
      },
    });
    if (!p) return;
    const base = {
      lodgeId,
      userId: p.userId,
      link: "/solicitacoes/afastamento",
      type: "PENDING_SIGNATURE" as const,
    };
    if (etapa === "indeferido") {
      await notificarEvento(prisma, {
        ...base,
        type: "DEADLINE_WARNING",
        sourceKey: `evento:afastamento:${pedidoId}:indeferido`,
        title: "Seu pedido de afastamento foi indeferido",
        description: `Parecer da Loja: ${p.parecer ?? "—"}`,
      });
      return;
    }
    if (etapa === "enviado") {
      const fim = p.user.licencaFim ? ` Fim previsto da licença: ${fmt(p.user.licencaFim)}.` : "";
      await notificarEvento(prisma, {
        ...base,
        sourceKey: `evento:afastamento:${pedidoId}:enviado`,
        title: "Form. 116 enviado à Guarda dos Selos — você está LICENCIADO",
        description: `O pedido de licença por ${p.dias} dias foi enviado à Guarda dos Selos e sua situação passou a LICENCIADO.${fim}`,
      });
      return;
    }
    const etapaSig = p.signedByMasterAt ? "vm" : p.signedBySecAt ? "sec" : null;
    if (!etapaSig) return;
    await notificarEvento(prisma, {
      ...base,
      sourceKey: `evento:afastamento:${pedidoId}:${etapaSig}`,
      title:
        etapaSig === "vm"
          ? "Form. 116: o Venerável Mestre assinou"
          : "Form. 116: o Secretário assinou",
      description:
        etapaSig === "vm"
          ? "O Form. 116 está assinado pelos dois cargos — a Secretaria fará o envio à Guarda dos Selos."
          : "O Secretário assinou o Form. 116 no gov.br — agora está com o Venerável Mestre.",
    });
  } catch (e) {
    logError("evento.afastamento", e, { pedidoId });
  }
}

// ── Processo genérico concluído → quem abriu ──
export async function eventoProcessoConcluido(lodgeId: string, processoId: string) {
  try {
    const d = await prisma.processoDocumento.findUnique({
      where: { id: processoId, lodgeId },
      select: { titulo: true, criadoPorId: true, status: true },
    });
    if (!d || d.status !== "ASSINADO") return;
    await notificarEvento(prisma, {
      lodgeId,
      userId: d.criadoPorId,
      sourceKey: `evento:processo:${processoId}:concluido`,
      type: "PENDING_SIGNATURE",
      title: `Processo concluído: ${d.titulo}`,
      description: "Toda a cadeia assinou via gov.br — o documento está pronto para envio em Processos.",
      link: linkProcessos(`processo-${processoId}`),
    });
  } catch (e) {
    logError("evento.processo", e, { processoId });
  }
}

// ── Ata: avisa o outro assinante quando um deles assina ──
export async function eventoAtaAssinada(
  lodgeId: string,
  ataId: string,
  assinou: "VENERAVEL_MESTRE" | "SECRETARIO"
) {
  try {
    const ata = await prisma.ata.findUnique({
      where: { id: ataId, lodgeId },
      select: { number: true, status: true },
    });
    if (!ata) return;
    const outro = assinou === "VENERAVEL_MESTRE" ? "SECRETARIO" : "VENERAVEL_MESTRE";
    const quem = assinou === "VENERAVEL_MESTRE" ? "O Venerável Mestre" : "O Secretário";
    const ids = await usuariosDoCargo(prisma, lodgeId, outro);
    for (const userId of ids) {
      await notificarEvento(prisma, {
        lodgeId,
        userId,
        sourceKey: `evento:ata:${ataId}:${assinou === "VENERAVEL_MESTRE" ? "vm" : "sec"}:${userId}`,
        type: "PENDING_SIGNATURE",
        title: `Ata nº ${ata.number}: ${quem.toLowerCase()} assinou`,
        description:
          ata.status === "ASSINADA"
            ? `${quem} assinou — a ata está selada pelos dois cargos.`
            : `${quem} assinou a Ata nº ${ata.number} — agora é a sua vez.`,
        link: `/secretaria/atas/${ataId}`,
      });
    }
  } catch (e) {
    logError("evento.ata", e, { ataId });
  }
}
