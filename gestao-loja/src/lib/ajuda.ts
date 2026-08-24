// Textos de ajuda em linguagem simples, exibidos no ícone (i) das telas
// principais (componente InfoDica). Público de faixa etária variada:
// frases curtas, sem jargão de sistema.

export const AJUDA = {
  dashboard:
    "Visão geral da Loja: o que precisa de assinatura, prazos que estão correndo, aniversariantes e números do mês. Clique em qualquer cartão para ir direto à tarefa.",
  notificacoes:
    "Central de avisos do sistema: assinaturas pendentes, prazos de 15 dias, cadastros incompletos e alertas de frequência ou inadimplência. Ao resolver a pendência, o aviso some sozinho.",
  membros:
    "Quadro de Obreiros da Loja: dados de contato, grau, cargo e situação (ativo, irregular, licenciado). Clique em um irmão para editar o cadastro, registrar grau ou nomear para cargo.",
  membroAcesso:
    "Nível de acesso define o que o irmão pode fazer NO SISTEMA (ex.: Secretário edita a Secretaria, Tesoureiro edita a Tesouraria). É independente do cargo na Loja.",
  membroCargo:
    "Cargo ritualístico exercido na Loja (Vigilante, Orador…). É registrado no histórico e aparece nas atas, mas não muda as permissões no sistema.",
  cargos:
    "Cadastre aqui os cargos conforme o rito da sua Loja (ex.: Mestre de Harmonia). Eles ficam disponíveis na nomeação de membros. Cargo em uso não pode ser excluído.",
  sessoes:
    "Registro das sessões da Loja. Cada sessão tem QR Code de check-in para presença de membros e visitantes, o Livro de Presenças com a frequência anual de cada irmão e o botão para lavrar a ata.",
  frequencia:
    "A frequência mínima é requisito legal para a progressão de grau. O percentual considera só as sessões que o irmão podia assistir (pelo grau dele). Vermelho = abaixo do mínimo da Loja; amarelo = perto do mínimo.",
  atas:
    "Fluxo da ata: o rascunho é gerado do modelo da Loja → a minuta vai por e-mail aos irmãos para validação → ajustes são aplicados → Venerável assina primeiro e Secretário depois (ou ambos pelo gov.br) → a versão final vai ao quadro e ao Drive.",
  pranchas:
    "Prancha é o ofício formal da Loja (equivale a uma carta oficial). Baixe o formulário do GOB-SP, preencha, anexe à prancha, assine o anexo no gov.br e o sistema envia à Guarda dos Selos pelo Gmail da Loja.",
  emails:
    "Caixa de entrada do Gmail da Loja, sem sair do sistema: veja as respostas da Guarda dos Selos e de outras Lojas, baixe anexos e responda na mesma conversa.",
  documentos:
    "Arquivo digital da Loja no Google Drive: atas assinadas, regulamentos e documentos históricos. O que é enviado aqui fica guardado no Drive conectado da Loja.",
  biblioteca:
    "Acervo digital da Loja: livros, rituais, decretos e regulamentos disponíveis a todos os irmãos para consulta e download. O envio e a remoção de arquivos são feitos pela Secretaria.",
  carteirinha:
    "Sua identificação maçônica digital, com QR Code de verificação. Apresente na tela do celular ao visitar outra Loja — quem escanear o código vê a confirmação de que você é membro regular. Use o botão de imprimir para levar em papel.",
  mutua:
    "A Mútua (CABM — Caixa de Assistência e Beneficência Maçônica) ampara a família do irmão. Aqui você confere se já entregou a Declaração de Beneficiários (Form. 108); se ainda não, baixe o formulário pré-preenchido, complete os beneficiários, assine (com firma reconhecida em cartório) e anexe para enviar à Secretaria. A entrega fica visível ao Secretário, ao Venerável Mestre, ao Tesoureiro e ao Esmoler. O link do Conecta GOB-SP permite consultar o relatório oficial de entregas. O Secretário e o Venerável Mestre podem marcar os irmãos que já haviam entregue em papel, antes da implantação do sistema. Obreiros filiados entregam a declaração na loja-mãe.",
  admissoes:
    "Qualquer irmão pode apadrinhar um candidato: abra o cadastro inicial e o sistema gera um link pessoal para ele baixar os formulários de indicação (já preenchidos com os dados da Loja) e devolvê-los preenchidos. A Secretaria conduz as etapas seguintes: edital, sindicância (comissão), escrutínio (votação) e Placet — a autorização final da Potência.",
  progressoes:
    "Caminho do irmão para o próximo grau (Elevação = Companheiro, Exaltação = Mestre). O sistema confere interstício (tempo mínimo no grau), instruções e frequência antes de liberar as etapas.",
  instrucoes:
    "Instruções de grau ministradas pelos Vigilantes: Aprendizes com o 2º Vigilante e Companheiros com o 1º. Registre cada instrução dada; a meta é configurada pela Loja.",
  atestado:
    "O Atestado de Regularidade declara que o irmão é membro efetivo e está em dia com os metais e demais deveres maçônicos. Qualquer irmão ATIVO pode solicitar; o documento segue para as assinaturas do Tesoureiro, do Secretário e do Venerável Mestre (nesta ordem), sempre pelo gov.br (assinatura digital ICP — direto pela conta ou pelo portal assinador.iti.br). O solicitante acompanha aqui com quem a assinatura está pendente; os cargos assinam na aba Processos; ao final o PDF fica disponível para download.",
  processos:
    "Processos é a caixa de entrada de assinaturas gov.br de todos os cargos: Atestados de Regularidade, Quitte Placets e os documentos oficiais da Secretaria que precisam de assinaturas em cadeia — anexos de pranchas, formulários GOB preenchidos e outros ofícios em PDF. O Secretário define a ordem dos cargos assinantes e o Venerável Mestre assina sempre por último, selando o documento. Todas as assinaturas são pelo gov.br (direto pela conta ou pelo portal assinador.iti.br) e ficam embutidas no PDF. Após a última assinatura, o sistema pergunta o destinatário do envio — a Guarda dos Selos fica em destaque como padrão e é possível copiar irmãos do quadro. Quando o documento vem de uma prancha, a versão assinada volta para ela automaticamente, e os kanbans de Admissão/Progressão só avançam com a prancha do Placet assinada e enviada.",
  quitte:
    "Quitte Placet é o documento de desligamento ou transferência do irmão. Qualquer irmão ATIVO pode solicitar o seu, anexando a carta escrita a próprio punho e assinada (obrigatória). Só pode ser emitido com o Nada Consta da Tesouraria (trava financeira) e a dupla assinatura gov.br — o Secretário primeiro e o Venerável Mestre por último. O irmão acompanha aqui com quem o pedido está pendente; a Secretaria faz a triagem (carta, Nada Consta, Form. 122 em PDF), as assinaturas são colhidas na aba Processos e, aprovado, o documento é enviado à Guarda dos Selos.",
  mensalidades:
    "Capitações (mensalidades) dos irmãos: gere as cobranças do mês, envie link de pagamento (cartão, boleto ou Pix pelo Asaas) ou dê baixa manual. Vencidas em excesso tornam o irmão irregular automaticamente.",
  despesas:
    "Toda despesa precisa da aprovação do Venerável Mestre E do Tesoureiro antes de ser paga (trava de governança). Ao pagar, entra automaticamente no livro-caixa do balancete.",
  balancete:
    "Livro-caixa do mês: receitas (capitações, tronco, eventos) e despesas, com totais por categoria. Use “Lançar receita” para entradas manuais e exporte o CSV para prestação de contas.",
  configloja:
    "Parâmetros da Loja: dados cadastrais, frequência mínima para progressão, limite de inadimplência, gateway de pagamento, Google Drive/Gmail e o cabeçalho institucional das atas.",
} as const;
