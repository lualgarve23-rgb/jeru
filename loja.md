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

### B. Pipeline de Progressão (Elevação e Exaltação)
- **Trava Sistêmica:** O botão de "Aprovar Progressão" deve ficar bloqueado até que o sistema valide o cumprimento do tempo de interstício e o quórum de frequência nas instruções [11].
- Registro de aprovação no exame de proficiência.

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

## 7. Instruções Iniciais para a Inteligência Artificial
Inicie o desenvolvimento configurando o banco de dados (PostgreSQL + Prisma) com o Schema acima. Em seguida, crie o layout base (Dashboard) utilizando Shadcn UI e implemente as interfaces de Kanban para os fluxos burocráticos e a central de alertas para os prazos de 15 dias e validação de e-mails. Pare e me peça para testar após configurar o banco e a primeira tela do Dashboard.

***

Com esse documento, a IA (como o Claude Code) terá não apenas a arquitetura técnica, mas todo o entendimento das regras de conformidade institucionais (trava financeira, dupla assinatura, prazos de relatórios) garantindo que o software reflita exatamente a realidade operacional exigida pelas Lojas e obediências [6, 9, 11, 17].
