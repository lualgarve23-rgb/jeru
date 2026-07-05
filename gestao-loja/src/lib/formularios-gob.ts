// Formulários oficiais do GOB-SP exigidos pela Secretaria, por categoria.
// Os PDFs ficam em public/formularios-gob e são servidos estaticamente.
// Fluxo: baixar → preencher → anexar na prancha (upload) ao expedir.

export type FormularioGob = {
  slug: string; // nome do arquivo em /formularios-gob/<slug>.pdf
  titulo: string;
  categoria: string;
  descricao: string;
};

export const FORMULARIOS_GOB: FormularioGob[] = [
  {
    slug: "previa-admissao",
    titulo: "Prévia para Admissão de Candidato",
    categoria: "Admissão",
    descricao: "Consulta prévia à Potência antes de abrir o processo.",
  },
  {
    slug: "proposta-admissao",
    titulo: "Proposta para Admissão de Candidato",
    categoria: "Admissão",
    descricao: "Proposta completa de admissão (6 páginas).",
  },
  {
    slug: "sindicancia",
    titulo: "Sindicância",
    categoria: "Admissão",
    descricao: "Relatório da comissão de sindicância sobre o candidato.",
  },
  {
    slug: "parecer-comissao-admissao",
    titulo: "Parecer da Comissão de Admissão e Graus",
    categoria: "Admissão",
    descricao: "Parecer conclusivo da comissão para o escrutínio.",
  },
  {
    slug: "termo-compromisso",
    titulo: "Termo de Compromisso",
    categoria: "Admissão",
    descricao: "Assinado pelo candidato aprovado antes da iniciação.",
  },
  {
    slug: "mutua-beneficiarios",
    titulo: "Mútua — Declaração de Beneficiários",
    categoria: "Mútua",
    descricao: "Indicação de beneficiários da mútua do GOB.",
  },
  {
    slug: "comunicacao-solicitacao",
    titulo: "Comunicação / Solicitação",
    categoria: "Geral",
    descricao: "Comunicações e solicitações diversas à Secretaria do GOB-SP.",
  },
];

export const CATEGORIAS_FORMULARIOS = [
  ...new Set(FORMULARIOS_GOB.map((f) => f.categoria)),
];
