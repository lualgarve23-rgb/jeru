import type { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { roleLabels } from "@/lib/labels";

// Processos — motor genérico de cadeia ordenada de assinaturas gov.br.
// Generaliza o padrão de ordemAssinaturaAtestado: o Secretário monta a ordem
// dos cargos assinantes por documento e o Venerável Mestre é SEMPRE o último
// (é ele quem sela o documento). Assinaturas exclusivamente gov.br, embutidas
// no PDF (PAdES) — OAuth do ITI ou upload do portal assinador.iti.br.

// Cargos que podem entrar na cadeia ANTES do Venerável Mestre. O gate de
// roles do fluxo OAuth (/api/govbr/*) cobre exatamente VM/Sec/Tes — ampliar
// esta lista exige ampliar aquele gate também.
export const CARGOS_PROCESSO: Role[] = ["SECRETARIO", "TESOUREIRO"];

export function cargoLabel(cargo: string) {
  return roleLabels[cargo as keyof typeof roleLabels] ?? cargo;
}

// Monta a cadeia a partir dos cargos escolhidos no formulário, na ordem dada:
// filtra inválidos, remove duplicatas e acrescenta o VM como último assinante.
export function montarCadeiaProcesso(cargos: string[]): Role[] {
  const cadeia: Role[] = [];
  for (const c of cargos) {
    if (
      CARGOS_PROCESSO.includes(c as Role) &&
      !cadeia.includes(c as Role)
    ) {
      cadeia.push(c as Role);
    }
  }
  cadeia.push("VENERAVEL_MESTRE");
  return cadeia;
}

export type AssinanteProcesso = {
  ordem: number;
  cargo: Role;
  signedAt: Date | null;
};

// Situação da cadeia para o cargo logado — mesmo contrato dos helpers de
// atestado/quitte: de quem é a vez, se já assinou e se a assinatura dele sela.
export function estadoProcesso(role: string, assinantes: AssinanteProcesso[]) {
  const ordenados = [...assinantes].sort((a, b) => a.ordem - b.ordem);
  const proximo = ordenados.find((a) => !a.signedAt) ?? null;
  const meu = ordenados.find((a) => a.cargo === role) ?? null;
  return {
    souAssinante: !!meu,
    jaAssinou: !!meu?.signedAt,
    minhaVez: !!proximo && proximo.cargo === role,
    // cargo que precisa assinar antes de mim (null quando é a minha vez)
    aguardando:
      proximo && meu && !meu.signedAt && proximo.cargo !== role
        ? cargoLabel(proximo.cargo)
        : null,
    proximoCargo: proximo ? cargoLabel(proximo.cargo) : null,
    // a assinatura do próximo conclui o documento?
    ultimaAssinatura:
      !!proximo && ordenados.every((a) => a.signedAt || a.ordem === proximo.ordem),
  };
}

// Ao concluir a última assinatura, sincroniza a prancha de origem (se houver):
// a versão assinada vira o govbrPdf da prancha, liberando o envio à G. Selos.
export async function concluirProcessoNaPrancha(
  documentoId: string,
  lodgeId: string
) {
  const doc = await prisma.processoDocumento.findUnique({
    where: { id: documentoId, lodgeId },
    select: { pranchaId: true, govbrPdf: true, status: true },
  });
  if (doc?.status === "ASSINADO" && doc.pranchaId && doc.govbrPdf) {
    await prisma.prancha.update({
      where: { id: doc.pranchaId, lodgeId },
      data: { govbrPdf: doc.govbrPdf, govbrSignedAt: new Date() },
    });
  }
}
