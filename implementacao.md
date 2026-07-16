# Proposta de Melhorias: Sistema de Gestão Maçônica SaaS

Olá, Claude! Preciso da sua ajuda para implementar um novo pacote de melhorias no nosso Sistema de Gestão de Lojas Maçônicas. O sistema é um SaaS multi-tenant desenvolvido com **Next.js 16, React 19, Tailwind CSS 4, Shadcn UI, PostgreSQL e Prisma ORM**.

Abaixo estão as especificações divididas por módulos. Por favor, analise e sugira o plano de implementação (mudanças no schema.prisma, rotas de API, e componentes de UI).

## 1. Gestão de Acessos e Cargos (Refatoração de Roles)
Atualmente, o `enum Role` mistura níveis de acesso sistêmico com cargos em Loja. Precisamos desacoplar isso.

*   **Separação de Acessos vs. Cargos:** 
    *   Restringir o `enum Role` (permissões de sistema) aos perfis essenciais: `VENERAVEL_MESTRE`, `SECRETARIO`, `TESOUREIRO`, `CONSELHO_CONTAS` e `OBREIRO_COMUM`.
    *   Permitir que o Venerável Mestre e o Secretário associem os membros a esses acessos via interface.
    *   Os cargos ritualísticos deverão ser gerenciados estritamente pelo model `CargoRito` (ou campo similar), sem interferir nos privilégios de CRUD do sistema, mantendo a flexibilidade para o Rito da Loja.
*   **Novo Role Sistêmico: `ESMOLER`:**
    *   Criar o acesso de Hospitaleiro/Esmoler, focado no acompanhamento do bem-estar dos irmãos.
    *   **Regra de Notificação Financeira:** O sistema já possui a variável `limiteInadimplencia` no model `Lodge` (default de 3 meses para inativar o membro). O Esmoler deve receber um alerta automático via sistema quando um membro chegar a `limiteInadimplencia - 1` (ex: 2 capitações vencidas), para contatá-lo preventivamente.
    *   **Regra de Notificação de Frequência:** O Esmoler também deve ser notificado se a frequência do irmão cair abaixo da variável `minFreqProgressao` (configurada na Loja).

## 2. Controle de Presenças e Sessões (Módulo Secretaria)
Precisamos aprimorar a visibilidade das presenças registradas no model `Attendance`.

*   **Nova Tabela Visual de Presenças:** 
    *   Criar um componente de tabela (`DataTable` com Shadcn UI) dentro da visualização de sessões, listando claramente as presenças dos irmãos.
    *   Manter o botão/link de exportação (CSV/Excel) existente.
*   **Sistema de Alertas de Baixa Frequência:**
    *   Realizar o cálculo da frequência com base nas sessões computadas e comparar com a `minFreqProgressao` da Loja.
    *   **Destaque Visual:** Irmãos com frequência abaixo do mínimo legal devem receber um badge/alerta visual na tabela (em vermelho/amarelo). O foco principal dessa regra é alertar sobre a situação de **Aprendizes e Companheiros**.
    *   **Notificações (Push/In-app):** Disparar um alerta para a central de notificações (`Notification`) do próprio usuário, e também para o Venerável Mestre e Secretário, informando sobre o risco legal de atraso no interstício por falta de frequência.

## 3. Módulo Tesouraria e Balancetes
O model atual `Transaction` possui um campo `category`, mas precisamos expandir o CRUD e a visualização.

*   **Lançamento e Categorização:**
    *   Criar uma interface para lançamento manual de **Receitas** (além das automáticas geradas pelo Asaas).
    *   Permitir o cadastro dinâmico de **Categorias** (tags) tanto para o formulário de Receitas quanto para o formulário já existente de Despesas (`Expense`).
*   **Visão do Balancete:**
    *   Na página de emissão do Balancete Mensal, adicionar uma **segunda tabela consolidada**.
    *   Esta tabela deve exibir as visões financeiras agrupadas por essas categorias criadas (Ex: Total de Receitas por "Capitação", "Tronco"; Total de Despesas por "Aluguel", "Eventos", etc.), somando os totais de cada grupo.

## 4. UX/UI, Acessibilidade e Onboarding
Nosso público final (Mestres Maçons) possui uma faixa etária variada. O front-end precisa ser o mais amigável, intuitivo e moderno possível.

*   **Melhorias Gerais de Acessibilidade:** 
    *   Garantir alto contraste, botões com áreas de clique amigáveis (touch-friendly) e fontes legíveis.
*   **Tooltips de Contexto (Ícone `(i)`):**
    *   Em todas as telas principais (Dashboard, Kanban, Balancetes, Perfis), implementar um ícone de informação `(i)` próximo aos títulos ou botões de ação complexos.
    *   Ao clicar (ou passar o mouse), deve abrir um `Popover` ou `Tooltip` do Shadcn UI explicando em linguagem simples o que aquela tela faz, o que significam os termos (ex: "Quitte Placet", "Placet de Iniciação") ou como usar a ferramenta.

---
**Próximos Passos:** Claude, baseando-se no schema atual, por favor, me forneça:
1. O código de atualização sugerido para o `schema.prisma`.
2. O rascunho dos componentes principais (ex: o Popover de explicação `(i)` e a lógica da Tabela de Presenças).
3. A lógica para o disparo das notificações do Esmoler e de Frequência.
