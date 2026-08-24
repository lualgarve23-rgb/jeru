import { Degree } from "@prisma/client";
import { INTERSTICE_MONTHS } from "@/lib/permissions";

// Regras de progressão de grau (loja.md): só se avança um grau por vez, na
// ordem Aprendiz → Companheiro → Mestre, respeitado o interstício mínimo no
// grau atual contado da última elevação (ou da iniciação).

export const ORDEM_GRAUS: readonly Degree[] = [
  Degree.APRENDIZ,
  Degree.COMPANHEIRO,
  Degree.MESTRE,
];

export function progressaoSequencial(atual: Degree, novo: Degree) {
  return ORDEM_GRAUS.indexOf(novo) === ORDEM_GRAUS.indexOf(atual) + 1;
}

// Data a partir da qual a progressão ao grau `novo` é permitida.
// `null` quando não há data-base registrada (sem histórico nem iniciação).
export function dataMinimaProgressao(
  novo: Degree,
  ultimaElevacao: Date | null
): Date | null {
  if (!ultimaElevacao) return null;
  const minDate = new Date(ultimaElevacao);
  minDate.setMonth(minDate.getMonth() + (INTERSTICE_MONTHS[novo] ?? 0));
  return minDate;
}

export function validarProgressao(
  atual: Degree,
  novo: Degree,
  ultimaElevacao: Date | null,
  data: Date
): { error: string } | { ok: true } {
  if (!progressaoSequencial(atual, novo)) {
    return { error: `Progressão inválida: ${atual} → ${novo}.` };
  }
  const minDate = dataMinimaProgressao(novo, ultimaElevacao);
  if (minDate && data < minDate) {
    const minMonths = INTERSTICE_MONTHS[novo] ?? 0;
    return {
      error: `Interstício não cumprido: mínimo de ${minMonths} meses no grau atual (permitido a partir de ${minDate.toLocaleDateString("pt-BR")}).`,
    };
  }
  return { ok: true };
}
