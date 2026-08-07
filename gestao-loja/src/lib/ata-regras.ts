import type { AtaStatus } from "@prisma/client";

// Trava do livro de presenças (loja.md): a partir do momento em que a ata é
// liberada para assinaturas (ou já tem qualquer assinatura / subiu ao gov.br),
// o livro de presenças daquela sessão não pode mais mudar. Definição única
// da regra — toda mutação de presença deve passar por aqui.

export const ERRO_PRESENCAS_TRAVADAS =
  "A ata desta sessão já foi liberada para assinaturas — as presenças não podem mais ser alteradas.";

export type AtaParaTrava = {
  status: AtaStatus;
  signedByMasterId: string | null;
  signedBySecId: string | null;
  govbrUploadedAt: Date | null;
} | null;

export function ataFechadaParaPresencas(ata: AtaParaTrava) {
  if (!ata) return false;
  return (
    ata.status === "AGUARDANDO_ASSINATURAS" ||
    ata.status === "ASSINADA" ||
    Boolean(ata.signedByMasterId) ||
    Boolean(ata.signedBySecId) ||
    Boolean(ata.govbrUploadedAt)
  );
}
