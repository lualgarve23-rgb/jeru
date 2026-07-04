---
name: Gestão de Lojas Maçônicas
description: Sistema de design sóbrio e institucional para o SaaS de secretaria e tesouraria de lojas maçônicas.
colors:
  ardosia-solene: "#0f172a"
  ardosia-profunda: "#020617"
  ouro-de-sinete: "#fbbf24"
  ouro-firme: "#f59e0b"
  papel-de-registro: "#f1f5f9"
  superficie: "#ffffff"
  tinta: "#171717"
  tinta-suave: "#64748b"
  tinta-apagada: "#94a3b8"
  linha: "#e2e8f0"
  verde-quitado: "#15803d"
  vermelho-pendente: "#b91c1c"
typography:
  headline:
    fontFamily: "Geist, system-ui, sans-serif"
    fontSize: "1.5rem"
    fontWeight: 600
    lineHeight: 1.25
  title:
    fontFamily: "Geist, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 600
    lineHeight: 1.3
  body:
    fontFamily: "Geist, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "Geist, system-ui, sans-serif"
    fontSize: "0.6875rem"
    fontWeight: 600
    letterSpacing: "0.05em"
rounded:
  md: "6px"
  xl: "12px"
  full: "9999px"
spacing:
  sm: "8px"
  md: "16px"
  lg: "24px"
  xl: "32px"
components:
  button-primary:
    backgroundColor: "{colors.ardosia-solene}"
    textColor: "{colors.superficie}"
    rounded: "{rounded.md}"
    height: "36px"
    padding: "8px 16px"
  button-cta-auth:
    backgroundColor: "{colors.ouro-firme}"
    textColor: "{colors.ardosia-profunda}"
    rounded: "{rounded.md}"
    height: "36px"
  button-outline:
    backgroundColor: "{colors.superficie}"
    textColor: "{colors.tinta}"
    rounded: "{rounded.md}"
    height: "36px"
  card:
    backgroundColor: "{colors.superficie}"
    textColor: "{colors.tinta}"
    rounded: "{rounded.xl}"
    padding: "24px"
  input:
    backgroundColor: "transparent"
    textColor: "{colors.tinta}"
    rounded: "{rounded.md}"
    height: "36px"
    padding: "4px 12px"
  badge-status:
    textColor: "{colors.verde-quitado}"
    rounded: "{rounded.full}"
    padding: "2px 8px"
---

# Design System: Gestão de Lojas Maçônicas

## 1. Overview

**Creative North Star: "O Livro de Atas"**

A interface é um livro de registros digital: solene, precisa e legível. As zonas de identidade (sidebar, login) são escuras como a capa do livro — Ardósia Solene — seladas com um único toque de Ouro de Sinete. As zonas de trabalho são claras como papel de registro: fundo cinza-frio, folhas brancas, tinta escura. A cor aparece quando carrega significado (quitado, pendente, vencido, aguardando assinatura), nunca como decoração.

O sistema rejeita explicitamente o SaaS genérico colorido (gradientes decorativos, cards coloridos por métrica, mascotes), o sistema governamental antigo (densidade cinza e burocrática) e o esotérico caricato (simbologia excessiva, texturas escuras teatrais). A tradição é carregada pela sobriedade e pelo sinete de ouro, não por símbolos.

**Key Characteristics:**
- Duas zonas: chrome escuro (identidade) e área de trabalho clara (documento).
- Ouro de Sinete usado como um sinete: raro, pequeno, significativo.
- Cor semântica para estados financeiros e de governança.
- Plano e firme: bordas definem estrutura; sombra só em overlays.
- Tipografia contida: corpo pequeno e nítido, hierarquia por peso.

## 2. Colors

Paleta de registro: ardósia escura, ouro parcimonioso, papel frio e tintas semânticas.

### Primary
- **Ardósia Solene** (#0f172a): a capa do livro. Fundo da sidebar, botões primários e do gradiente do login (que aprofunda até **Ardósia Profunda**, #020617). É a cor da autoridade institucional do sistema.

### Secondary
- **Ouro de Sinete** (#fbbf24): ícones de identidade da loja, o cargo do usuário logado e anéis/bordas cerimoniais (`amber-400/40`) sobre ardósia. **Ouro Firme** (#f59e0b) é sua forma acionável: o CTA de login, com texto em Ardósia Profunda.

### Tertiary (semânticas)
- **Verde Quitado** (#15803d): mensalidades pagas, aprovações concluídas.
- **Vermelho Pendente** (#b91c1c): inadimplência, erros e ações destrutivas.

### Neutral
- **Papel de Registro** (#f1f5f9): fundo da área de trabalho.
- **Superfície** (#ffffff): cards e folhas de conteúdo.
- **Tinta** (#171717): texto principal.
- **Tinta Suave** (#64748b): texto secundário e descrições.
- **Tinta Apagada** (#94a3b8): metadados e texto sobre ardósia.
- **Linha** (#e2e8f0): bordas e divisores.

### Named Rules
**A Regra do Sinete.** Ouro de Sinete ocupa menos de 5% de qualquer tela. Ele marca identidade e cerimônia (logo da loja, cargo, CTA de entrada) — nunca preenche fundos de seção, gráficos ou decoração. Se o ouro aparece duas vezes no mesmo card, uma está errada.

**A Regra da Tinta Semântica.** Verde e vermelho existem apenas para estado (pago/pendente, aprovado/recusado, sucesso/erro). Cor de estado nunca vira cor de decoração.

## 3. Typography

**Display/Body Font:** Geist (com fallback system-ui, sans-serif)
**Mono Font:** Geist Mono (números de documentos, CIM, valores quando tabulados)

**Character:** Uma única família sans grotesca em múltiplos pesos: neutra, precisa, sem afetação — a voz de um secretário competente. Hierarquia por peso e cor, não por tamanhos grandes.

### Hierarchy
- **Headline** (600, 1.5rem/24px, lh 1.25): título da página, um por tela.
- **Title** (600, 1rem/16px, lh 1.3): títulos de cards e seções de formulário.
- **Body** (400, 0.875rem/14px, lh 1.5): texto padrão de trabalho, tabelas e formulários.
- **Label** (600, 0.6875rem/11px, tracking 0.05em, UPPERCASE): exclusivamente os cabeçalhos de seção da sidebar (Secretaria, Tesouraria, Minha conta).

### Named Rules
**A Regra do Secretário.** Nenhum texto de trabalho abaixo de 0.75rem (12px) — o público inclui membros idosos. Metadados em 12px, corpo em 14px, nunca menos.

## 4. Elevation

Plano e firme. Superfícies em repouso são planas: cards brancos com borda de Linha (#e2e8f0) e no máximo `shadow-sm` residual. A profundidade é transmitida por contraste de zona (chrome escuro vs. papel claro) e por bordas, não por sombras. Sombras reais pertencem apenas a elementos que flutuam de fato.

### Shadow Vocabulary
- **Repouso** (`box-shadow: 0 1px 2px rgb(0 0 0 / 0.05)`): o máximo permitido em cards e inputs.
- **Overlay** (`box-shadow: 0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)`): dialogs, dropdowns e popovers — elementos que cobrem conteúdo.

### Named Rules
**A Regra do Papel na Mesa.** Se o elemento não cobre outro conteúdo, ele não tem sombra perceptível. Sombra é resposta à sobreposição, nunca ornamento.

## 5. Components

### Buttons
- **Shape:** cantos suavemente arredondados (6px), altura 36px (sm 32px, lg 40px).
- **Primary:** Ardósia Solene com texto branco; hover escurece levemente (90% de opacidade).
- **CTA de autenticação:** Ouro Firme (#f59e0b) com texto Ardósia Profunda, peso 600 — reservado ao login.
- **Outline:** fundo branco, borda de Linha; hover com fundo neutro suave. Sobre ardósia, vira `border-white/20` com texto claro.
- **Destructive:** Vermelho Pendente, apenas para exclusões e cancelamentos.
- **Hover/Focus:** foco visível com anel de 3px translúcido; transições apenas de cor e sombra.

### Cards / Containers
- **Corner Style:** 12px (rounded-xl).
- **Background:** Superfície branca sobre Papel de Registro.
- **Shadow Strategy:** Repouso ou nenhuma (ver Elevation).
- **Border:** 1px Linha, sempre nos quatro lados — nunca faixa lateral colorida.
- **Internal Padding:** 24px.

### Inputs / Fields
- **Style:** borda de Linha, fundo transparente, 6px de raio, altura 36px.
- **Focus:** borda + anel de 3px translúcido na cor de foco.
- **Error:** borda e anel em Vermelho Pendente via `aria-invalid`.

### Badges (status)
- **Style:** pílula (raio total), 11–12px peso 500, fundo tonal claro da cor semântica com texto na versão escura (ex.: fundo verde-claro, texto Verde Quitado).
- **State:** cada estado de governança/financeiro tem uma cor fixa; nunca reatribuir.

### Navigation (Sidebar)
- **Style:** coluna fixa de 256px em Ardósia Solene; cabeçalho com logo da loja em anel de Ouro de Sinete; rodapé com usuário e cargo em ouro.
- **Typography:** itens em 14px/500 com ícone de 16px; seções em Label uppercase Tinta Apagada.
- **States:** repouso em slate-200; hover `bg-white/10`; ativo com fundo claro e texto branco pleno.
- **Mobile:** consultas rápidas e check-in QR devem funcionar em telas estreitas; a sidebar colapsa (a implementar).

### Tabelas de registro (componente-assinatura)
Listas de membros, mensalidades e despesas são o coração do sistema: linhas de 14px com divisores de Linha, cabeçalhos em Tinta Suave, valores monetários alinhados à direita (tabular/mono), badge de status por linha e ações discretas à direita.

## 6. Do's and Don'ts

### Do:
- **Do** definir os tokens shadcn (`--primary`, `--muted`, `--radius`, etc.) no `globals.css` — hoje os componentes UI referenciam variáveis inexistentes; este documento é a fonte dos valores.
- **Do** usar Ouro de Sinete apenas em identidade e cerimônia (≤5% da tela) — A Regra do Sinete.
- **Do** mostrar estados de governança (aguardando assinatura do VM/Secretário/Tesoureiro) como badges semânticos visíveis — "governança visível" é princípio do produto.
- **Do** manter corpo de texto ≥14px e metadados ≥12px com contraste ≥4.5:1 (WCAG AA, público inclui idosos).
- **Do** bordas completas de 1px em Linha para estruturar cards e tabelas.

### Don't:
- **Don't** parecer "SaaS genérico colorido": nada de gradientes decorativos, cards coloridos por métrica, ilustrações ou mascotes. O único gradiente permitido é o fundo de ardósia do login.
- **Don't** parecer "sistema governamental antigo": nada de telas densas e cinzas sem hierarquia — cada tela serve um fluxo de trabalho.
- **Don't** ser "esotérico/místico caricato": nenhum símbolo maçônico decorativo, texturas escuras ou ar teatral de sociedade secreta. O ícone Landmark no anel de ouro é o limite.
- **Don't** usar `border-left` colorida como acento em cards, alertas ou listas.
- **Don't** usar gradiente em texto (`background-clip: text`) nem glassmorphism.
- **Don't** usar verde/vermelho fora de estado financeiro/governança, nem ouro em botões comuns.
