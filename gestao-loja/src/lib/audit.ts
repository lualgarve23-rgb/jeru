import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";

// Grava um evento na trilha de auditoria. Nunca derruba a operação
// principal: falha de auditoria vira log de erro, não exceção.
//
// Convenção de `acao`: "<dominio>.<verbo>" — ex.: "membro.criar",
// "membro.grau", "mensalidade.baixa", "loja.config-gmail", "admin.restore".
// `detalhes` guarda só campos relevantes e NUNCA segredos.

export type Ator = { id: string; name: string } | "webhook" | "cron";

export async function auditar(evento: {
  lodgeId: string | null;
  ator: Ator;
  acao: string;
  entidade?: string;
  entidadeId?: string;
  detalhes?: Prisma.InputJsonValue;
}) {
  const { ator } = evento;
  const sistema = typeof ator === "string";
  try {
    await prisma.auditEvent.create({
      data: {
        lodgeId: evento.lodgeId,
        userId: sistema ? null : ator.id,
        userName: sistema ? (ator === "webhook" ? "Webhook" : "Cron") : ator.name,
        acao: evento.acao,
        entidade: evento.entidade,
        entidadeId: evento.entidadeId,
        detalhes: evento.detalhes,
      },
    });
  } catch (e) {
    console.error("[auditoria] falha ao gravar evento", evento.acao, e);
  }
}
