export const roleLabels: Record<string, string> = {
  MEMBER: "Obreiro",
  VENERAVEL_MESTRE: "Venerável Mestre",
  SECRETARIO: "Secretário",
  TESOUREIRO: "Tesoureiro",
  CONSELHO_CONTAS: "Conselho de Contas",
  ESMOLER: "Esmoler (Hospitaleiro)",
  SUPER_ADMIN: "Admin Master",
};

export const degreeLabels: Record<string, string> = {
  APRENDIZ: "Aprendiz",
  COMPANHEIRO: "Companheiro",
  MESTRE: "Mestre",
};

export const memberStatusLabels: Record<string, string> = {
  ATIVO: "Ativo",
  IRREGULAR: "Irregular",
  LICENCIADO: "Licenciado",
  EX_MEMBRO: "Ex-membro",
};

export const sessionTypeLabels: Record<string, string> = {
  ORDINARIA: "Ordinária",
  MAGNA: "Magna",
  ECONOMICA: "Econômica",
  BRANCA: "Branca",
};

export const ataStatusLabels: Record<string, string> = {
  RASCUNHO: "Rascunho",
  EM_VALIDACAO: "Em validação pelos irmãos",
  AGUARDANDO_ASSINATURAS: "Aguardando assinaturas",
  ASSINADA: "Assinada",
};

export const documentTypeLabels: Record<string, string> = {
  ATA_ESCANEADA: "Ata escaneada",
  HISTORICO: "Histórico",
  REGULAMENTO: "Regulamento",
  FINANCEIRO: "Financeiro",
  OUTRO: "Outro",
};

export const invoiceStatusLabels: Record<string, string> = {
  PENDENTE: "Pendente",
  PAGA: "Paga",
  VENCIDA: "Vencida",
  CANCELADA: "Cancelada",
};

export const paymentMethodLabels: Record<string, string> = {
  PIX: "Pix",
  CARTAO: "Cartão",
  BOLETO: "Boleto",
  DINHEIRO: "Dinheiro",
  MANUAL: "Manual",
};

export const expenseStatusLabels: Record<string, string> = {
  PENDENTE_APROVACAO: "Aguardando aprovação",
  APROVADA: "Aprovada",
  PAGA: "Paga",
  REJEITADA: "Rejeitada",
};

export const transactionTypeLabels: Record<string, string> = {
  RECEITA: "Receita",
  DESPESA: "Despesa",
};

export const donationTypeLabels: Record<string, string> = {
  TRONCO_SOLIDARIEDADE: "Tronco de solidariedade",
  INGRESSO_EVENTO: "Ingresso de evento",
  DOACAO_AVULSA: "Doação avulsa",
};

export const statusAdmissaoLabels: Record<string, string> = {
  DOCUMENTACAO: "Pré-cadastro",
  EDITAL_PUBLICADO: "Edital publicado",
  SINDICANCIA: "Sindicância",
  ESCRUTINIO: "Escrutínio",
  AGUARDANDO_PLACET: "Aguardando Placet",
  INICIADO: "Iniciado",
  REPROVADO: "Reprovado",
};

export const statusAdmissaoOrder = [
  "DOCUMENTACAO",
  "EDITAL_PUBLICADO",
  "SINDICANCIA",
  "ESCRUTINIO",
  "AGUARDANDO_PLACET",
  "INICIADO",
] as const;

export const statusProgressaoLabels: Record<string, string> = {
  CUMPRIMENTO_INTERSTICIO: "Interstício",
  INSTRUCAO_E_FREQUENCIA: "Instrução e frequência",
  EXAME_PROFICIENCIA: "Exame de proficiência",
  ESCRUTINIO_PROGRESSAO: "Escrutínio",
  AGUARDANDO_PLACET: "Aguardando Placet",
  AGUARDANDO_CERIMONIA: "Aguardando cerimônia",
  COMUNICACAO_POS_CERIMONIA: "Comunicação pós-cerimônia",
  GRAU_CONCEDIDO: "Grau concedido",
};

export const statusProgressaoOrder = [
  "CUMPRIMENTO_INTERSTICIO",
  "INSTRUCAO_E_FREQUENCIA",
  "EXAME_PROFICIENCIA",
  "ESCRUTINIO_PROGRESSAO",
  "AGUARDANDO_PLACET",
  "AGUARDANDO_CERIMONIA",
  "COMUNICACAO_POS_CERIMONIA",
  "GRAU_CONCEDIDO",
] as const;

export const statusPlacetLabels: Record<string, string> = {
  PENDENTE: "Pendente",
  EM_ANALISE: "Em análise",
  APROVADO: "Aprovado",
  NEGADO: "Negado",
};

export function statusPlacetTone(status: string): BadgeTone {
  if (status === "APROVADO") return "success";
  if (status === "NEGADO") return "warning";
  return "secondary";
}

export const notificationTypeLabels: Record<string, string> = {
  PENDING_SIGNATURE: "Assinatura pendente",
  DEADLINE_WARNING: "Prazo",
  MISSING_DATA: "Cadastro incompleto",
  FINANCIAL_APPROVAL: "Trava financeira",
};

export type BadgeTone = "default" | "secondary" | "outline" | "success" | "warning";

export function notificationTypeTone(type: string): BadgeTone {
  if (type === "PENDING_SIGNATURE") return "warning";
  if (type === "DEADLINE_WARNING") return "default";
  if (type === "FINANCIAL_APPROVAL") return "outline";
  return "secondary";
}

export function ataStatusTone(status: string): BadgeTone {
  if (status === "ASSINADA") return "success";
  if (status === "AGUARDANDO_ASSINATURAS" || status === "EM_VALIDACAO")
    return "warning";
  return "secondary";
}

export function invoiceStatusTone(status: string): BadgeTone {
  if (status === "PAGA") return "success";
  if (status === "VENCIDA") return "warning";
  return "secondary";
}

export function expenseStatusTone(status: string): BadgeTone {
  if (status === "APROVADA" || status === "PAGA") return "success";
  if (status === "REJEITADA") return "warning";
  return "secondary";
}

export function memberStatusTone(status: string): BadgeTone {
  if (status === "IRREGULAR") return "warning";
  if (status === "ATIVO") return "success";
  return "secondary";
}
