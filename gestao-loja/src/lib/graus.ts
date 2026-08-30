// Segmentação por grau dos acervos (Biblioteca Digital e Documentos/Drive):
// um documento com grauMinimo MESTRE não aparece para Aprendizes/Companheiros.

export const GRAUS_ACERVO = ["APRENDIZ", "COMPANHEIRO", "MESTRE"] as const;

// Graus mínimos que o usuário pode ver. Grau desconhecido/ausente cai no
// mais restritivo (só documentos abertos a todos).
export function grausVisiveis(degree: string | null | undefined): string[] {
  switch (degree) {
    case "MESTRE":
      return ["APRENDIZ", "COMPANHEIRO", "MESTRE"];
    case "COMPANHEIRO":
      return ["APRENDIZ", "COMPANHEIRO"];
    default:
      return ["APRENDIZ"];
  }
}

// Filtro Prisma pronto para where de biblioteca_itens/documents.
export function grauWhere(degree: string | null | undefined) {
  return { grauMinimo: { in: grausVisiveis(degree) as never[] } };
}

export const grauMinimoLabels: Record<string, string> = {
  APRENDIZ: "Todos os irmãos",
  COMPANHEIRO: "Companheiros e Mestres",
  MESTRE: "Somente Mestres",
};
