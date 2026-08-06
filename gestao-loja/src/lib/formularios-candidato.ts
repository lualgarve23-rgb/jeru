import { FORMULARIOS_GOB, type FormularioGob } from "@/lib/formularios-gob";

// Formulários que o candidato baixa no link público (/candidato/<token>).
// Lista fechada — o token não dá acesso aos demais formulários da Loja.
const ARQUIVOS_INDICACAO = [
  "form-105-1-2-indicacao-candidato-dados.docx",
  "form-105-3-indicacao-candidato-sindicancia.docx",
  "form-105-4-indicacao-candidato-apresentacao.docx",
  "form-103-questionario.pdf",
  "form-104-testamento.pdf",
];

export const FORMULARIOS_INDICACAO: FormularioGob[] = ARQUIVOS_INDICACAO.flatMap(
  (arquivo) => FORMULARIOS_GOB.filter((f) => f.arquivo === arquivo)
);

export function ehFormularioDeIndicacao(arquivo: string) {
  return ARQUIVOS_INDICACAO.includes(arquivo);
}
