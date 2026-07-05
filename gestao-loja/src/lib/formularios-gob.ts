// Formulários oficiais do GOB-SP (obtidos pelo usuário no Conecta GOB-SP),
// por categoria. Os arquivos ficam em public/formularios-gob e são servidos
// estaticamente (atrás do login).
// Fluxo: baixar → preencher → anexar na prancha (upload) ao expedir.

export type FormularioGob = {
  arquivo: string; // nome do arquivo em /formularios-gob/
  titulo: string;
  categoria: string;
  descricao: string; // nº oficial do formulário
};

export const FORMULARIOS_GOB: FormularioGob[] = [
  // ─── Admissão de candidatos ───
  {
    arquivo: "form-105-1-2-indicacao-candidato-dados.docx",
    titulo: "Indicação de Candidato — Dados do candidato",
    categoria: "Admissão",
    descricao: "Form. 105 (1 e 2)",
  },
  {
    arquivo: "form-105-3-indicacao-candidato-sindicancia.docx",
    titulo: "Indicação de Candidato — Sindicância",
    categoria: "Admissão",
    descricao: "Form. 105 (3)",
  },
  {
    arquivo: "form-105-4-indicacao-candidato-apresentacao.docx",
    titulo: "Indicação de Candidato — Apresentação e Controle",
    categoria: "Admissão",
    descricao: "Form. 105 (4)",
  },
  {
    arquivo: "form-103-questionario.pdf",
    titulo: "Questionário",
    categoria: "Admissão",
    descricao: "Form. 103",
  },
  {
    arquivo: "form-104-testamento.pdf",
    titulo: "Testamento",
    categoria: "Admissão",
    descricao: "Form. 104",
  },
  {
    arquivo: "form-119-parecer-comissao-admissao-graus.pdf",
    titulo: "Parecer Formal da Comissão de Admissão e Graus",
    categoria: "Admissão",
    descricao: "Form. 119",
  },
  {
    arquivo: "form-112-comunicacao-rejeicao-candidato.docx",
    titulo: "Comunicação de Rejeição de Candidato",
    categoria: "Admissão",
    descricao: "Form. 112",
  },
  {
    arquivo: "form-107-solicitacao-placet-iniciacao.docx",
    titulo: "Solicitação de Placet de Iniciação",
    categoria: "Admissão",
    descricao: "Form. 107",
  },
  {
    arquivo: "form-106-comunicado-iniciacao.docx",
    titulo: "Comunicado de Iniciação",
    categoria: "Admissão",
    descricao: "Form. 106",
  },
  {
    arquivo: "form-129-termo-compromisso.doc",
    titulo: "Termo de Compromisso",
    categoria: "Admissão",
    descricao: "Form. 129",
  },
  {
    arquivo: "form-111-termo-responsabilidade.docx",
    titulo: "Termo de Responsabilidade",
    categoria: "Admissão",
    descricao: "Form. 111",
  },
  // ─── Filiação e Regularização ───
  {
    arquivo: "form-009-comunicacao-filiacao-regularizacao.docx",
    titulo: "Comunicação de Filiação ou Regularização",
    categoria: "Filiação e Regularização",
    descricao: "Form. 009",
  },
  {
    arquivo: "form-101-edital-filiacao-potencia-tratado.docx",
    titulo: "Edital de Filiação de Potência com tratado",
    categoria: "Filiação e Regularização",
    descricao: "Form. 101",
  },
  {
    arquivo: "form-102-comunicado-filiacao-outra-potencia.docx",
    titulo: "Comunicado de Filiação/Regularização de outra Potência (com tratado)",
    categoria: "Filiação e Regularização",
    descricao: "Form. 102",
  },
  {
    arquivo: "form-109-comunicado-filiacao-obreiro-gob.docx",
    titulo: "Comunicado de Filiação de Obreiro do próprio GOB",
    categoria: "Filiação e Regularização",
    descricao: "Form. 109",
  },
  {
    arquivo: "form-117-pedido-filiacao-regularizacao.docx",
    titulo: "Pedido de Filiação ou Regularização",
    categoria: "Filiação e Regularização",
    descricao: "Form. 117",
  },
  {
    arquivo: "form-118-edital-regularizacao.docx",
    titulo: "Edital de Regularização",
    categoria: "Filiação e Regularização",
    descricao: "Form. 118",
  },
  {
    arquivo: "form-121-comunicado-regularizacao-obreiro-gob.docx",
    titulo: "Comunicado de Regularização de Obreiro do próprio GOB",
    categoria: "Filiação e Regularização",
    descricao: "Form. 121",
  },
  {
    arquivo: "atestado-potencia-irregular.docx",
    titulo: "Atestado para Potência Irregular",
    categoria: "Filiação e Regularização",
    descricao: "Atestado",
  },
  // ─── Vida do Obreiro ───
  {
    arquivo: "form-110-comunicado-elevacao-exaltacao.docx",
    titulo: "Comunicado de Elevação ou Exaltação",
    categoria: "Vida do Obreiro",
    descricao: "Form. 110",
  },
  {
    arquivo: "form-115-comunicado-desligamento.docx",
    titulo: "Comunicado de Desligamento",
    categoria: "Vida do Obreiro",
    descricao: "Form. 115",
  },
  {
    arquivo: "form-116-pedido-licenca.docx",
    titulo: "Pedido de Licença (com requerimento do Obreiro)",
    categoria: "Vida do Obreiro",
    descricao: "Form. 116",
  },
  {
    arquivo: "form-122-quite-placet.docx",
    titulo: "Quite Placet",
    categoria: "Vida do Obreiro",
    descricao: "Form. 122",
  },
  {
    arquivo: "form-123-placet-ex-officio.docx",
    titulo: "Placet Ex Officio",
    categoria: "Vida do Obreiro",
    descricao: "Form. 123",
  },
  {
    arquivo: "form-124-suspensao-direitos-maconicos.docx",
    titulo: "Suspensão dos Direitos Maçônicos",
    categoria: "Vida do Obreiro",
    descricao: "Form. 124",
  },
  {
    arquivo: "form-125-notificacao-debitos.docx",
    titulo: "Notificação de Débitos",
    categoria: "Vida do Obreiro",
    descricao: "Form. 125",
  },
  // ─── Mútua ───
  {
    arquivo: "form-108-declaracao-beneficiario.pdf",
    titulo: "Declaração de Beneficiário",
    categoria: "Mútua",
    descricao: "Form. 108 (2024)",
  },
  // ─── Administração da Loja ───
  {
    arquivo: "form-113-modelo-diploma.doc",
    titulo: "Modelo de Diploma",
    categoria: "Administração da Loja",
    descricao: "Form. 113",
  },
  {
    arquivo: "form-114-consulta-livros.docx",
    titulo: "Consulta de Livros",
    categoria: "Administração da Loja",
    descricao: "Form. 114",
  },
  {
    arquivo: "form-120-mudanca-cadastro-loja.docx",
    titulo: "Mudança de Cadastro da Loja",
    categoria: "Administração da Loja",
    descricao: "Form. 120",
  },
  {
    arquivo: "form-126-solicitacao-titulos-honorificos.docx",
    titulo: "Solicitação de Títulos Honoríficos",
    categoria: "Administração da Loja",
    descricao: "Form. 126",
  },
];

export const CATEGORIAS_FORMULARIOS = [
  ...new Set(FORMULARIOS_GOB.map((f) => f.categoria)),
];
