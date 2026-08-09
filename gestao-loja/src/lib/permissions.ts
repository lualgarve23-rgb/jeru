import { cargoCorresponde } from "@/lib/cargos";

// Segregação de funções (loja.md §3):
// CONSELHO_CONTAS nunca tem escrita em Secretaria ou Tesouraria.
// Leitura administrativa (pipeline, visitas, cargos): VM + Secretário + Conselho.

export const SECRETARIA_WRITERS = ["SECRETARIO", "VENERAVEL_MESTRE"];
export const SECRETARIA_READERS = [
  "SECRETARIO",
  "VENERAVEL_MESTRE",
  "CONSELHO_CONTAS",
];
export const TESOURARIA_WRITERS = ["TESOUREIRO", "VENERAVEL_MESTRE"];
export const TESOURARIA_READERS = [
  "TESOUREIRO",
  "VENERAVEL_MESTRE",
  "CONSELHO_CONTAS",
];

export function canWriteSecretaria(role: string) {
  return SECRETARIA_WRITERS.includes(role);
}

export function canReadSecretariaAdmin(role: string) {
  return SECRETARIA_READERS.includes(role);
}

export function canWriteTesouraria(role: string) {
  return TESOURARIA_WRITERS.includes(role);
}

export function canReadTesouraria(role: string) {
  return TESOURARIA_READERS.includes(role);
}

// Interstícios mínimos em meses (ajuste conforme o Regulamento da Potência)
export const INTERSTICE_MONTHS: Record<string, number> = {
  COMPANHEIRO: 12, // Aprendiz → Companheiro
  MESTRE: 6, // Companheiro → Mestre (mínimo de 6 meses no grau atual)
};

// Instruções de grau: Aprendizes com o 2º Vigilante, Companheiros com o
// 1º Vigilante (cargos do rito); VM e Secretário podem registrar ambas.
export function grausInstrucaoPermitidos(
  role: string,
  cargoRito?: string | null
): ("APRENDIZ" | "COMPANHEIRO")[] {
  if (role === "VENERAVEL_MESTRE" || role === "SECRETARIO")
    return ["APRENDIZ", "COMPANHEIRO"];
  if (cargoCorresponde(cargoRito, "2º Vigilante")) return ["APRENDIZ"];
  if (cargoCorresponde(cargoRito, "1º Vigilante")) return ["COMPANHEIRO"];
  return [];
}
