// Cargos ritualísticos padrão — gerenciados via model CargoRito por Loja.
// O nível de acesso ao sistema (enum Role) é independente do cargo.

export const CARGOS_PADRAO = [
  "1º Vigilante",
  "2º Vigilante",
  "1º Diácono",
  "2º Diácono",
  "Orador",
  "Guarda Interno",
  "Guarda Externo",
  "Diretor de Cerimônias",
] as const;

export type CargoPadrao = (typeof CARGOS_PADRAO)[number];

// Normaliza para comparação: minúsculas, sem acentos, "primeiro"/"1o" → "1",
// sem pontuação — tolera variações de grafia nos cargos cadastrados pela Loja.
function normalizar(nome: string) {
  return nome
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\bprimeiro\b/g, "1")
    .replace(/\bsegundo\b/g, "2")
    .replace(/[ºo°]\.?(?=\s|$)/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function cargoCorresponde(
  cargoRito: string | null | undefined,
  padrao: CargoPadrao
) {
  if (!cargoRito) return false;
  return normalizar(cargoRito) === normalizar(padrao);
}
