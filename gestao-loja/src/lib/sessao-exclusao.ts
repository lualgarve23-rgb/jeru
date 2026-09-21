// Regras para exclusão de uma sessão pelo Secretário ou Venerável Mestre.
// A sessão só pode sair do sistema enquanto a ata (se houver) ainda é um
// rascunho sem assinaturas — depois disso o registro é documento da Loja.

import type { AtaStatus } from "@prisma/client";

export type AtaParaExclusao = {
  number: number;
  status: AtaStatus;
  signedByMasterId: string | null;
  signedBySecId: string | null;
  govbrMasterAt: Date | null;
  govbrSecAt: Date | null;
  govbrUploadedAt: Date | null;
  driveFileId: string | null;
  sentForReviewAt: Date | null;
} | null;

const STATUS_LABEL: Record<AtaStatus, string> = {
  RASCUNHO: "em rascunho",
  EM_VALIDACAO: "em validação pelos irmãos",
  AGUARDANDO_ASSINATURAS: "aguardando assinaturas",
  ASSINADA: "assinada",
};

// Motivo que impede a exclusão, ou null quando a sessão pode ser excluída.
export function bloqueioExclusaoSessao(ata: AtaParaExclusao): string | null {
  if (!ata) return null;
  const saiuDoRascunho =
    ata.status !== "RASCUNHO" ||
    !!ata.signedByMasterId ||
    !!ata.signedBySecId ||
    !!ata.govbrMasterAt ||
    !!ata.govbrSecAt ||
    !!ata.govbrUploadedAt ||
    !!ata.driveFileId ||
    !!ata.sentForReviewAt;
  if (!saiuDoRascunho) return null;
  return `A Ata nº ${ata.number} desta sessão já está ${STATUS_LABEL[ata.status]}. Só é possível excluir sessões sem ata ou com ata ainda em rascunho, sem assinaturas.`;
}

export type ResumoSessaoExclusao = {
  titulo: string;
  dataHora: string;
  grau: string | null;
  pauta: string | null;
  presentes: number;
  visitantes: number;
  confirmados: number;
  justificadas: number;
  ataRascunho: number | null;
};

// Texto do aviso exibido na confirmação e gravado na auditoria.
export function avisosExclusaoSessao(r: ResumoSessaoExclusao): string[] {
  const avisos: string[] = [];
  if (r.presentes > 0) {
    avisos.push(
      `${r.presentes} presença(s) de irmãos do quadro serão apagadas do Livro de Presenças — a frequência anual deles será recalculada sem esta sessão.`
    );
  }
  if (r.visitantes > 0) {
    avisos.push(
      `${r.visitantes} registro(s) de visitante(s) nesta sessão serão apagados (as fichas na base de Visitantes permanecem).`
    );
  }
  if (r.confirmados > 0) {
    avisos.push(`${r.confirmados} confirmação(ões) de presença pelo convite serão perdidas.`);
  }
  if (r.justificadas > 0) {
    avisos.push(`${r.justificadas} ausência(s) justificada(s) serão apagadas.`);
  }
  if (r.ataRascunho !== null) {
    avisos.push(
      `O rascunho da Ata nº ${r.ataRascunho} será excluído junto com a sessão e o número ficará livre.`
    );
  }
  avisos.push(
    "Os links de convite (RSVP) e de check-in por QR Code desta sessão deixam de funcionar."
  );
  return avisos;
}
