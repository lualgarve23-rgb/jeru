// Limite diário de perguntas ao assistente por nível do usuário (config da
// Loja) e separação das perguntas de continuação sugeridas pela IA, que vêm
// no fim da resposta atrás de um marcador (nunca exibido nem persistido).

export function limiteDiarioPara(
  role: string,
  lodge: { assistenteLimiteObreiros: number; assistenteLimiteOficiais: number }
): number {
  return role === "MEMBER"
    ? lodge.assistenteLimiteObreiros
    : lodge.assistenteLimiteOficiais;
}

export const MARCADOR_SUGESTOES = "###SUGESTOES###";

export function separarSugestoes(texto: string): {
  resposta: string;
  sugestoes: string[];
} {
  const i = texto.indexOf(MARCADOR_SUGESTOES);
  if (i < 0) return { resposta: texto, sugestoes: [] };
  return {
    resposta: texto.slice(0, i).replace(/\s+$/, ""),
    sugestoes: texto
      .slice(i + MARCADOR_SUGESTOES.length)
      .split("|")
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 3),
  };
}

// Durante o streaming o marcador pode chegar pela metade no fim do texto;
// esconde esse pedaço para o usuário nunca ver "###SUG…".
export function ocultarMarcadorParcial(texto: string): string {
  for (let n = Math.min(MARCADOR_SUGESTOES.length, texto.length); n > 0; n--) {
    if (texto.endsWith(MARCADOR_SUGESTOES.slice(0, n))) return texto.slice(0, texto.length - n);
  }
  return texto;
}
