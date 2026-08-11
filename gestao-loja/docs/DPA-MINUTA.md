# Minuta — Acordo de Tratamento de Dados Pessoais (DPA)

> **MINUTA — NÃO ASSINAR SEM REVISÃO JURÍDICA.** Este documento é um rascunho técnico
> preparado a partir da arquitetura real do sistema NoPrumo. Deve ser revisado e
> adaptado por advogado(a) habilitado(a) antes de qualquer assinatura.
> Campos entre `[colchetes]` devem ser preenchidos.

**Anexo ao Contrato de Licença de Uso da plataforma NoPrumo**

## Partes

- **CONTROLADORA:** a Loja Maçônica contratante — `[razão social/nome da Loja]`,
  CNPJ `[…]`, com sede em `[endereço]`, representada por `[Venerável Mestre / representante legal]`
  ("**Loja**").
- **OPERADORA:** `[razão social do fornecedor do NoPrumo]`, CNPJ `[…]`,
  com sede em `[endereço]` ("**NoPrumo**").

Regido pela Lei nº 13.709/2018 (**LGPD**).

## 1. Papéis e objeto

1.1. A **Loja é a Controladora** dos dados pessoais de seus membros, familiares,
candidatos e visitantes inseridos na plataforma: ela decide quem cadastrar, quais
dados coletar e por quanto tempo mantê-los.

1.2. O **NoPrumo é o Operador**: trata os dados exclusivamente para prestar o
serviço contratado (gestão administrativa da Loja), conforme instruções da Loja
materializadas no uso da plataforma e neste acordo.

1.3. O NoPrumo não usa os dados para finalidade própria (marketing, perfilamento,
venda ou enriquecimento de bases), nem os compartilha fora do rol de
suboperadores do Anexo II.

## 2. Dados tratados e titulares

| Categoria | Exemplos | Titulares |
|---|---|---|
| Identificação | nome, CPF, CIM, data de nascimento, foto | membros, candidatos |
| Contato | e-mail, telefone, endereço | membros, familiares, candidatos |
| Vida associativa | grau, cargo, frequência, atas, pranchas, baixas | membros |
| Financeiros | mensalidades, cobranças (via Asaas), inadimplência | membros |
| Saúde/família | dependentes, datas comemorativas, informações declaradas em formulários | familiares, candidatos |
| **Dados sensíveis** | a própria condição de membro/candidato de organização de caráter filosófico (LGPD art. 5º, II) | todos |

2.1. **Todo o acervo é tratado como sensível** por revelar filiação a organização
de caráter filosófico/religioso, com as salvaguardas técnicas do Anexo I.

## 3. Obrigações do Operador (NoPrumo)

a) Tratar os dados somente conforme este acordo e as instruções da Loja;
b) Garantir sigilo: acesso interno restrito ao mínimo necessário para suporte e operação, sob dever de confidencialidade;
c) Manter as medidas de segurança do **Anexo I** e não reduzi-las sem aviso prévio;
d) Auxiliar a Loja no atendimento a direitos dos titulares (art. 18) — a plataforma já oferece exportação de dados (`Meus Dados`), solicitação de exclusão e anonimização irreversível auditada;
e) Notificar a Loja **em até 48 horas** após tomar ciência de incidente de segurança envolvendo dados pessoais, com as informações do art. 48 §1º;
f) Não subcontratar novos suboperadores sem atualizar o Anexo II e comunicar a Loja com antecedência mínima de 30 dias (direito de objeção);
g) Ao término do contrato, devolver os dados em formato estruturado (backup ZIP) e **apagar** as cópias sob seu controle em até 30 dias, ressalvadas obrigações legais de guarda;
h) Manter registro das operações de tratamento (a plataforma mantém log de auditoria);
i) Cooperar com a ANPD e com a Loja em fiscalizações e relatórios de impacto.

## 4. Obrigações da Controladora (Loja)

a) Possuir base legal para o tratamento (art. 7º e, para dados sensíveis, art. 11 — em regra, consentimento do titular ou tratamento por organização sem fim lucrativo de caráter filosófico restrito aos seus membros, art. 11, II, "a");
b) Cadastrar apenas dados necessários e mantê-los atualizados;
c) Informar seus membros sobre o uso da plataforma e este acordo;
d) Gerir os acessos internos (perfis, cargos e permissões dentro do sistema);
e) Atender diretamente os pedidos de titulares, usando as ferramentas da plataforma.

## 5. Transferência internacional

5.1. Backups cifrados e e-mails transitam por serviços do Google e a hospedagem
utiliza a Oracle Cloud (Anexo II), que podem armazenar dados fora do Brasil.
A transferência ampara-se no art. 33 da LGPD (países/entidades com grau adequado
de proteção ou cláusulas contratuais dos próprios provedores).

## 6. Responsabilidade

6.1. Cada parte responde pelos danos que causar por descumprimento da LGPD ou
deste acordo, na medida de sua culpa, nos termos dos arts. 42 a 45.
`[Ajustar limitação de responsabilidade conforme o contrato principal.]`

## 7. Vigência

7.1. Vigora enquanto durar o contrato principal e, quanto aos deveres de sigilo
e eliminação, após seu término.

---

## Anexo I — Medidas técnicas e organizacionais (implementadas)

- **Criptografia em trânsito:** HTTPS obrigatório (redirect 301) com HSTS.
- **Criptografia de segredos em repouso:** AES-256-GCM para credenciais de
  integrações armazenadas no banco.
- **Autenticação e sessão:** senhas com hash forte; cookies `Secure`/`HttpOnly`;
  sessão expira em 8h; segregação por perfil/cargo (menor privilégio).
- **Isolamento multi-tenant:** todo acesso a dados é escopado pela loja
  (`lodgeId`); mídia servida apenas a usuários autenticados da mesma loja.
- **Rate limiting** nas rotas públicas (convites, check-in, verificação).
- **Cabeçalhos de segurança:** CSP, X-Frame-Options, nosniff, Referrer-Policy.
- **Log de auditoria** de ações sensíveis (membros, finanças, configurações).
- **Backups automáticos cifrados** com teste de restauração documentado (runbook);
  retenção definida no runbook de backup.
- **Direitos do titular na plataforma:** exportação (portabilidade), pedido de
  exclusão e anonimização irreversível com trilha de auditoria.
- **Observabilidade:** logs estruturados e alerta por e-mail em falhas críticas.

## Anexo II — Suboperadores autorizados

| Suboperador | Serviço | Dados envolvidos |
|---|---|---|
| Oracle Cloud (OCI) | hospedagem do servidor e banco de dados | todo o acervo |
| Google LLC (Drive) | armazenamento de backups cifrados | backup completo |
| Google LLC (Gmail/OAuth) | envio de e-mails transacionais da Loja | nome, e-mail, conteúdo das mensagens |
| Asaas Gestão Financeira S.A. | emissão de cobranças (Pix/boleto) | nome, CPF, e-mail, valores |

---

**Local e data:** `[…]`

| CONTROLADORA (Loja) | OPERADORA (NoPrumo) |
|---|---|
| `[nome e assinatura]` | `[nome e assinatura]` |
