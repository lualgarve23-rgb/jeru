// Catálogo estático de perguntas-chave do Assistente IA, filtrado no
// servidor por role/cargoRito (mesmo padrão do navFor) e contextual à rota.
// Os chips PREENCHEM o input sem enviar; trechos entre ___ ficam
// selecionados para o usuário completar (assistente-bar.tsx).

export type Sugestao = {
  texto: string;
  // rotas em que a sugestão ganha prioridade (prefixo); vazio = geral
  rotas?: string[];
  roles?: string[]; // restrição por nível de acesso; vazio = todos
};

const CATALOGO: Sugestao[] = [
  { texto: "Estou em dia com as minhas capitações?" },
  { texto: "Qual é a minha frequência este ano?" },
  { texto: "Quando é a próxima sessão?" },
  { texto: "Já entreguei a Declaração de Beneficiários da Mútua?", rotas: ["/dashboard/mutua"] },
  { texto: "Como está o meu pedido de atestado de regularidade?", rotas: ["/secretaria/atestados"] },
  { texto: "Tenho notificações não lidas?", rotas: ["/dashboard/notificacoes"] },
  { texto: "Como faço uma doação à Bolsa de Benemerência?", rotas: ["/dashboard/benemerencia"] },
  { texto: "Como assino um documento pelo gov.br?", rotas: ["/secretaria/processos", "/secretaria/quitte-placets"] },
  // Por nível de acesso — mesmas listas de leitura de permissions.ts
  {
    texto: "Como está o caixa da loja este mês?",
    rotas: ["/tesouraria"],
    roles: ["VENERAVEL_MESTRE", "TESOUREIRO", "CONSELHO_CONTAS"],
  },
  {
    texto: "Quem está com capitações vencidas?",
    rotas: ["/tesouraria"],
    roles: ["VENERAVEL_MESTRE", "TESOUREIRO", "CONSELHO_CONTAS", "ESMOLER"],
  },
  {
    texto: "Como está a frequência da loja? Alguém precisa de atenção?",
    rotas: ["/secretaria"],
    roles: ["VENERAVEL_MESTRE", "SECRETARIO", "CONSELHO_CONTAS", "ESMOLER"],
  },
  {
    texto: "Quantos obreiros temos por grau e situação?",
    rotas: ["/secretaria"],
    roles: ["VENERAVEL_MESTRE", "SECRETARIO", "CONSELHO_CONTAS"],
  },
  {
    texto: "Há processos aguardando a minha assinatura?",
    rotas: ["/secretaria/processos"],
    roles: ["VENERAVEL_MESTRE", "SECRETARIO", "TESOUREIRO"],
  },
  {
    texto: "Quem ainda não entregou o Form. 108 da Mútua?",
    rotas: ["/dashboard/mutua"],
    roles: ["VENERAVEL_MESTRE", "SECRETARIO", "CONSELHO_CONTAS"],
  },
  { texto: "Como faço para ___ no sistema?" },
  { texto: "Como funciona a assinatura do atestado de regularidade?", rotas: ["/secretaria/atestados", "/secretaria/processos"] },
  { texto: "Onde troco a minha senha?" },
];

// Filtro por role no SERVIDOR (layout) — o cliente só reordena pela rota
export function sugestoesVisiveis(user: {
  role: string;
  cargoRito?: string | null;
}): { texto: string; rotas?: string[] }[] {
  return CATALOGO.filter((s) => !s.roles || s.roles.includes(user.role)).map(
    ({ texto, rotas }) => ({ texto, rotas })
  );
}

// Ordenação contextual (roda no cliente com usePathname)
export function ordenarPorRota(
  sugestoes: { texto: string; rotas?: string[] }[],
  rota: string,
  limite: number
): string[] {
  const contextuais = sugestoes.filter((s) =>
    s.rotas?.some((r) => rota.startsWith(r))
  );
  const gerais = sugestoes.filter((s) => !contextuais.includes(s));
  return [...contextuais, ...gerais].slice(0, limite).map((s) => s.texto);
}
