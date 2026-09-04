import { NotificationType, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { proximoCargoQuitte, cargoAssinanteQuitte } from "@/lib/quitte";
import { INTERSTICE_MONTHS } from "@/lib/permissions";
import { degreeLabels } from "@/lib/labels";
import { cargoLabel, cargosProcesso } from "@/lib/processos";
import {
  frequenciaAnual,
  MIN_SESSOES_PARA_ALERTA,
} from "@/lib/frequencia";

// Prazo legal de comunicação pós-Sessão Magna (loja.md §3)
export const COMMUNICATION_DEADLINE_DAYS = 15;

// Antecedência dos alertas de aniversário (obreiro e familiares)
export const BIRTHDAY_ALERT_DAYS = 3;

type Pending = {
  sourceKey: string;
  type: NotificationType;
  title: string;
  description: string;
  link?: string;
  dueDate?: Date;
  // Notificação dirigida a um usuário específico (ex.: Esmoler)
  userId?: string;
};

function addDays(d: Date, days: number) {
  const r = new Date(d);
  r.setDate(r.getDate() + days);
  return r;
}

function addMonths(d: Date, months: number) {
  const r = new Date(d);
  r.setMonth(r.getMonth() + months);
  return r;
}

// Varre as fontes de pendências da loja e devolve o estado esperado
// da central de notificações (uma entrada por sourceKey).
async function collectPending(lodgeId: string): Promise<Pending[]> {
  const now = new Date();
  const [atas, placets, members, magnas, progressoes, atestados, processos, afastamentos] = await Promise.all([
    prisma.ata.findMany({
      where: { lodgeId, status: "AGUARDANDO_ASSINATURAS" },
      include: { session: { select: { date: true } } },
    }),
    prisma.quittePlacet.findMany({
      where: { lodgeId, status: { in: ["PENDENTE", "EM_ANALISE"] } },
      include: { user: { select: { name: true, cim: true } } },
    }),
    prisma.user.findMany({
      where: { lodgeId, status: "ATIVO" },
      select: {
        id: true,
        name: true,
        cim: true,
        degree: true,
        initiationDate: true,
        phone: true,
        birthDate: true,
        degreeHistory: { orderBy: { date: "desc" }, take: 1 },
      },
    }),
    prisma.lodgeSession.findMany({
      where: {
        lodgeId,
        type: "MAGNA",
        date: { gte: addDays(now, -COMMUNICATION_DEADLINE_DAYS), lte: now },
      },
    }),
    prisma.processoProgressao.findMany({
      where: {
        lodgeId,
        status: "COMUNICACAO_POS_CERIMONIA",
        comunicadoEnviado: false,
      },
      include: { user: { select: { name: true } } },
    }),
    prisma.atestadoRegularidade.findMany({
      where: { lodgeId, status: "SOLICITADO" },
      include: { user: { select: { name: true, cim: true } } },
    }),
    prisma.processoDocumento.findMany({
      where: { lodgeId, status: "EM_ASSINATURA" },
      select: {
        id: true,
        titulo: true,
        createdAt: true,
        assinantes: {
          orderBy: { ordem: "asc" },
          select: { ordem: true, cargo: true, signedAt: true },
        },
      },
    }),
    prisma.pedidoAfastamento.findMany({
      where: {
        lodgeId,
        OR: [
          { status: { in: ["AGUARDANDO_OBREIRO", "SOLICITADO", "EM_ASSINATURA"] } },
          { status: "ASSINADO", enviadoAt: null },
        ],
      },
      select: {
        id: true,
        userId: true,
        status: true,
        dias: true,
        createdAt: true,
        signedBySecAt: true,
        user: { select: { name: true, cim: true } },
      },
    }),
  ]);

  const pending: Pending[] = [];

  // Pedidos de Afastamento (Form. 116) — cada etapa gera a sua notificação
  // (a etapa compõe a sourceKey): lembrete pessoal ao irmão para assinar o
  // requerimento; à gestão, deliberação/registro da sessão, assinaturas
  // (Secretário → VM) e envio à Guarda dos Selos.
  for (const p of afastamentos) {
    const quem = `${p.user.name} (CIM ${p.user.cim})`;
    const aberto = p.createdAt.toLocaleDateString("pt-BR");
    if (p.status === "AGUARDANDO_OBREIRO") {
      pending.push({
        sourceKey: `afastamento:${p.id}:obreiro`,
        userId: p.userId,
        type: "PENDING_SIGNATURE",
        title: "Assine o seu requerimento de afastamento no gov.br",
        description: `O pedido de licença por ${p.dias} dias, aberto em ${aberto}, só chega à Secretaria depois da sua assinatura gov.br.`,
        link: "/solicitacoes/afastamento",
      });
    } else if (p.status === "SOLICITADO") {
      pending.push({
        sourceKey: `afastamento:${p.id}:sessao`,
        type: "MISSING_DATA",
        title: `Pedido de afastamento de ${p.user.name} aguarda deliberação`,
        description: `${quem} requereu licença por ${p.dias} dias (requerimento assinado gov.br em ${aberto}). Após a sessão, registre a data e o artigo em Processos para gerar o Form. 116.`,
        link: "/secretaria/processos",
      });
    } else if (p.status === "EM_ASSINATURA") {
      const cargo = p.signedBySecAt
        ? { key: "vm", label: "Venerável Mestre" }
        : { key: "sec", label: "Secretário" };
      pending.push({
        sourceKey: `afastamento:${p.id}:${cargo.key}`,
        type: "PENDING_SIGNATURE",
        title: `Form. 116 de ${p.user.name} aguarda assinatura do ${cargo.label}`,
        description: `Pedido de afastamento de ${quem} — é a vez do ${cargo.label} assinar o Form. 116 no gov.br (ordem: Secretário e Venerável Mestre).`,
        link: "/secretaria/processos",
      });
    } else {
      pending.push({
        sourceKey: `afastamento:${p.id}:envio`,
        type: "DEADLINE_WARNING",
        title: `Form. 116 de ${p.user.name} pronto para envio à Guarda dos Selos`,
        description: `Assinado pelos dois cargos — envie em Processos; ao enviar, ${p.user.name} passa a LICENCIADO.`,
        link: "/secretaria/processos",
      });
    }
  }

  // Assinaturas pendentes (dupla assinatura VM + Secretário)
  for (const ata of atas) {
    const faltam = [
      !ata.signedByMasterId && "Venerável",
      !ata.signedBySecId && "Secretário",
    ]
      .filter(Boolean)
      .join(" e ");
    pending.push({
      sourceKey: `ata:${ata.id}`,
      type: "PENDING_SIGNATURE",
      title: `Ata nº ${ata.number} aguarda assinatura`,
      description: `Sessão de ${ata.session.date.toLocaleDateString("pt-BR")} — falta assinar: ${faltam}.`,
      link: `/secretaria/atas/${ata.id}`,
    });
  }

  // Atestados de Regularidade — ordem de governança Tesoureiro → Secretário
  // → Venerável Mestre. A notificação aponta o cargo da vez e é recriada a
  // cada avanço na cadeia (o cargo compõe a sourceKey).
  for (const at of atestados) {
    const cargo = !at.signedByTesAt
      ? { key: "tes", role: "TESOUREIRO", label: "Tesoureiro" }
      : !at.signedBySecAt
        ? { key: "sec", role: "SECRETARIO", label: "Secretário" }
        : { key: "vm", role: "VENERAVEL_MESTRE", label: "Venerável Mestre" };
    pending.push({
      sourceKey: `atestado:${at.id}:${cargo.key}`,
      type: "PENDING_SIGNATURE",
      title: `Atestado de ${at.user.name} aguarda assinatura do ${cargo.label}`,
      description: `Atestado de Regularidade solicitado em ${at.solicitadoAt.toLocaleDateString("pt-BR")} (CIM ${at.user.cim}) — é a vez do ${cargo.label} assinar (ordem: Tesoureiro, Secretário e Venerável Mestre).`,
      link: "/secretaria/processos",
    });
  }

  // Processos (pranchas, formulários GOB, ofícios) — cadeia ordenada; a
  // notificação aponta o cargo da vez e é recriada a cada avanço (a ordem
  // do assinante compõe a sourceKey), como no atestado.
  // Quando a vez é de um cargo do rito (Orador/Vigilantes — nível Obreiro,
  // que não vê as notificações operacionais), a notificação é dirigida aos
  // usuários que ocupam o cargo, além da geral para a gestão.
  const obreirosRito = processos.some((d) =>
    ["ORADOR", "VIGILANTE_1", "VIGILANTE_2"].includes(
      d.assinantes.find((a) => !a.signedAt)?.cargo ?? ""
    )
  )
    ? await prisma.user.findMany({
        where: { lodgeId, status: "ATIVO", cargoRito: { not: null } },
        select: { id: true, currentRole: true, cargoRito: true },
      })
    : [];
  for (const doc of processos) {
    const proximo = doc.assinantes.find((a) => !a.signedAt);
    if (!proximo) continue;
    const label = cargoLabel(proximo.cargo);
    const base = {
      type: "PENDING_SIGNATURE" as const,
      title: `${doc.titulo} aguarda assinatura do ${label}`,
      description: `Processo aberto em ${doc.createdAt.toLocaleDateString("pt-BR")} — é a vez do ${label} assinar (${proximo.ordem}º de ${doc.assinantes.length} na cadeia; o Venerável Mestre assina por último).`,
      link: "/secretaria/processos",
    };
    pending.push({ sourceKey: `processo:${doc.id}:${proximo.ordem}`, ...base });
    for (const u of obreirosRito) {
      if (!cargosProcesso(u.currentRole, u.cargoRito).includes(proximo.cargo)) continue;
      pending.push({
        sourceKey: `processo:${doc.id}:${proximo.ordem}:${u.id}`,
        userId: u.id,
        ...base,
      });
    }
  }

  for (const qp of placets) {
    if (!qp.quitacaoFinanceira) {
      // Trava financeira: emissão bloqueada até o Nada Consta da Tesouraria
      pending.push({
        sourceKey: `qp-fin:${qp.id}`,
        type: "FINANCIAL_APPROVAL",
        title: `Quitte Placet de ${qp.user.name} sem quitação financeira`,
        description:
          "A emissão está travada até a Tesouraria confirmar o Nada Consta.",
        link: "/secretaria/quitte-placets",
      });
    } else if (!qp.dataSessaoComunicacao || !qp.ataNome) {
      pending.push({
        sourceKey: `qp-sessao:${qp.id}`,
        type: "MISSING_DATA",
        title: `Quitte Placet de ${qp.user.name}: registrar a sessão de comunicação`,
        description:
          "Informe em Processos a data da sessão em que o pedido foi comunicado à Loja e anexe a ata — as assinaturas gov.br só liberam depois.",
        link: "/secretaria/processos",
      });
    } else if (!qp.signedByMasterId || !qp.signedBySecId || !qp.signedByOradorId) {
      // A vez de cada cargo compõe a sourceKey (recriada a cada avanço);
      // quando é a vez do Orador (cargo do rito, geralmente nível Obreiro,
      // sem acesso às notificações operacionais), a notificação também é
      // dirigida a quem ocupa o cargo — como nos Processos.
      const proximo = proximoCargoQuitte(qp) ?? "VENERAVEL_MESTRE";
      const base = {
        type: "PENDING_SIGNATURE" as const,
        title: `Quitte Placet de ${qp.user.name} aguarda assinatura do ${cargoAssinanteQuitte(proximo)}`,
        description: `Quitação financeira confirmada — é a vez do ${cargoAssinanteQuitte(proximo)} assinar na aba Processos (ordem: Secretário, Orador e Venerável Mestre).`,
        link: "/secretaria/processos",
      };
      pending.push({ sourceKey: `qp-sig:${qp.id}:${proximo}`, ...base });
      if (proximo === "ORADOR") {
        const oradores = await prisma.user.findMany({
          where: { lodgeId, status: "ATIVO", cargoRito: { not: null } },
          select: { id: true, currentRole: true, cargoRito: true },
        });
        for (const u of oradores) {
          if (!cargosProcesso(u.currentRole, u.cargoRito).includes("ORADOR")) continue;
          pending.push({ sourceKey: `qp-sig:${qp.id}:${proximo}:${u.id}`, userId: u.id, ...base });
        }
      }
    }
  }

  // Interstícios cumpridos (aptos a elevação/exaltação)
  for (const m of members) {
    const nextDegree =
      m.degree === "APRENDIZ"
        ? "COMPANHEIRO"
        : m.degree === "COMPANHEIRO"
          ? "MESTRE"
          : null;
    if (nextDegree) {
      const base = m.degreeHistory[0]?.date ?? m.initiationDate;
      if (base) {
        const eligible = addMonths(base, INTERSTICE_MONTHS[nextDegree]);
        if (eligible <= now) {
          pending.push({
            sourceKey: `intersticio:${m.id}:${nextDegree}`,
            type: "DEADLINE_WARNING",
            title: `${m.name} cumpriu o interstício para ${degreeLabels[nextDegree] ?? nextDegree}`,
            description: `Apto desde ${eligible.toLocaleDateString("pt-BR")} (CIM ${m.cim}). Verifique frequência e proficiência para iniciar a progressão.`,
            link: `/secretaria/membros/${m.id}`,
          });
        }
      }
    }
    // Auditoria cadastral: dados que bloqueiam as plataformas oficiais
    const faltando = [
      !m.initiationDate && "data de iniciação",
      !m.phone && "telefone",
    ]
      .filter(Boolean)
      .join(" e ");
    if (faltando) {
      pending.push({
        sourceKey: `cadastro:${m.id}`,
        type: "MISSING_DATA",
        title: `Cadastro incompleto: ${m.name}`,
        description: `Falta ${faltando} (CIM ${m.cim}).`,
        link: `/secretaria/membros/${m.id}`,
      });
    }
  }

  // Prazo de 15 dias de comunicação pós-Sessão Magna
  for (const s of magnas) {
    const due = addDays(s.date, COMMUNICATION_DEADLINE_DAYS);
    pending.push({
      sourceKey: `magna-15d:${s.id}`,
      type: "DEADLINE_WARNING",
      title: "Prazo de 15 dias: comunicação da Sessão Magna",
      description: `Sessão Magna de ${s.date.toLocaleDateString("pt-BR")} — envie matéria e fotos (2 a 10) ao portal institucional até ${due.toLocaleDateString("pt-BR")}.`,
      link: "/secretaria/sessoes",
      dueDate: due,
    });
  }

  // Comunicação de 15 dias da cerimônia de progressão (Elevação/Exaltação)
  for (const p of progressoes) {
    const due = addDays(p.dataCerimonia ?? p.updatedAt, COMMUNICATION_DEADLINE_DAYS);
    pending.push({
      sourceKey: `prog-15d:${p.id}`,
      type: "DEADLINE_WARNING",
      title: `Prazo de 15 dias: comunicação da progressão de ${p.user.name}`,
      description: `Envie matéria e fotos (2 a 10) ao portal "Sua Sessão no GOB-SP" até ${due.toLocaleDateString("pt-BR")} e marque a comunicação como enviada no Kanban.`,
      link: "/secretaria/progressoes",
      dueDate: due,
    });
  }

  // Frequência anual vs. mínimo da Loja (minFreqProgressao)
  const [esmoleres, lodge] = await Promise.all([
    prisma.user.findMany({
      where: { lodgeId, currentRole: "ESMOLER", status: "ATIVO" },
      select: { id: true },
    }),
    prisma.lodge.findUniqueOrThrow({
      where: { id: lodgeId },
      select: { limiteInadimplencia: true, minFreqProgressao: true },
    }),
  ]);
  const ano = now.getFullYear();
  const freq = await frequenciaAnual(lodgeId, ano);
  const freqBaixa = freq.filter(
    (f) =>
      f.sessoesComputadas >= MIN_SESSOES_PARA_ALERTA &&
      f.percentual !== null &&
      f.percentual < lodge.minFreqProgressao
  );

  // Risco legal: Aprendiz/Companheiro abaixo do mínimo atrasa o interstício.
  // Uma notificação da loja (visível a VM/Secretário) e uma dirigida ao irmão.
  for (const f of freqBaixa) {
    if (f.degree === "MESTRE") continue;
    const resumo = `${f.percentual}% de presença em ${ano} (${f.presencas} de ${f.sessoesComputadas} sessões) — mínimo da Loja: ${lodge.minFreqProgressao}%.`;
    pending.push({
      sourceKey: `freq-risco:${f.userId}:${ano}`,
      type: "DEADLINE_WARNING",
      title: `Frequência baixa de ${f.name}: risco de atraso no interstício`,
      description: `${resumo} Abaixo do mínimo, a progressão de grau pode ser adiada.`,
      link: `/secretaria/membros/${f.userId}`,
    });
    pending.push({
      sourceKey: `freq-risco-self:${f.userId}:${ano}`,
      type: "DEADLINE_WARNING",
      userId: f.userId,
      title: "Sua frequência está abaixo do mínimo da Loja",
      description: `${resumo} A frequência mínima é requisito legal para a progressão de grau — procure regularizar sua presença nas sessões.`,
      link: "/dashboard",
    });
  }

  // Alertas do Esmoler (Hospitaleiro): contato preventivo com os irmãos
  if (esmoleres.length > 0) {
    // Inadimplência prestes a atingir o limite (limite - 1 capitações vencidas)
    const overdue = await prisma.invoice.groupBy({
      by: ["userId"],
      where: { lodgeId, status: "VENCIDA" },
      _count: { _all: true },
    });
    const quaseNoLimite = overdue.filter(
      (o) => o._count._all === lodge.limiteInadimplencia - 1
    );
    const nomes = quaseNoLimite.length
      ? new Map(
          (
            await prisma.user.findMany({
              where: { id: { in: quaseNoLimite.map((o) => o.userId) } },
              select: { id: true, name: true },
            })
          ).map((u) => [u.id, u.name])
        )
      : new Map<string, string>();
    for (const o of quaseNoLimite) {
      const nome = nomes.get(o.userId);
      if (!nome) continue;
      for (const e of esmoleres) {
        pending.push({
          sourceKey: `esmoler-fin:${e.id}:${o.userId}`,
          type: "FINANCIAL_APPROVAL",
          userId: e.id,
          title: `Esmoler: ${nome} próximo do limite de inadimplência`,
          description: `${o._count._all} capitação(ões) vencida(s) — no limite de ${lodge.limiteInadimplencia} o irmão passa a IRREGULAR. Vale um contato preventivo.`,
          link: "/secretaria/membros",
        });
      }
    }

    // Frequência abaixo do mínimo da Loja (qualquer grau — bem-estar)
    for (const f of freqBaixa) {
      for (const e of esmoleres) {
        if (e.id === f.userId) continue;
        pending.push({
          sourceKey: `esmoler-freq:${e.id}:${f.userId}:${ano}`,
          type: "DEADLINE_WARNING",
          userId: e.id,
          title: `Esmoler: frequência baixa de ${f.name}`,
          description: `${f.percentual}% de presença em ${ano} (${f.presencas} de ${f.sessoesComputadas} sessões) — mínimo da Loja: ${lodge.minFreqProgressao}%. Vale verificar como o irmão está.`,
          link: "/secretaria/membros",
        });
      }
    }
  }

  // Aniversários (obreiro, cônjuge e filhos): alerta da véspera até o dia,
  // visível a toda a Loja (VM, Secretário, 2º Vigilante e demais irmãos).
  const familiares = await prisma.familyMember.findMany({
    where: { user: { lodgeId, status: "ATIVO" }, birthDate: { not: null } },
    include: { user: { select: { name: true } } },
  });
  const aniversariantes: {
    key: string;
    nome: string;
    quem: string;
    birthDate: Date;
  }[] = [
    ...members
      .filter((m) => m.birthDate)
      .map((m) => ({
        key: `user:${m.id}`,
        nome: m.name,
        quem: `do Ir∴ ${m.name}`,
        birthDate: m.birthDate as Date,
      })),
    ...familiares.map((f) => ({
      key: `fam:${f.id}`,
      nome: f.name,
      quem:
        f.parentesco === "CONJUGE"
          ? `de ${f.name}, cônjuge do Ir∴ ${f.user.name}`
          : f.parentesco === "FILHO"
            ? `de ${f.name}, filho(a) do Ir∴ ${f.user.name}`
            : `de ${f.name}, dependente do Ir∴ ${f.user.name}`,
      birthDate: f.birthDate as Date,
    })),
  ];
  for (const a of aniversariantes) {
    // Próxima ocorrência do aniversário (UTC, como as datas são gravadas)
    const mes = a.birthDate.getUTCMonth();
    const dia = a.birthDate.getUTCDate();
    let proximo = new Date(Date.UTC(now.getFullYear(), mes, dia));
    if (proximo < addDays(now, -1)) {
      proximo = new Date(Date.UTC(now.getFullYear() + 1, mes, dia));
    }
    const diasAte = Math.ceil(
      (proximo.getTime() - now.getTime()) / 86_400_000
    );
    if (diasAte > BIRTHDAY_ALERT_DAYS) continue;
    const quando =
      diasAte <= 0
        ? "é hoje!"
        : diasAte === 1
          ? "é amanhã"
          : `é ${proximo.toLocaleDateString("pt-BR", { timeZone: "UTC" })}`;
    pending.push({
      sourceKey: `bday:${a.key}:${proximo.getUTCFullYear()}`,
      type: "BIRTHDAY",
      title: `🎂 Aniversário ${a.quem}`,
      description: `O aniversário ${quando} (${String(dia).padStart(2, "0")}/${String(mes + 1).padStart(2, "0")}). Não deixe de parabenizar!`,
      dueDate: proximo,
    });
  }

  // Mútua (CABM): irmãos do quadro sem a Declaração de Beneficiários
  // (Form. 108) — lembrete pessoal a cada um e alerta agregado à gestão.
  // Filiados ficam de fora (entregam na loja-mãe). Resolve-se sozinho pelo
  // sync quando a entrega (ou a marcação de entrega anterior) é registrada.
  const mutuaPendentes = await prisma.user.findMany({
    where: {
      lodgeId,
      status: { not: "EX_MEMBRO" },
      filiado: false,
      currentRole: { not: "SUPER_ADMIN" },
      mutuaEntrega: null,
    },
    select: { id: true, name: true, cim: true },
  });
  for (const m of mutuaPendentes) {
    pending.push({
      sourceKey: `mutua-self:${m.id}`,
      type: "MISSING_DATA",
      userId: m.id,
      title: "Mútua: entregue sua Declaração de Beneficiários",
      description:
        "Você ainda não entregou o Form. 108 (Declaração de Beneficiários da Mútua/CABM). Baixe o formulário pré-preenchido, assine com firma reconhecida e envie pela seção Mútua.",
      link: "/dashboard/mutua",
    });
  }
  if (mutuaPendentes.length > 0) {
    pending.push({
      // A quantidade compõe a chave: o alerta é recriado quando o nº muda
      sourceKey: `mutua-pendentes:${mutuaPendentes.length}`,
      type: "MISSING_DATA",
      title: `Mútua: ${mutuaPendentes.length} irmão(s) sem a Declaração de Beneficiários`,
      description: `Ainda não entregaram o Form. 108: ${mutuaPendentes
        .slice(0, 15)
        .map((m) => `${m.name} (CIM ${m.cim})`)
        .join(", ")}${
        mutuaPendentes.length > 15
          ? ` e mais ${mutuaPendentes.length - 15} — veja a lista completa na seção Mútua`
          : ""
      }.`,
      link: "/dashboard/mutua",
    });
  }

  return pending;
}

// Sincroniza a central: cria notificações novas para pendências detectadas
// e remove as não lidas cuja origem já foi resolvida. Idempotente por sourceKey.
export async function syncLodgeNotifications(lodgeId: string) {
  const pending = await collectPending(lodgeId);
  const keys = pending.map((p) => p.sourceKey);

  const existing = await prisma.notification.findMany({
    where: { lodgeId, sourceKey: { not: null } },
    select: { sourceKey: true },
  });
  const existingKeys = new Set(existing.map((e) => e.sourceKey));

  const toCreate = pending.filter((p) => !existingKeys.has(p.sourceKey));

  await prisma.$transaction([
    // pendência resolvida → limpa alerta ainda não lido
    prisma.notification.deleteMany({
      where: {
        lodgeId,
        isRead: false,
        sourceKey: { not: null, notIn: keys.length ? keys : ["__none__"] },
      },
    }),
    ...(toCreate.length
      ? [
          prisma.notification.createMany({
            data: toCreate.map((p) => ({
              lodgeId,
              title: p.title,
              description: p.description,
              type: p.type,
              sourceKey: p.sourceKey,
              link: p.link ?? null,
              dueDate: p.dueDate ?? null,
              userId: p.userId ?? null,
            })),
            skipDuplicates: true,
          }),
        ]
      : []),
  ] as Prisma.PrismaPromise<unknown>[]);
}

// Papéis que enxergam as notificações operacionais da loja
export const NOTIFICATION_VIEWERS = [
  "VENERAVEL_MESTRE",
  "SECRETARIO",
  "TESOUREIRO",
  "CONSELHO_CONTAS",
];

export function notificationWhere(user: {
  lodgeId: string;
  id: string;
  role: string;
}) {
  // Obreiro comum vê as notificações endereçadas a ele e os aniversários
  // da Loja (obreiros e familiares) — os demais alertas operacionais ficam
  // restritos a VM/Secretário/Tesoureiro/Conselho.
  return NOTIFICATION_VIEWERS.includes(user.role)
    ? { lodgeId: user.lodgeId, OR: [{ userId: null }, { userId: user.id }] }
    : {
        lodgeId: user.lodgeId,
        OR: [
          { userId: user.id },
          { userId: null, type: NotificationType.BIRTHDAY },
        ],
      };
}

export async function unreadCount(user: {
  lodgeId: string;
  id: string;
  role: string;
}) {
  return prisma.notification.count({
    where: { ...notificationWhere(user), isRead: false },
  });
}
