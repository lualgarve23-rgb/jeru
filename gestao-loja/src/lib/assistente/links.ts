// Rotas internas citadas em texto puro pelo assistente (ex.: "veja em
// /secretaria/processos?destaque=atestado-abc") — o componente do chat as
// transforma em <Link>; nunca HTML vindo do modelo.
export const ROTA_INTERNA =
  /(\/(?:secretaria|tesouraria|solicitacoes|dashboard|esmoler|convite|n)(?:[\w\-/?=&#%.]*[\w\-/=&#%])?)/g;

// Divide o texto em [texto, rota, texto, rota, ...] — índices ímpares são rotas
export function partirEmRotas(texto: string): string[] {
  return texto.split(ROTA_INTERNA);
}
