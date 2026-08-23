import { prisma } from "@/lib/prisma";
import { arquivarVersaoFinalNoDrive, slugNome } from "@/lib/google-drive";
import { roleLabels } from "@/lib/labels";
import { cargoCorresponde } from "@/lib/cargos";

// Processos — motor genérico de cadeia ordenada de assinaturas gov.br.
// Generaliza o padrão de ordemAssinaturaAtestado: o Secretário monta a ordem
// dos cargos assinantes por documento e o Venerável Mestre é SEMPRE o último
// (é ele quem sela o documento). Assinaturas exclusivamente gov.br, embutidas
// no PDF (PAdES) — OAuth do ITI ou upload do portal assinador.iti.br.

// Cargos que podem entrar na cadeia ANTES do Venerável Mestre. Os três
// primeiros são níveis de acesso (enum Role); Orador e Vigilantes são cargos
// do rito (User.cargoRito), resolvidos por cargosProcessoDoUsuario().
export const CARGOS_PROCESSO = [
  "SECRETARIO",
  "TESOUREIRO",
  "ORADOR",
  "VIGILANTE_1",
  "VIGILANTE_2",
] as const;
export type CargoProcesso = (typeof CARGOS_PROCESSO)[number] | "VENERAVEL_MESTRE";

const LABELS_RITO: Record<string, string> = {
  ORADOR: "Orador",
  VIGILANTE_1: "1º Vigilante",
  VIGILANTE_2: "2º Vigilante",
};

export function cargoLabel(cargo: string) {
  return (
    LABELS_RITO[cargo] ?? roleLabels[cargo as keyof typeof roleLabels] ?? cargo
  );
}

// Chaves de cargo que um usuário pode assinar: o seu nível de acesso mais o
// cargo do rito cadastrado (Orador / 1º Vigilante / 2º Vigilante).
export function cargosProcesso(role: string, cargoRito?: string | null): string[] {
  const cargos = [role];
  if (cargoCorresponde(cargoRito, "Orador")) cargos.push("ORADOR");
  if (cargoCorresponde(cargoRito, "1º Vigilante")) cargos.push("VIGILANTE_1");
  if (cargoCorresponde(cargoRito, "2º Vigilante")) cargos.push("VIGILANTE_2");
  return cargos;
}

export async function cargosProcessoDoUsuario(user: { id: string; role: string }) {
  const u = await prisma.user.findUnique({
    where: { id: user.id },
    select: { cargoRito: true },
  });
  return cargosProcesso(user.role, u?.cargoRito);
}

// Monta a cadeia a partir dos cargos escolhidos no formulário, na ordem dada:
// filtra inválidos, remove duplicatas e acrescenta o VM como último assinante.
export function montarCadeiaProcesso(cargos: string[]): string[] {
  const cadeia: string[] = [];
  for (const c of cargos) {
    if ((CARGOS_PROCESSO as readonly string[]).includes(c) && !cadeia.includes(c)) {
      cadeia.push(c);
    }
  }
  cadeia.push("VENERAVEL_MESTRE");
  return cadeia;
}

export type AssinanteProcesso = {
  ordem: number;
  cargo: string;
  signedAt: Date | null;
};

// Cargo com que o usuário figura na cadeia (o primeiro dos seus cargos que
// aparece entre os assinantes), ou null se ele não é assinante.
export function meuCargoNaCadeia(
  cargos: string | string[],
  assinantes: AssinanteProcesso[]
): string | null {
  const lista = Array.isArray(cargos) ? cargos : [cargos];
  return lista.find((c) => assinantes.some((a) => a.cargo === c)) ?? null;
}

// Situação da cadeia para o usuário logado (um cargo ou a lista dos seus
// cargos) — mesmo contrato dos helpers de atestado/quitte: de quem é a vez,
// se já assinou e se a assinatura dele sela.
export function estadoProcesso(
  cargos: string | string[],
  assinantes: AssinanteProcesso[]
) {
  const ordenados = [...assinantes].sort((a, b) => a.ordem - b.ordem);
  const proximo = ordenados.find((a) => !a.signedAt) ?? null;
  const cargo = meuCargoNaCadeia(cargos, ordenados);
  const meu = cargo ? (ordenados.find((a) => a.cargo === cargo) ?? null) : null;
  return {
    cargo,
    souAssinante: !!meu,
    jaAssinou: !!meu?.signedAt,
    minhaVez: !!proximo && !!cargo && proximo.cargo === cargo,
    // cargo que precisa assinar antes de mim (null quando é a minha vez)
    aguardando:
      proximo && meu && !meu.signedAt && proximo.cargo !== cargo
        ? cargoLabel(proximo.cargo)
        : null,
    proximoCargo: proximo ? cargoLabel(proximo.cargo) : null,
    // a assinatura do próximo conclui o documento?
    ultimaAssinatura:
      !!proximo && ordenados.every((a) => a.signedAt || a.ordem === proximo.ordem),
  };
}

// Ao concluir a última assinatura: sincroniza a prancha de origem (se houver —
// a versão assinada vira o govbrPdf da prancha, liberando o envio à G. Selos)
// e arquiva a versão final no Drive da Loja, substituindo a preliminar da
// prancha. Devolve aviso (vazio se arquivou).
export async function concluirProcessoNaPrancha(
  documentoId: string,
  lodgeId: string,
  uploadedById: string
): Promise<string> {
  const doc = await prisma.processoDocumento.findUnique({
    where: { id: documentoId, lodgeId },
    select: {
      pranchaId: true,
      govbrPdf: true,
      status: true,
      titulo: true,
      driveFileId: true,
      prancha: { select: { number: true, year: true, driveFileId: true } },
    },
  });
  if (doc?.status !== "ASSINADO" || !doc.govbrPdf) return "";
  const pdf = Buffer.from(doc.govbrPdf);
  if (doc.pranchaId) {
    await prisma.prancha.update({
      where: { id: doc.pranchaId, lodgeId },
      data: { govbrPdf: doc.govbrPdf, govbrSignedAt: new Date() },
    });
  }
  if (doc.driveFileId) return "";
  const fileName = doc.prancha
    ? `prancha-${doc.prancha.number}-${doc.prancha.year}-assinada-govbr.pdf`
    : `processo-${slugNome(doc.titulo)}-${documentoId.slice(-6)}-assinado-govbr.pdf`;
  const r = await arquivarVersaoFinalNoDrive({
    lodgeId,
    uploadedById,
    fileName,
    title: doc.prancha
      ? `Prancha nº ${doc.prancha.number}/${doc.prancha.year} — ${doc.titulo} (assinada gov.br)`
      : `${doc.titulo} (assinado gov.br)`,
    pdf,
    substituiDriveFileId: doc.prancha?.driveFileId,
  });
  if (r.driveFileId) {
    await prisma.processoDocumento.update({
      where: { id: documentoId, lodgeId },
      data: { driveFileId: r.driveFileId },
    });
    if (doc.pranchaId) {
      await prisma.prancha.update({
        where: { id: doc.pranchaId, lodgeId },
        data: { driveFileId: r.driveFileId },
      });
    }
  }
  return r.aviso;
}
