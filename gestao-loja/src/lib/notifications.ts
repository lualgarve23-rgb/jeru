import { NotificationType, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { INTERSTICE_MONTHS } from "@/lib/permissions";
import { degreeLabels } from "@/lib/labels";

// Prazo legal de comunicação pós-Sessão Magna (loja.md §3)
export const COMMUNICATION_DEADLINE_DAYS = 15;

type Pending = {
  sourceKey: string;
  type: NotificationType;
  title: string;
  description: string;
  link?: string;
  dueDate?: Date;
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
  const [atas, placets, members, magnas, progressoes] = await Promise.all([
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
  ]);

  const pending: Pending[] = [];

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
    } else if (!qp.signedByMasterId || !qp.signedBySecId) {
      pending.push({
        sourceKey: `qp-sig:${qp.id}`,
        type: "PENDING_SIGNATURE",
        title: `Quitte Placet de ${qp.user.name} aguarda assinatura`,
        description:
          "Quitação financeira confirmada — falta a dupla assinatura (VM + Secretário).",
        link: "/secretaria/quitte-placets",
      });
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
  // Obreiro comum só vê notificações endereçadas a ele
  return NOTIFICATION_VIEWERS.includes(user.role)
    ? { lodgeId: user.lodgeId, OR: [{ userId: null }, { userId: user.id }] }
    : { lodgeId: user.lodgeId, userId: user.id };
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
