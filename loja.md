# Projeto: WebApp SaaS para Gestão de Lojas Maçônicas - Módulo Secretaria

## 1. Visão Geral e Arquitetura Multilocatário (SaaS)
Você atuará como um Engenheiro de Software Sênior desenvolvendo um sistema SaaS (Software as a Service) multi-tenant para Lojas Maçônicas.
- **Multi-tenancy Rigoroso:** Cada Loja é um `tenant`. Todas as tabelas do banco de dados devem possuir um `lodge_id` [4, 5]. Os dados de uma oficina jamais podem vazar para outra.
- **Autenticação:** O login exige o número do CIM (Cadastro de Identificação Maçônica), CPF, Senha e a validação do e-mail [6]. O usuário logado só tem acesso aos dados correspondentes ao seu `lodge_id`.
- **Governança e Segregação:** Usuários com perfis fiscalizadores (`CONSELHO_CONTAS`) não podem ter permissão de edição nos módulos executivos da Secretaria ou Tesouraria [7].

## 2. Stack Tecnológica
- **Front-end:** Next.js (App Router), React, Tailwind CSS, Shadcn UI, bibliotecas de Drag-and-Drop (ex: `dnd-kit` para o Kanban).
- **Back-end:** Next.js API Routes.
- **Banco de Dados:** PostgreSQL utilizando Prisma ORM.
- **Integrações:** Google Drive API (para arquivamento de atas e acervo histórico) [8].

## 3. Módulo de Secretaria: Dashboard e Gestão à Vista
A página inicial (`/dashboard/secretaria`) deve ser uma central de comando (Gestão à Vista) para o `VENERAVEL_MESTRE` e o `SECRETARIO`.
- **To-Do List de Assinaturas:** Cards alertando sobre Atas, *Quitte Placets* e Pranchas que aguardam a **assinatura digital dupla** [9, 10].
- **Alertas de Prazos (Notifications):**
  - **Interstícios:** Notificações automáticas de obreiros que atingiram o tempo mínimo legal no grau e estão aptos para elevação/exaltação [11].
  - **Prazos de Comunicação (15 Dias):** Alerta de que a Loja tem o prazo de até 15 dias após Sessões Magnas (Iniciação, Elevação, etc.) para enviar as fotos e matérias aos portais institucionais [12].
  - **Auditoria Cadastral:** Widget apontando obreiros com cadastro incompleto (especialmente falta de e-mail válido), o que gera bloqueio nas plataformas oficiais [6, 13, 14].

## 4. Módulo de Secretaria: Processos e Fluxos Burocráticos (Kanban)
Os processos administrativos devem ser exibidos visualmente em formato **Kanban** (colunas de arrastar e soltar), permitindo visualizar facilmente em qual etapa cada irmão/candidato se encontra [2].

### A. Pipeline de Admissão (Iniciação)
O fluxo do candidato (profano) segue etapas estritas [2]:
1. **Pré-Cadastro:** Upload de antecedentes penais e dados civis.
2. **Edital:** Emissão do Edital de Consulta.
3. **Sindicância:** Nomeação sigilosa da comissão e preenchimento de relatórios.
4. **Escrutínio:** Registro da votação secreta em plenário.
5. **Placet de Iniciação:** Envio do pedido de Placet às instâncias superiores.

### B. Pipeline de Progressão de Graus (Elevação e Exaltação - Visão Kanban)
O avanço na hierarquia maçônica (Aprendiz ➔ Companheiro ➔ Mestre) baseia-se no cumprimento de exigências rigorosas. Na interface do Secretário, o Kanban de Progressões será refletido com as travas oficiais da Secretaria de Guarda dos Selos e de Comunicação:

1. **`CUMPRIMENTO_INTERSTICIO` (Interstício):**
   - O sistema calcula automaticamente o tempo de permanência no grau. Card travado até o cumprimento do prazo legal.
2. **`INSTRUCAO_E_FREQUENCIA`:**
   - Validação automática no Livro de Presenças se o obreiro cumpriu a frequência e o período de instrução exigidos.
3. **`EXAME_PROFICIENCIA`:**
   - Aguardando agendamento ou aprovação na avaliação ritualística.
4. **`ESCRUTINIO_PROGRESSAO` (Votação):**
   - Votação em plenário para aprovar a mudança de grau.
5. **`AGUARDANDO_PLACET` (Solicitação à Guarda dos Selos):**
   - **Regra de Negócio:** Após a aprovação no escrutínio, o sistema gera automaticamente a prancha (ofício) solicitando o *Placet* de passagem/elevação à Secretaria Estadual da Guarda dos Selos. O botão de agendar a cerimônia fica bloqueado até o Secretário confirmar o recebimento desta autorização (`placetDeferido = true`).
6. **`AGUARDANDO_CERIMONIA` (Agendamento):**
   - Com o placet deferido, a Sessão Magna é agendada e o candidato aguarda a realização.
7. **`COMUNICACAO_POS_CERIMONIA` (Relatórios e Patentes):**
   - **Automações (Triggers):** Imediatamente após a realização da cerimônia, o card entra nesta coluna e engatilha duas ações:
     a) O sistema gera um Alerta de Prazo com contagem regressiva de **15 dias** cobrando o Secretário para enviar a comunicação (matéria e de 2 a 10 fotos) ao portal "Sua Sessão no GOB-SP". Se passar de 15 dias sem o Secretário marcar `comunicadoEnviado = true`, o card fica vermelho no painel inicial do Venerável Mestre.
     b) O sistema gera a solicitação oficial para a emissão dos diplomas e patentes do novo grau junto à Guarda dos Selos.
8. **`GRAU_CONCEDIDO` (Conclusão):**
   - Atualiza definitivamente o campo `Degree` no banco de dados e encerra o processo no Kanban.

### C. Pipeline de Movimentação (Quitte Placet e Filiação)
- **Trava Financeira do Quitte Placet:** O Secretário só pode emitir o documento de desligamento se o sistema consultar a Tesouraria e retornar a variável `quitacaoFinanceira = true` (Nada Consta) [15, 16].
- **Dupla Assinatura:** O documento final gerado exige a assinatura do Venerável e do Secretário [9, 17].

## 5. Módulo de Secretaria: Atas, Frequência e Documentos
- **Livro de Presença:** Módulo de check-in digital (suporte a QR Code) para membros locais e visitantes (registrando nome e potência de origem) [8, 18].
- **Lavratura de Atas:** Editor de texto rico para o "Balaústre". Só é considerado válido e trancado após a **assinatura digital conjunta** (Venerável + Secretário) [9, 17].
- **Integração Nuvem:** Expedição de ofícios numerados sequencialmente e sincronização direta (upload automático) de atas escaneadas para a pasta da Loja no Google Drive [8].

## 6. Modelagem de Dados (Prisma Schema - Completo para a Secretaria)

```prisma
model Lodge {
  id               String             @id @default(cuid())
  name             String
  number           String             @unique
  users            User[]
  processos        ProcessoAdmissao[]
  notifications    Notification[]
  atas             Ata[]
}

model User {
  id               String         @id @default(cuid())
  lodgeId          String
  cim              String         @unique // Cadastro de Identificação Maçônica
  cpf              String         @unique
  name             String
  email            String         @unique
  passwordHash     String
  degree           Degree         @default(APRENDIZ)
  currentRole      Role           @default(MEMBER)
  isDataPublic     Boolean        @default(false)
  dataIniciacao    DateTime?

  lodge            Lodge          @relation(fields: [lodgeId], references: [id])
  quittePlacets    QuittePlacet[]
  notifications    Notification[]
}

enum Degree {
  APRENDIZ
  COMPANHEIRO
  MESTRE
}

enum Role {
  MEMBER
  VENERAVEL_MESTRE
  SECRETARIO
  TESOUREIRO
  CONSELHO_CONTAS
}

model Ata {
  id               String   @id @default(cuid())
  lodgeId          String
  content          String
  date             DateTime
  signedByMaster   Boolean  @default(false)
  signedBySec      Boolean  @default(false)
  driveFileUrl     String?  // Link do Google Drive

  lodge            Lodge    @relation(fields: [lodgeId], references: [id])
}

model ProcessoAdmissao {
  id               String         @id @default(cuid())
  lodgeId          String
  nomeCandidato    String
  status           StatusAdmissao @default(DOCUMENTACAO)
  certidoesValidas Boolean        @default(false)
  dataEscrutinio   DateTime?
  aprovado         Boolean?

  lodge            Lodge          @relation(fields: [lodgeId], references: [id])
}

enum StatusAdmissao {
  DOCUMENTACAO
  EDITAL_PUBLICADO
  SINDICANCIA
  ESCRUTINIO
  AGUARDANDO_PLACET
  INICIADO
  REPROVADO
}

model QuittePlacet {
  id                 String       @id @default(cuid())
  userId             String
  lodgeId            String
  dataSolicitacao    DateTime     @default(now())
  quitacaoFinanceira Boolean      @default(false) // Trava de tesouraria
  status             StatusPlacet @default(PENDENTE)
  signedByMaster     Boolean      @default(false)
  signedBySec        Boolean      @default(false)

  user               User         @relation(fields: [userId], references: [id])
}

enum StatusPlacet {
  PENDENTE
  EM_ANALISE
  APROVADO
  NEGADO
}

model Notification {
  id          String           @id @default(cuid())
  lodgeId     String
  userId      String?
  title       String
  description String
  type        NotificationType
  isRead      Boolean          @default(false)
  dueDate     DateTime?        // Prazo de 15 dias, interstícios, etc.
  createdAt   DateTime         @default(now())

  lodge       Lodge            @relation(fields: [lodgeId], references: [id])
  user        User?            @relation(fields: [userId], references: [id])
}

enum NotificationType {
  PENDING_SIGNATURE
  DEADLINE_WARNING
  MISSING_DATA
  FINANCIAL_APPROVAL
}
```

### 6.1. Modelagem de Dados Adicional (Atualização de Progressão)
Modelagem para incluir os booleanos de trava do Placet e da Comunicação:

```prisma
model ProcessoProgressao {
  id                String           @id @default(cuid())
  userId            String           // Relaciona com o Obreiro (User)
  lodgeId           String
  grauAlvo          Degree           // COMPANHEIRO ou MESTRE
  status            StatusProgressao @default(CUMPRIMENTO_INTERSTICIO)

  dataInicio        DateTime         @default(now())
  dataAprovacao     DateTime?        // Data que passou no escrutínio
  placetDeferido    Boolean          @default(false) // Trava da Guarda dos Selos
  dataCerimonia     DateTime?        // Data da Elevação ou Exaltação
  comunicadoEnviado Boolean          @default(false) // Trava dos 15 dias (Sua Sessão no GOB-SP)

  user              User             @relation(fields: [userId], references: [id])
  lodge             Lodge            @relation(fields: [lodgeId], references: [id])
}

enum StatusProgressao {
  CUMPRIMENTO_INTERSTICIO
  INSTRUCAO_E_FREQUENCIA
  EXAME_PROFICIENCIA
  ESCRUTINIO_PROGRESSAO
  AGUARDANDO_PLACET
  AGUARDANDO_CERIMONIA
  COMUNICACAO_POS_CERIMONIA
  GRAU_CONCEDIDO
}
```

**Como essa atualização orienta a implementação:**
- **Trava `placetDeferido`:** o Secretário não pode mover o card para "Cerimônia" antes de confirmar que a Guarda dos Selos liberou o processo.
- **Trava `comunicadoEnviado`:** ao entrar em `COMUNICACAO_POS_CERIMONIA`, inicia-se a contagem de 15 dias; vencido o prazo sem envio da comunicação, o card fica vermelho no painel inicial do Venerável Mestre.

## 7. Próximas Melhorias (Frentes Funcionais)

### A. Central de Notificações
O próximo passo natural — o model `Notification` já existe no banco.
- **Sino no header:** Ícone de sino com badge contando notificações não lidas (`isRead = false`) do `lodge_id` do usuário logado.
- **Painel dropdown/página `/dashboard/notificacoes`:** Lista das notificações ordenadas por `createdAt` desc, agrupadas por tipo (`PENDING_SIGNATURE`, `DEADLINE_WARNING`, `MISSING_DATA`, `FINANCIAL_APPROVAL`), com destaque visual para as que têm `dueDate` vencido ou próximo (≤ 3 dias).
- **Ações:** Marcar como lida (individual e "marcar todas"), e link de cada notificação para o recurso correspondente (ata, processo, Quitte Placet).
- **Geração automática:** Rotina (cron/route handler) que cria notificações para: interstícios atingidos, prazo de 15 dias pós-Sessão Magna, cadastros incompletos e documentos aguardando assinatura.

### B. Troca de Senha Obrigatória no Primeiro Acesso
- Adicionar campo `mustChangePassword Boolean @default(true)` no model `User`.
- Quando o Secretário cadastra um obreiro, o sistema gera senha provisória; no primeiro login, o middleware redireciona para `/trocar-senha` e bloqueia o acesso a qualquer outra rota até a troca.
- Regras de senha: mínimo 8 caracteres, ao menos 1 número e 1 letra; a nova senha não pode ser igual à provisória. Após a troca, `mustChangePassword = false`.

### C. Assinatura Inline no Dashboard do Venerável Mestre
Refinar o fluxo de dupla assinatura: o VM assina sem sair do dashboard.
- Nos cards do To-Do de Assinaturas, botão **"Assinar agora"** abre um sheet/modal com a pré-visualização do documento (Ata, Quitte Placet ou Prancha).
- Confirmação exige re-digitação da senha (ou PIN) do VM como ato formal de assinatura; registrar `signedByMaster = true` com timestamp e trilha de auditoria (quem, quando, IP).
- Ao completar a segunda assinatura, o documento é trancado (imutável), a notificação `PENDING_SIGNATURE` correspondente é resolvida e, no caso de atas, dispara o upload para o Google Drive.

## 8. Instruções Iniciais para a Inteligência Artificial
Inicie o desenvolvimento configurando o banco de dados (PostgreSQL + Prisma) com o Schema acima. Em seguida, crie o layout base (Dashboard) utilizando Shadcn UI e implemente as interfaces de Kanban para os fluxos burocráticos e a central de alertas para os prazos de 15 dias e validação de e-mails. Pare e me peça para testar após configurar o banco e a primeira tela do Dashboard.

***

Com esse documento, a IA (como o Claude Code) terá não apenas a arquitetura técnica, mas todo o entendimento das regras de conformidade institucionais (trava financeira, dupla assinatura, prazos de relatórios) garantindo que o software reflita exatamente a realidade operacional exigida pelas Lojas e obediências [6, 9, 11, 17].

## 9. Estado da Implementação (atualizado em 11/07/2026)

Tudo do §1–§7 está implementado, testado e em produção (https://jeru.olgado.org). Além do spec original:

- **Tesouraria — gateway Asaas:** cobrança recorrente por cartão/boleto (assinaturas mensais), link de cobrança avulso por capitação e webhook com baixa automática (`/api/webhooks/asaas`, token por loja). Config por loja no card "Gateway Asaas". Aprovado em sandbox.
- **Inadimplência automática:** `Lodge.limiteInadimplencia` (default 3) — capitações vencidas mudam o membro para IRREGULAR e o quite reverte para ATIVO (`src/lib/inadimplencia.ts`).
- **Relatórios CSV:** balancete mensal, situação de mensalidades (inadimplência) e frequência anual por membro (`src/lib/csv.ts`, separador `;` e BOM para Excel BR).
- **Recuperação de senha com 2FA por e-mail:** `/esqueci-senha` (CIM+CPF → código de 6 dígitos por e-mail → nova senha), códigos bcrypt com 15 min e 5 tentativas.
- **Ata pré-preenchida:** ao lavrar a ata, o Secretário preenche um formulário com os campos livres do modelo (pauta do dia, 1º/2º/3º levantamentos, ausências justificadas, horário de encerramento) e o rascunho é gerado do modelo institucional (`src/lib/ata-template.ts`): data/hora por extenso, grau/tipo da sessão, cargos identificados entre os presentes, visitantes e contagem de obreiros; lacunas ficam como `_____`. Novo campo `Lodge.address` (endereço da sede citado na ata), editável no /admin.
- **Fluxo de validação e assinatura da Ata:** Rascunho → **envio da minuta por e-mail (cco) a todos os irmãos ativos para validação** (`EM_VALIDACAO`) → ajustes pedidos na reunião registrados no campo próprio (`Ata.ajustes`) e aplicados no texto → liberação para assinaturas (só permitida após a validação) → **Venerável Mestre assina primeiro, Secretário na sequência** (trava de ordem) → com as duas assinaturas habilita o botão **"Enviar aos irmãos do quadro"** (versão final por e-mail; a ata NÃO é expedida à Guarda dos Selos). Datas de envio registradas (`sentForReviewAt`, `sentToMembersAt`).
- **Assinatura visual:** cadastro do membro aceita imagem da assinatura (`User.signatureUrl`, até 500 KB) quando o cargo é Venerável Mestre, Secretário ou Orador; a página da ata exibe **pré-visualização em formato de documento** (fundo branco, serif) com bloco de assinaturas (imagem, nome, cargo e data).
- **Cargos de Loja completos:** enum `Role` inclui 1º/2º Vigilante, 1º/2º Diácono, Orador, Guarda Interno, Guarda Externo e Diretor de Cerimônias — todos com nível de acesso de Obreiro (as permissões de escrita seguem restritas a Secretário/Tesoureiro/VM; Conselho de Contas somente leitura). A ata preenche automaticamente todos os cargos citados no modelo.
- **Formulários oficiais do GOB-SP:** catálogo com 31 formulários (Form. 009 a 129 + atestado, obtidos no Conecta GOB-SP) em `src/lib/formularios-gob.ts` e `public/formularios-gob/`, exibidos por categoria (Admissão, Filiação e Regularização, Vida do Obreiro, Mútua, Administração da Loja) na página de Pranchas, com download atrás do login. Fluxo: baixar → preencher → anexar à prancha → assinar o anexo no gov.br (assinador.iti.br) → expedir à Guarda dos Selos.
- **Assinatura gov.br do anexo da prancha:** prancha com anexo só é enviada à Guarda dos Selos após o Secretário baixar o anexo (aberto dentro do app via `/api/pranchas/anexo`), assiná-lo no assinador.iti.br e subir o PDF assinado (validação PAdES `/ByteRange`); a versão assinada é arquivada no Drive e segue anexada ao e-mail.
- **Gmail da loja ativo** para envio de pranchas à Guarda dos Selos (gselos@gobsp.org.br), atas aos irmãos (validação e versão final) e códigos 2FA.
- **Certificado de Visita via QR Code:** visitante que faz check-in e informa e-mail recebe o certificado em PDF automaticamente (`src/lib/certificado.ts`); template personalizável por loja (upload de PPTX com marcadores em Configurações da Loja).
- **Preenchimento automático dos formulários GOB-SP:** diálogo "Preencher" no card das Pranchas gera o DOCX oficial com loja/oriente/datas/cargos (com CIM)/obreiro/candidato já preenchidos (`src/lib/formularios-fill.ts`).
- **Ata assinada → Drive:** na 2ª assinatura o PDF final é arquivado automaticamente no Google Drive da Loja (OAuth por loja, escopo drive.file); PDF e preview com **cabeçalho institucional** (logo, títulos, filete vermelho e divisa no rodapé — `Lodge.ataCabecalho/ataDivisa`, card em Configurações da Loja).
- **Interstícios vigentes:** Aprendiz→Companheiro 12 meses; Companheiro→Mestre **6 meses** no grau atual (`INTERSTICE_MONTHS` em `src/lib/permissions.ts`).
- **Foto do candidato no Kanban de Admissões:** `ProcessoAdmissao.fotoUrl` (até 500 KB) — upload no cadastro do candidato ou clicando no avatar do card.
- **Histórico de graus e cargos editável:** na página do membro, cada registro pode ser editado ou excluído; o sistema recalcula automaticamente o grau e o cargo atuais.
- **Cargos do rito personalizados:** página `/secretaria/cargos` (Secretário/VM) cadastra cargos conforme o rito da Loja (model `CargoRito`, único por nome no tenant); disponíveis na nomeação de membros e no histórico, exibidos no Quadro de Obreiros, sempre com nível de acesso de Obreiro. Cargo em uso não pode ser excluído.

- **Acessos desacoplados dos cargos (16/07/2026):** o `enum Role` ficou restrito aos perfis de sistema (Obreiro, VM, Secretário, Tesoureiro, Conselho de Contas, **Esmoler** e Super Admin); os 8 cargos ritualísticos migraram para o model `CargoRito` (`User.cargoRito`), com os cargos padrão semeados em todas as lojas (`src/lib/cargos.ts`, comparação tolerante a grafia). Na página do membro há dois controles independentes: "Nível de acesso ao sistema" (`setAccessRole`) e "Nomear para cargo do rito" (histórico em `RoleHistory`). Instruções de grau seguem os Vigilantes pelo cargo do rito. O novo acesso **Esmoler** recebe alertas dirigidos na central de notificações: irmão com `limiteInadimplencia - 1` capitações vencidas e frequência anual abaixo de `minFreqProgressao` (`src/lib/frequencia.ts`, mínimo de 3 sessões computadas no ano).

- **Tabela de presenças com alerta de frequência (16/07/2026):** a página da sessão exibe a tabela do quadro (irmãos aptos ao grau da sessão) com presença (manual/QR e horário), cargo e **frequência anual acumulada** vs. `minFreqProgressao` — badge vermelho abaixo do mínimo e amarelo até 10 pontos acima, com foco legal em Aprendizes e Companheiros (Mestres sem alerta); visitantes em card próprio e link do CSV anual mantido. Notificações automáticas de risco de interstício por frequência: uma da loja (VM/Secretário, `freq-risco:`) e uma dirigida ao próprio irmão (`freq-risco-self:`), além do alerta do Esmoler.

- **Assinatura gov.br da ata (fluxo externo):** o credenciamento direto na API do ITI é restrito a órgãos públicos, então o caminho em produção é o assinador.iti.br. Na liberação para assinaturas o Secretário escolhe a forma — **exclusiva** (`Ata.govbrSolicitado`): assinatura normal (interna, no sistema) **ou** assinatura gov.br, nunca as duas; no gov.br a ata vai direto ao fluxo externo sem assinatura interna, e a escolha pode ser mudada enquanto não houver assinatura em nenhum dos fluxos. Ordem de governança igual à interna: o VM baixa o PDF da ata (`/api/atas/pdf`, sem assinaturas internas), assina no assinador.iti.br e sobe (`govbrMasterAt`); o Secretário baixa a versão com a assinatura do VM, assina e sobe o arquivo final (`govbrSecAt`), validado (PAdES `/ByteRange`); essa 2ª assinatura sela a ata (status ASSINADA) e o PDF é arquivado no Drive (com `driveFileId` na ata e registro em Documentos). O código da API do ITI (`src/lib/govbr.ts`, OAuth + assinarPKCS7) permanece pronto e dormante, com a mesma trava de ordem no callback, caso um dia haja credenciamento.

Frentes planejadas: painel do super admin com status de pagamento das licenças (webhook Asaas da plataforma), lembretes automáticos de instruções/interstício por e-mail e publicação do app OAuth do Google (saída do modo de teste).
