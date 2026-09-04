import { prisma } from "@/lib/prisma";
import { arquivarVersaoFinalNoDrive, slugNome } from "@/lib/google-drive";
import { cargosProcesso } from "@/lib/processos";
// Quitte Placet — regras de assinatura gov.br.
// Ordem de governança: Secretário assina primeiro, o Orador em seguida e o
// Venerável Mestre por último (padrão de todos os documentos oficiais: o VM
// sela o documento). O Orador é cargo do rito (User.cargoRito), resolvido
// como nos Processos — pode ter qualquer nível de acesso.

export const CADEIA_QUITTE = ["SECRETARIO", "ORADOR", "VENERAVEL_MESTRE"] as const;
export type CargoQuitte = (typeof CADEIA_QUITTE)[number];

const LABEL_QUITTE: Record<CargoQuitte, string> = {
  SECRETARIO: "Secretário",
  ORADOR: "Orador",
  VENERAVEL_MESTRE: "Venerável Mestre",
};

export type QuitteAssinaturas = {
  signedBySecAt: Date | null;
  signedByOradorAt: Date | null;
  signedByMasterAt: Date | null;
};

function assinouEm(p: QuitteAssinaturas, cargo: CargoQuitte) {
  return cargo === "SECRETARIO"
    ? p.signedBySecAt
    : cargo === "ORADOR"
      ? p.signedByOradorAt
      : p.signedByMasterAt;
}

// Cargo com que o usuário assina o Quitte Placet (o nível de acesso vale
// antes do cargo do rito), ou null quando ele não está na cadeia.
export function cargoQuitteDoUsuario(
  role: string,
  cargoRito?: string | null
): CargoQuitte | null {
  return cargoQuitteDosCargos(cargosProcesso(role, cargoRito));
}

// Idem, a partir da lista já resolvida por cargosProcesso()
export function cargoQuitteDosCargos(cargos: string[]): CargoQuitte | null {
  return CADEIA_QUITTE.find((c) => cargos.includes(c)) ?? null;
}

export function ordemAssinaturaQuitte(cargo: CargoQuitte, p: QuitteAssinaturas) {
  const pos = CADEIA_QUITTE.indexOf(cargo);
  const anteriorPendente = CADEIA_QUITTE.slice(0, pos).find((c) => !assinouEm(p, c));
  const outrosAssinaram = CADEIA_QUITTE.filter((c) => c !== cargo).every((c) =>
    assinouEm(p, c)
  );
  return {
    jaAssinou: !!assinouEm(p, cargo),
    aguardando: anteriorPendente ? LABEL_QUITTE[anteriorPendente] : (null as string | null),
    ultimaAssinatura: outrosAssinaram,
  };
}

// Próximo cargo da cadeia ainda sem assinatura (null = todos assinaram)
export function proximoCargoQuitte(p: QuitteAssinaturas): CargoQuitte | null {
  return CADEIA_QUITTE.find((c) => !assinouEm(p, c)) ?? null;
}

export function assinaturasQuitte(p: QuitteAssinaturas) {
  return CADEIA_QUITTE.filter((c) => assinouEm(p, c)).length;
}

export function camposAssinaturaQuitte(cargo: CargoQuitte, userId: string) {
  const agora = new Date();
  return cargo === "SECRETARIO"
    ? { signedBySecId: userId, signedBySecAt: agora }
    : cargo === "ORADOR"
      ? { signedByOradorId: userId, signedByOradorAt: agora }
      : { signedByMasterId: userId, signedByMasterAt: agora };
}

export function cargoAssinanteQuitte(cargo: CargoQuitte) {
  return LABEL_QUITTE[cargo];
}

// Pré-condições comuns às assinaturas (OAuth gov.br e upload do portal ITI).
// Retorna a mensagem de bloqueio, ou null quando o placet pode ser assinado.
export function bloqueioAssinaturaQuitte(p: {
  status: string;
  quitacaoFinanceira: boolean;
  cartaNome: string | null;
  dataSessaoComunicacao: Date | null;
  ataNome: string | null;
  formularioNome: string | null;
  formularioMime: string | null;
  govbrPdf: Uint8Array | Buffer | null;
}): string | null {
  if (p.status === "APROVADO" || p.status === "NEGADO") {
    return "Quitte Placet já encerrado.";
  }
  if (!p.cartaNome) {
    return "Falta a carta de próprio punho do irmão — as assinaturas ficam bloqueadas até ela ser anexada ao pedido.";
  }
  if (!p.quitacaoFinanceira) {
    return "Trava financeira: a Tesouraria ainda não confirmou o Nada Consta.";
  }
  if (!p.dataSessaoComunicacao || !p.ataNome) {
    return "Registre a data da sessão em que o pedido foi comunicado à Loja e anexe a ata dessa sessão antes das assinaturas.";
  }
  if (!p.formularioNome) {
    return "Anexe o Form. 122 preenchido (em PDF) antes das assinaturas gov.br.";
  }
  if (!p.govbrPdf && p.formularioMime !== "application/pdf") {
    return "O Form. 122 anexado precisa estar em PDF para receber as assinaturas gov.br — substitua o anexo.";
  }
  return null;
}

// Versão final do Quitte Placet (assinado pelos três cargos) no Drive da Loja.
export async function arquivarQuitteNoDrive(
  lodgeId: string,
  uploadedById: string,
  placetId: string,
  nomeMembro: string,
  pdf: Buffer
): Promise<string> {
  const r = await arquivarVersaoFinalNoDrive({
    lodgeId,
    uploadedById,
    fileName: `quitte-placet-${slugNome(nomeMembro)}-${placetId.slice(-6)}-assinado-govbr.pdf`,
    title: `Quitte Placet — ${nomeMembro} (assinado gov.br)`,
    pdf,
  });
  if (r.driveFileId) {
    await prisma.quittePlacet.update({
      where: { id: placetId, lodgeId },
      data: { driveFileId: r.driveFileId },
    });
  }
  return r.aviso;
}
