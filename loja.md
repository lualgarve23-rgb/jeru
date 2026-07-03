# Projeto: WebApp SaaS para Gestão de Lojas Maçônicas

## 1. Visão Geral e Contexto
Você atuará como um Engenheiro de Software Sênior para desenvolver um sistema SaaS (Software as a Service) multilocatário (Multi-tenant) voltado para a gestão administrativa e financeira de Lojas Maçônicas. 
O sistema automatizará a Secretaria e a Tesouraria, garantindo total isolamento de dados entre as Lojas (Tenants) e aplicando regras estritas de governança e compliance do direito maçônico.

## 2. Stack Tecnológica Sugerida (Pode adaptar se necessário)
- **Front-end:** Next.js (App Router), React, Tailwind CSS, Shadcn UI.
- **Back-end:** Next.js API Routes (ou Node.js/Express isolado).
- **Banco de Dados:** PostgreSQL utilizando Prisma ORM (com separação por `tenant_id` em todas as tabelas).
- **Autenticação:** NextAuth.js / Auth.js (Suporte a credenciais customizadas: CIM + Senha + Palavra Semestral).
- **Integrações:** Google Drive API (Armazenamento de documentos/atas) e Gateway de Pagamentos (ex: Asaas, Stripe ou Mercado Pago para Pix e Cartão).

## 3. Arquitetura Multilocatário e Segurança (LGPD)
- **Multi-tenancy:** Toda entidade no banco de dados DEVE ter um `lodge_id` (Tenant). As consultas (Queries) sempre devem filtrar pelo `lodge_id` do usuário logado.
- **Autenticação:** O login requer o Número do CIM (Cadastro de Identificação Maçônica), CPF e Senha. O e-mail será usado como 2FA para recuperação.
- **Privacidade (LGPD):** O obreiro terá um "Painel de Privacidade" para ocultar seus dados de contato dos demais membros da loja.
- **Segregação de Funções:** Usuários com a role `CONSELHO_CONTAS` (Fiscalizadores) não podem ter permissão de escrita/edição nos módulos de Tesouraria ou Secretaria.

## 4. Módulo de Secretaria (Regras de Negócio)
A Secretaria é o núcleo de gestão documental e evolução dos obreiros.
- **Controle de Obreiros e Graus:**
  - Cadastro completo com dados civis e maçônicos.
  - Tabela de `Degrees` (Aprendiz, Companheiro, Mestre) com controle de interstício (tempo mínimo obrigatório entre graus).
  - Histórico cronológico de cargos ocupados (`Role_History`).
- **Atas e Frequência:**
  - `Livro de Presenças` digital com opção de check-in via QR Code para membros e visitantes (registrando a potência de origem).
  - Lavratura de Atas (Balaústres) no sistema.
  - **Trava de Governança:** Toda Ata finalizada exige a **assinatura digital conjunta** do Venerável Mestre e do Secretário.
- **Documentos e Integração Google Drive:**
  - Expedição de correspondências (pranchas) com numeração sequencial automática.
  - Sincronização e upload de arquivos históricos e atas escaneadas diretamente para uma pasta da Loja no Google Drive.

## 5. Módulo de Tesouraria (Regras de Negócio)
A Tesouraria exige controle estrito contra inadimplência e travas de segurança financeira.
- **Faturamento Recorrente e Mensalidades:**
  - Geração automática de mensalidades (capitações) para os membros ativos.
  - Integração via API (Gateway) para cobrança recorrente no Cartão de Crédito (com auto-updater) e geração de Boleto.
- **Integração Pix via Webhook:**
  - Geração de payload Pix Copia e Cola / QR Code Dinâmico no front-end.
  - Rota de Webhook no back-end para receber a confirmação do pagamento e dar baixa automática na mensalidade.
- **Contabilidade e Transparência:**
  - Balancetes mensais automáticos unindo Receitas e Despesas.
  - Módulo de arrecadação extra: Tronco de Solidariedade e venda de ingressos para eventos beneficentes.
- **Trava de Governança Financeira:**
  - Qualquer assunção de despesa ou repasse no sistema exige a **aprovação/assinatura dupla** do Venerável Mestre e do Tesoureiro.

## 6. Modelagem de Dados Base (Prisma Schema - Rascunho Inicial)
```prisma
model Lodge {
  id          String   @id @default(cuid())
  name        String
  number      String   @unique
  users       User[]
  documents   Document[]
  transactions Transaction[]
  // ... outros campos
}

model User {
  id               String   @id @default(cuid())
  lodgeId          String
  cim              String   @unique // Cadastro de Identificação Maçônica
  cpf              String   @unique
  name             String
  email            String   @unique
  passwordHash     String
  degree           Degree   @default(APRENDIZ)
  currentRole      Role     @default(MEMBER)
  isDataPublic     Boolean  @default(false) // Controle LGPD
  lodge            Lodge    @relation(fields: [lodgeId], references: [id])
  // ... relacionamentos
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
  // ...
}