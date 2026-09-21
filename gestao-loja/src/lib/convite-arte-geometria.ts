// Geometria do painel de dados desenhado sobre a arte do convite
// (lib/convite-arte.ts, servidor) — separada para o editor visual das
// Configurações da Loja (cliente) reproduzir as mesmas medidas sem puxar o sharp.

// Largura de referência do painel (0.88 × 1120px) — as medidas internas
// escalam a partir dela, no layout padrão e no personalizado
export const PANEL_REF_W = 985.6;
// Base com tipo + data, mais um acréscimo por linha de pauta e de endereço
export const PANEL_BASE_H = 200;
export const PANEL_PAUTA_LINHA_H = 52;
export const PANEL_LOCAL_LINHA_H = 40;
export const PANEL_PAUTA_MAX_LINHAS = 2;
export const PANEL_LOCAL_MAX_LINHAS = 2;

export function alturaPainel(linhasPauta: number, linhasLocal: number) {
  return (
    PANEL_BASE_H +
    linhasPauta * PANEL_PAUTA_LINHA_H +
    linhasLocal * PANEL_LOCAL_LINHA_H
  );
}
