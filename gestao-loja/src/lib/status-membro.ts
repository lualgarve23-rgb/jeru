import type { MemberStatus, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { auditar, type Ator } from "@/lib/audit";
import { logError, logInfo } from "@/lib/log";
import { cancelSubscription } from "@/lib/asaas";
import { inicioDoDiaSaoPaulo } from "@/lib/datas-sp";
import { notificarEvento, usuariosDoCargo } from "@/lib/notificar-evento";

type Db = Prisma.TransactionClient | typeof prisma;

export const statusLabels: Record<MemberStatus, string> = {
  ATIVO: "Ativo",
  IRREGULAR: "Irregular (inadimplente)",
  LICENCIADO: "Licenciado",
  EX_MEMBRO: "Ex-membro",
};

// Ponto ÚNICO de mudança MANUAL de situação do membro (Secretaria, envio do
// Form. 116, envio do Quitte Placet). Efeitos colaterais financeiros:
//  - status ≠ ATIVO com assinatura Asaas → cancela no gateway e zera o campo
//  - LICENCIADO/EX_MEMBRO → capitações PENDENTE ainda não vencidas viram
//    CANCELADA (as já vencidas continuam devidas)
//  - grava statusManualAt/statusMotivo para o sync de inadimplência não
//    desfazer a decisão humana; licencaFim quando informado
//  - auditoria e notificações ao Tesoureiro, ao Esmoler e ao próprio irmão
export async function mudarStatusMembro(
  db: Db,
  args: {
    userId: string;
    lodgeId: string;
    novoStatus: MemberStatus;
    motivo: string;
    porUserId: string;
    porNome?: string;
    licencaFim?: Date | null;
  }
): Promise<{ alterado: boolean; anterior: MemberStatus }> {
  const membro = await db.user.findUnique({
    where: { id: args.userId, lodgeId: args.lodgeId },
    select: { id: true, name: true, status: true, asaasSubscriptionId: true },
  });
  if (!membro) throw new Error("Membro não encontrado nesta Loja.");
  const anterior = membro.status;
  if (anterior === args.novoStatus) return { alterado: false, anterior };

  const agora = new Date();
  let assinaturaCancelada = false;
  if (args.novoStatus !== "ATIVO" && membro.asaasSubscriptionId) {
    try {
      const lodge = await db.lodge.findUniqueOrThrow({
        where: { id: args.lodgeId },
        select: { asaasApiKey: true },
      });
      const { openSecret } = await import("@/lib/secrets");
      const apiKey = openSecret(lodge.asaasApiKey);
      if (apiKey) {
        await cancelSubscription(apiKey, membro.asaasSubscriptionId);
        assinaturaCancelada = true;
      }
    } catch (e) {
      logError("status-membro.cancelar-assinatura", e, {
        userId: membro.id,
        assinatura: membro.asaasSubscriptionId,
      });
    }
  }

  await db.user.update({
    where: { id: membro.id, lodgeId: args.lodgeId },
    data: {
      status: args.novoStatus,
      statusManualAt: agora,
      statusMotivo: args.motivo,
      licencaFim: args.novoStatus === "LICENCIADO" ? (args.licencaFim ?? null) : null,
      // zera mesmo se o cancelamento no gateway falhou: o membro não deve
      // mais ser cobrado por aqui (o Tesoureiro é avisado abaixo)
      ...(args.novoStatus !== "ATIVO" && membro.asaasSubscriptionId
        ? { asaasSubscriptionId: null }
        : {}),
    },
  });

  let canceladas = 0;
  if (args.novoStatus === "LICENCIADO" || args.novoStatus === "EX_MEMBRO") {
    const r = await db.invoice.updateMany({
      where: {
        lodgeId: args.lodgeId,
        userId: membro.id,
        status: "PENDENTE",
        dueDate: { gte: inicioDoDiaSaoPaulo(agora) },
      },
      data: { status: "CANCELADA" },
    });
    canceladas = r.count;
  }

  const ator: Ator = { id: args.porUserId, name: args.porNome ?? "Sistema" };
  await auditar({
    lodgeId: args.lodgeId,
    ator,
    acao: "membro.status",
    entidade: "User",
    entidadeId: membro.id,
    detalhes: {
      de: anterior,
      para: args.novoStatus,
      motivo: args.motivo,
      assinaturaAsaas: membro.asaasSubscriptionId ?? undefined,
      assinaturaCancelada,
      capitacoesCanceladas: canceladas,
      licencaFim: args.licencaFim?.toISOString(),
    },
  });

  const ts = agora.getTime();
  const base = `status:${membro.id}:${args.novoStatus}:${ts}`;
  const de = statusLabels[anterior];
  const para = statusLabels[args.novoStatus];
  const fimLic =
    args.novoStatus === "LICENCIADO" && args.licencaFim
      ? ` Licença até ${args.licencaFim.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })}.`
      : "";
  const extrasTes =
    (membro.asaasSubscriptionId
      ? assinaturaCancelada
        ? " Assinatura recorrente no Asaas cancelada."
        : " ATENÇÃO: não foi possível cancelar a assinatura no Asaas — cancele manualmente no painel do gateway."
      : "") + (canceladas ? ` ${canceladas} capitação(ões) pendente(s) cancelada(s).` : "");

  const [tesoureiros, esmoleres] = await Promise.all([
    usuariosDoCargo(db, args.lodgeId, "TESOUREIRO"),
    usuariosDoCargo(db, args.lodgeId, "ESMOLER"),
  ]);
  for (const id of tesoureiros) {
    await notificarEvento(db, {
      lodgeId: args.lodgeId,
      sourceKey: `${base}:tes:${id}`,
      userId: id,
      type: "FINANCIAL_APPROVAL",
      title: `${membro.name}: ${de} → ${para}`,
      description: `Motivo: ${args.motivo}.${fimLic}${extrasTes}`,
      link: `/tesouraria/mensalidades`,
    });
  }
  for (const id of esmoleres) {
    await notificarEvento(db, {
      lodgeId: args.lodgeId,
      sourceKey: `${base}:esm:${id}`,
      userId: id,
      type: "DEADLINE_WARNING",
      title: `${membro.name}: ${de} → ${para}`,
      description: `Motivo: ${args.motivo}.${fimLic}`,
      link: `/secretaria/membros/${membro.id}`,
    });
  }
  await notificarEvento(db, {
    lodgeId: args.lodgeId,
    sourceKey: `${base}:self`,
    userId: membro.id,
    type: "DEADLINE_WARNING",
    title: `Sua situação na Loja passou a ${para}`,
    description:
      `Situação anterior: ${de}. Motivo: ${args.motivo}.${fimLic}` +
      (canceladas ? ` ${canceladas} capitação(ões) ainda não vencida(s) foi(ram) cancelada(s).` : "") +
      " Em caso de dúvida, procure a Secretaria.",
    link: `/tesouraria/mensalidades`,
  });

  logInfo("status-membro", { userId: membro.id, de: anterior, para: args.novoStatus, motivo: args.motivo });
  return { alterado: true, anterior };
}
