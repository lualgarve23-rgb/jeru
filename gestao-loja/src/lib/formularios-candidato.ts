import { FORMULARIOS_GOB, type FormularioGob } from "@/lib/formularios-gob";

// Formulários que o candidato baixa no link público (/candidato/<token>).
// Lista fechada — o token não dá acesso aos demais formulários da Loja.
// Os formulários 105-3 (sindicância) e 105-4 (apresentação) são de uso
// exclusivo dos sindicantes da Loja e não aparecem no link do candidato.
const ARQUIVOS_INDICACAO = [
  "form-105-1-2-indicacao-candidato-dados.docx",
  "form-103-questionario.pdf",
  "form-104-testamento.pdf",
];

export function ehFormularioDeIndicacao(arquivo: string) {
  return ARQUIVOS_INDICACAO.includes(arquivo);
}

export const FORMULARIOS_INDICACAO: FormularioGob[] = FORMULARIOS_GOB.filter(
  (f) => ehFormularioDeIndicacao(f.arquivo)
);
