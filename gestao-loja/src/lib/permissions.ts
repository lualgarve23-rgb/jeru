// Segregação de funções (loja.md §3):
// CONSELHO_CONTAS nunca tem escrita em Secretaria ou Tesouraria.

export const SECRETARIA_WRITERS = ["SECRETARIO", "VENERAVEL_MESTRE"];
export const TESOURARIA_WRITERS = ["TESOUREIRO", "VENERAVEL_MESTRE"];

export function canWriteSecretaria(role: string) {
  return SECRETARIA_WRITERS.includes(role);
}

export function canWriteTesouraria(role: string) {
  return TESOURARIA_WRITERS.includes(role);
}

// Interstícios mínimos em meses (ajuste conforme o Regulamento da Potência)
export const INTERSTICE_MONTHS: Record<string, number> = {
  COMPANHEIRO: 12, // Aprendiz → Companheiro
  MESTRE: 6, // Companheiro → Mestre (mínimo de 6 meses no grau atual)
};

// Instruções de grau: Aprendizes com o 2º Vigilante, Companheiros com o
// 1º Vigilante; VM e Secretário podem registrar ambas.
export function grausInstrucaoPermitidos(role: string): ("APRENDIZ" | "COMPANHEIRO")[] {
  switch (role) {
    case "SEGUNDO_VIGILANTE":
      return ["APRENDIZ"];
    case "PRIMEIRO_VIGILANTE":
      return ["COMPANHEIRO"];
    case "VENERAVEL_MESTRE":
    case "SECRETARIO":
      return ["APRENDIZ", "COMPANHEIRO"];
    default:
      return [];
  }
}
