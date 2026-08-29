// FAQ estática do app para a ferramenta ajuda_app do Assistente IA.
// Respostas curtas apontando a rota certa — a IA cita e complementa.
// Complementada pelos textos de ajuda das telas (AJUDA, src/lib/ajuda.ts) e
// pelos guias PASSO A PASSO dos fluxos de assinatura (GUIAS, abaixo).

import { AJUDA } from "@/lib/ajuda";

export const FAQ: Record<string, { titulo: string; resposta: string }> = {
  carteirinha: {
    titulo: "Carteirinha Digital",
    resposta:
      "A carteirinha fica em /dashboard/carteirinha. O QR Code permite a verificação pública da regularidade; o token pode ser regenerado no Meu perfil para revogar carteirinhas antigas.",
  },
  capitacoes: {
    titulo: "Capitações (mensalidades)",
    resposta:
      "As cobranças aparecem no Dashboard e podem ser pagas por Pix (Copia e Cola) ou pelo link do gateway quando a loja usa Asaas. Dúvidas sobre baixa de pagamento: falar com o Tesoureiro.",
  },
  atestado: {
    titulo: "Atestado de Regularidade",
    resposta:
      "Qualquer irmão ativo solicita em /secretaria/atestados. O documento segue para assinatura gov.br na ordem Tesoureiro → Secretário → Venerável; o solicitante acompanha a linha do tempo e recebe o PDF pronto.",
  },
  "quitte-placet": {
    titulo: "Quitte Placet",
    resposta:
      "O pedido é feito em /secretaria/quitte-placets e exige a foto da carta escrita a próprio punho e assinada. Requer quitação financeira; as assinaturas (Secretário → Venerável) são pelo gov.br.",
  },
  mutua: {
    titulo: "Mútua (CABM) — Form. 108",
    resposta:
      "A Declaração de Beneficiários fica em /dashboard/mutua: baixe o formulário pré-preenchido, assine e anexe para enviar à Secretaria. Filiados entregam na loja-mãe.",
  },
  benemerencia: {
    titulo: "Bolsa de Benemerência",
    resposta:
      "Doações por Pix em /dashboard/benemerencia — QR Code e Copia e Cola com valor livre, definido no app do banco.",
  },
  govbr: {
    titulo: "Assinatura gov.br",
    resposta:
      "Documentos oficiais (exceto atas por clique) são assinados pelo gov.br: pelo botão de OAuth dentro do sistema ou baixando o PDF, assinando no portal assinador.iti.br e reenviando o arquivo.",
  },
  senha: {
    titulo: "Senha e acesso",
    resposta:
      "A troca de senha fica em /dashboard/senha. Esqueceu a senha? Use “Esqueci minha senha” no login: o código de recuperação vai para o e-mail cadastrado (CIM + CPF).",
  },
  privacidade: {
    titulo: "Privacidade (LGPD)",
    resposta:
      "Em /dashboard/privacidade você controla a visibilidade dos seus contatos, baixa uma cópia dos seus dados e pode solicitar exclusão.",
  },
  sessoes: {
    titulo: "Sessões e presença",
    resposta:
      "As próximas sessões e o histórico ficam em /secretaria/sessoes. A presença é registrada por QR Code no dia; o convite por e-mail permite confirmar presença (RSVP) e Ágape.",
  },
};

// Guias PASSO A PASSO de "como faço para…" — fluxos com mais de uma etapa,
// principalmente os de assinatura. Cada passo diz QUEM faz e ONDE no app.
export const GUIAS: Record<
  string,
  { titulo: string; passos: string[]; observacao?: string }
> = {
  "assinar-atestado": {
    titulo: "Como funciona a assinatura do Atestado de Regularidade",
    passos: [
      "O irmão ATIVO solicita em /secretaria/atestados (botão Solicitar).",
      "O Tesoureiro assina primeiro, na aba /secretaria/processos, pelo gov.br.",
      "O Secretário assina em seguida, no mesmo lugar.",
      "O Venerável Mestre assina por último, selando o documento.",
      "O solicitante acompanha a linha do tempo em /secretaria/atestados e baixa o PDF pronto ao final.",
    ],
    observacao:
      "Cada assinatura pode ser feita pelo botão gov.br dentro do sistema (OAuth) ou baixando o PDF, assinando em assinador.iti.br e reenviando o arquivo — o sistema valida que o PDF devolvido é o mesmo, com a assinatura nova por cima.",
  },
  "assinar-quitte": {
    titulo: "Como funciona a assinatura do Quitte Placet",
    passos: [
      "O irmão ATIVO solicita em /secretaria/quitte-placets, anexando a foto/PDF da carta escrita a próprio punho e assinada (obrigatória).",
      "A Secretaria faz a triagem: confere a carta, o Nada Consta da Tesouraria (trava financeira) e prepara o Form. 122 em PDF.",
      "O Secretário assina pelo gov.br na aba /secretaria/processos.",
      "O Venerável Mestre assina por último.",
      "Aprovado, o documento é enviado à Guarda dos Selos pelo Gmail da Loja; o irmão acompanha tudo pela linha do tempo do pedido.",
    ],
  },
  "assinar-documento": {
    titulo: "Como assinar um documento avulso (Processos)",
    passos: [
      "O Secretário (ou VM) cria o processo em /secretaria/processos, anexando o PDF (ofício, formulário GOB, anexo de prancha).",
      "Define a ordem dos cargos assinantes — o Venerável Mestre sempre assina por último.",
      "Cada assinante recebe notificação e assina na sua vez, na própria aba Processos, pelo gov.br (direto pela conta ou via assinador.iti.br com reenvio do PDF).",
      "Após a última assinatura, o sistema pergunta o destinatário do envio (Guarda dos Selos em destaque; dá para copiar irmãos do quadro).",
      "Se o documento veio de uma prancha, a versão assinada volta para ela automaticamente.",
    ],
  },
  "assinar-ata": {
    titulo: "Como funciona a assinatura da ata",
    passos: [
      "O Secretário lavra o rascunho a partir do modelo da Loja, na sessão em /secretaria/sessoes.",
      "A minuta segue por e-mail aos irmãos para validação e ajustes.",
      "O Venerável Mestre assina primeiro e o Secretário depois — por clique no sistema ou ambos pelo gov.br.",
      "A versão final vai ao quadro e ao Google Drive da Loja.",
    ],
  },
  "enviar-prancha": {
    titulo: "Como enviar uma prancha (ofício) assinada",
    passos: [
      "Em /secretaria/pranchas, baixe o formulário do GOB-SP e preencha.",
      "Anexe o PDF preenchido à prancha.",
      "Assine o anexo pelo gov.br (a coleta das assinaturas em cadeia acontece na aba Processos).",
      "Com tudo assinado, o sistema envia à Guarda dos Selos pelo Gmail da Loja; a resposta chega em /secretaria/emails.",
    ],
  },
  "entregar-mutua": {
    titulo: "Como entregar a Declaração de Beneficiários (Form. 108)",
    passos: [
      "Acesse /dashboard/mutua e baixe o formulário pré-preenchido.",
      "Complete os beneficiários e assine (com firma reconhecida em cartório).",
      "Anexe o arquivo na mesma página para enviar à Secretaria.",
      "Filiados entregam na loja-mãe; Secretário e VM podem marcar entregas anteriores ao sistema.",
    ],
  },
  "aprovar-despesa": {
    titulo: "Como aprovar e pagar uma despesa",
    passos: [
      "O Tesoureiro lança a despesa em /tesouraria/despesas.",
      "O Venerável Mestre E o Tesoureiro aprovam (trava de governança — os dois são obrigatórios).",
      "Só então a despesa pode ser marcada como paga; o pagamento entra automaticamente no livro-caixa do balancete.",
    ],
  },
};

// Busca em três camadas: FAQ → GUIAS (passo a passo) → AJUDA das telas.
export function buscarFaq(chave: string) {
  const k = chave.trim().toLowerCase();
  if (FAQ[k]) return FAQ[k];
  if (GUIAS[k]) return GUIAS[k];
  const acha = <T,>(obj: Record<string, T>, titulo: (v: T) => string) =>
    Object.entries(obj).find(
      ([key, v]) => key.includes(k) || titulo(v).toLowerCase().includes(k)
    )?.[1];
  const guia = acha(GUIAS, (g) => g.titulo);
  if (guia) return guia;
  const faq = acha(FAQ, (f) => f.titulo);
  if (faq) return faq;
  const ajuda = Object.entries(AJUDA).find(([key]) => key.toLowerCase().includes(k));
  if (ajuda) return { titulo: ajuda[0], resposta: ajuda[1] };
  return null;
}

export const FAQ_CHAVES = [...Object.keys(FAQ), ...Object.keys(GUIAS)];
