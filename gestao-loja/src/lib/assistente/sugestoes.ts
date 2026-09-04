// Catálogo estático de perguntas-chave do Assistente IA, filtrado no
// servidor por role/cargoRito (mesmo padrão do navFor) e contextual à rota.
// Os chips PREENCHEM o input sem enviar; trechos entre ___ ficam
// selecionados para o usuário completar (assistente-bar.tsx).

export type Sugestao = {
  texto: string;
  // rotas em que a sugestão ganha prioridade (prefixo); vazio = geral
  rotas?: string[];
  roles?: string[]; // restrição por nível de acesso; vazio = todos
  // chips dinâmicos de "Minha vez": sempre na frente, em qualquer rota
  fixa?: boolean;
};

const CATALOGO: Sugestao[] = [
  { texto: "Estou em dia com as minhas capitações?" },
  { texto: "Qual é a minha frequência este ano?" },
  { texto: "Quando é a próxima sessão?" },
  { texto: "Já entreguei a Declaração de Beneficiários da Mútua?", rotas: ["/dashboard/mutua"] },
  { texto: "Como está o meu pedido de atestado de regularidade?", rotas: ["/secretaria/atestados", "/solicitacoes"] },
  { texto: "Como peço afastamento da loja (Form. 116)?", rotas: ["/solicitacoes", "/solicitacoes/afastamento"] },
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
    texto: "Quem confirmou presença na próxima sessão? Alguém justificou?",
    rotas: ["/secretaria/sessoes", "/dashboard/sessoes"],
    roles: ["VENERAVEL_MESTRE", "SECRETARIO", "CONSELHO_CONTAS"],
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
  { texto: "O que dizem as atas sobre ___?" },
  { texto: "Procure na biblioteca da loja sobre ___", rotas: ["/dashboard/biblioteca"] },
  {
    texto: "Que pranchas tratam de ___?",
    rotas: ["/secretaria/pranchas"],
    roles: ["VENERAVEL_MESTRE", "SECRETARIO", "CONSELHO_CONTAS"],
  },
  {
    texto: "Encontre no arquivo da loja o documento sobre ___",
    rotas: ["/secretaria/documentos"],
    roles: ["VENERAVEL_MESTRE", "SECRETARIO", "CONSELHO_CONTAS"],
  },
  { texto: "Como faço para ___ no sistema?" },
  { texto: "Como funciona a assinatura do atestado de regularidade?", rotas: ["/secretaria/atestados", "/secretaria/processos"] },
  { texto: "Onde troco a minha senha?" },
];

// Chips dinâmicos a partir de "Minha vez" (lib/pendencias.ts): entram na
// frente do catálogo, sem rota (valem em qualquer tela).
export function sugestoesDinamicas(
  pendencias: { tipo: string; acao?: string }[]
): { texto: string; rotas?: string[]; fixa?: boolean }[] {
  if (pendencias.length === 0) return [];
  const conta = (tipos: string[]) => pendencias.filter((p) => tipos.includes(p.tipo)).length;
  const chips: string[] = [];
  const assinar = conta(["atestado", "quitte", "processo", "afastamento", "ata"]);
  if (assinar > 0) {
    const atestados = conta(["atestado"]);
    chips.push(
      atestados === assinar
        ? `Você tem ${atestados} atestado(s) na sua vez — quer ver?`
        : `Tenho ${assinar} documento(s) para assinar — quais são?`
    );
  }
  if (conta(["despesa"]) > 0) chips.push("Que despesas aguardam a minha aprovação?");
  if (conta(["capitacao"]) > 0) chips.push("Quais capitações minhas estão vencidas?");
  if (conta(["convite"]) > 0) chips.push("Que convites de sessão ainda não respondi?");
  if (conta(["lgpd", "candidato"]) > 0) chips.push("O que a Secretaria precisa registrar hoje?");
  if (conta(["esmoler"]) > 0) chips.push("Quais irmãos precisam do meu contato?");
  if (chips.length === 0) chips.push(`Tenho ${pendencias.length} item(ns) na minha vez — o que são?`);
  return chips.slice(0, 3).map((texto) => ({ texto, fixa: true }));
}

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
  sugestoes: { texto: string; rotas?: string[]; fixa?: boolean }[],
  rota: string,
  limite: number
): string[] {
  const fixas = sugestoes.filter((s) => s.fixa);
  const contextuais = sugestoes.filter(
    (s) => !s.fixa && s.rotas?.some((r) => rota.startsWith(r))
  );
  const gerais = sugestoes.filter((s) => !s.fixa && !contextuais.includes(s));
  return [...fixas, ...contextuais, ...gerais].slice(0, limite).map((s) => s.texto);
}
