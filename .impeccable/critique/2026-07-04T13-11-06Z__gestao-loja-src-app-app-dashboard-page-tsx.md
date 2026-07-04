---
target: dashboard
total_score: 22
p0_count: 1
p1_count: 2
timestamp: 2026-07-04T13-11-06Z
slug: gestao-loja-src-app-app-dashboard-page-tsx
---
Method: dual-agent (A: general-purpose · B: general-purpose)

#### Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 3 | Pendências bem expostas por papel, mas sem timestamp e sem loading states (RSC sem Suspense = tela branca durante ~7 queries) |
| 2 | Match System / Real World | 2 | Bom vocabulário maçônico (Atas, Pranchas, CIM, Or∴), mas enums crus do banco vazam para a tela (AGUARDANDO_ASSINATURAS, APRENDIZ) |
| 3 | User Control and Freedom | 2 | Navegação só de leitura; nenhuma ação direta — VM é levado a uma lista genérica em vez de assinar dali |
| 4 | Consistency and Standards | 3 | Componentes shadcn consistentes; pequenas inconsistências de cor/texto (`text-neutral-500` fora da paleta) |
| 5 | Error Prevention | 2 | Dashboard read-only tem pouco a errar, mas nada reassegura antes de fluxos de risco (aprovar despesa) |
| 6 | Recognition Rather Than Recall | 3 | Listas mostram contexto útil, mas contagens agregadas exigem clique para saber "quais/quanto" |
| 7 | Flexibility and Efficiency | 1 | Zero atalhos, zero ações rápidas, sem deep-link por item, sem busca |
| 8 | Aesthetic and Minimalist Design | 3 | Sóbrio e plano, alinhado ao DESIGN.md; perde ponto pela monotonia (tudo com o mesmo peso visual) |
| 9 | Error Recovery | 1 | Nenhum error boundary; falha de query Prisma quebra a página inteira |
| 10 | Help and Documentation | 2 | Hints úteis de domínio (interstício, dupla assinatura), mas sem onboarding/tooltip para termos como "Irregular" |
| **Total** | | **22/40** | **Acceptable — fundação sólida, execução incompleta** |

#### Anti-Patterns Verdict

**LLM assessment**: Slop moderado, não o slop colorido clássico (sem gradient text, sem side-stripes, sem eyebrows) — é o "slop shadcn cru": grid de 4 stats idêntico abrindo os cinco dashboards, componente `Stat` sem hierarquia semântica (número negativo e número zerado têm a mesma cara), 9 links "Ver X →" repetidos, e o pior tell: **enums do banco vazando direto para a tela** (AGUARDANDO_ASSINATURAS, APRENDIZ, ATIVO/IRREGULAR) — o oposto da sobriedade institucional que o produto pede. A sidebar (ardósia, âmbar contido, medalhão, "Or∴") tem identidade real; o miolo do dashboard ainda não "abriu o Livro de Atas".

**Deterministic scan**: `detect.mjs` rodou limpo sobre dashboard, layout do app e componentes UI — **0 achados, exit code 0**. Nenhuma violação das regras automatizadas (side-stripes, gradient text, bordas/sombras combinadas, etc.). O detector não capta os problemas reais aqui (enums crus, ausência de cor semântica, falta de estados de loading/erro) porque são de camada de dados/lógica, não de padrão visual sintático — a leitura humana do Assessment A é que carrega o peso neste caso.

**Visual overlays**: não disponíveis nesta sessão (sem dev server rodando, sem tab de browser). Avaliação feita por leitura de código.

#### Overall Impression

A arquitetura é genuinamente melhor que a média: cinco dashboards por papel, cada um com queries e recortes próprios, e o card do Conselho de Contas expõe a dupla assinatura como registro auditável — o melhor momento do produto. Mas a superfície visual ainda é scaffolding shadcn: nenhuma cor de estado, enums de banco crus na tela, e a maior oportunidade perdida é que a tela mais importante do sistema (onde o Venerável Mestre vê o que precisa assinar) não deixa ele assinar — só aponta para outro lugar.

#### What's Working

1. **Dashboards por papel com filtros reais de governança** — o do VM filtra por `signedByMasterId: null`: mostra exatamente o que falta a ele assinar, não uma lista genérica.
2. **O hint de interstício** ("Apto a Companheiro a partir de 12/09/2026") é conhecimento de domínio certo, no lugar certo — o tipo de detalhe que constrói confiança no Secretário.
3. **O card do Conselho de Contas** mostrando "VM: fulano · Tesoureiro: beltrano" por despesa aprovada materializa a trava de dupla assinatura como transparência legível.

#### Priority Issues

- **[P0] Shell quebra no mobile**: sidebar fixa de 256px e `main` com `ml-64` sem nenhum breakpoint — no celular a navegação cobre/empurra o conteúdo. O PRODUCT.md exige mobile impecável para check-in QR.
  **Why it matters**: obreiros consultando mensalidades ou fazendo check-in no celular ficam com a tela inutilizável.
  **Fix**: sidebar off-canvas com toggle abaixo de `lg:`; `main` com `lg:ml-64` e padding responsivo.
  **Suggested command**: `$impeccable adapt dashboard`

- **[P1] Enums do banco na interface**: AGUARDANDO_ASSINATURAS, APRENDIZ, ATIVO/IRREGULAR, PENDENTE_APROVACAO aparecem crus, com underscore e caixa alta, em várias telas.
  **Why it matters**: fere diretamente a sobriedade institucional (Regra do Secretário) e dificulta leitura para membros idosos; parece o schema do banco vazando, não um sistema polido.
  **Fix**: centralizar um mapa de labels (já há precedente duplicado com `roleLabels`) e aplicar em todos os enums exibidos.
  **Suggested command**: `$impeccable clarify dashboard`

- **[P1] Ausência total de cor semântica de estado**: saldo negativo, mensalidades vencidas e atas pendentes são visualmente neutros — nenhum Verde Quitado/Vermelho Pendente do DESIGN.md aparece.
  **Why it matters**: contraria o princípio "sobriedade que gera confiança" (cor só para significado) definido no próprio design system; o usuário não distingue visualmente risco de normalidade.
  **Fix**: variantes semânticas em `Stat`/`Badge` (tone="danger" quando vencidas > 0 ou saldo < 0), sempre acompanhadas de texto, nunca só cor.
  **Suggested command**: `$impeccable colorize dashboard`

- **[P2] Deep-links perdidos e stat truncado por bug**: listas do VM linkam para páginas genéricas em vez do item específico; o stat "Atas pendentes" nunca passa de 5 porque conta o resultado já limitado por `take: 5`.
  **Why it matters**: usuários avançados (Secretário, VM) perdem tempo renavegando e podem subestimar pendências reais.
  **Fix**: `href` por item (`/secretaria/atas/${a.id}`) e contagem separada da query de exibição.
  **Suggested command**: `$impeccable polish dashboard`

- **[P2] Sem estados de loading/erro**: ~5-7 queries Prisma em paralelo sem `loading.tsx`/`error.tsx`; falha de uma query derruba a página inteira em erro 500.
  **Why it matters**: em um sistema financeiro/documental, uma tela crua de erro do Next mina a confiança institucional que é o objetivo central do produto.
  **Fix**: `loading.tsx` com skeleton dos 4 stats; `error.tsx` sóbrio ("Não foi possível carregar o painel — seus dados estão seguros").
  **Suggested command**: `$impeccable harden dashboard`

#### Persona Red Flags

**Alex (Power User — Secretário veterano)**: Zero atalhos de teclado e nenhuma ação executável no dashboard — tudo exige navegar para outra tela. Bug real: o stat "Atas pendentes" está limitado ao mesmo `take: 5` da lista exibida, então nunca mostra a contagem verdadeira acima de 5. Sem ações em lote (ex.: notificar todos os inadimplentes de uma vez).

**Sam (Acessibilidade)**: Link ativo na sidebar indicado só por cor (âmbar vs. slate-300), sem `aria-current="page"` — leitor de tela não sabe a localização atual. Headers de seção da sidebar em 11px, abaixo do piso de 12px da própria Regra do Secretário, com contraste em torno do limite AA para texto pequeno. A página não tem nenhum h2/h3 (CardTitle é `<div>`), quebrando navegação por heading. `alt=""` no logo da loja quando deveria ser `alt={lodge.name}`.

#### Minor Observations

- `text-neutral-500` usado fora dos tokens do tema (deveria ser `text-muted-foreground`).
- Pluralização manual ("presença(s)", "vencida(s)") em vez de pluralização real — soa a formulário burocrático, uma das anti-referências do produto.
- H1 "Dashboard" quando o produto se quer "Livro de Atas" — "Painel da Loja" seria mais fiel à voz.
- Datas absolutas sem indicação relativa ("vence em 5 dias" reduziria carga mental frente a "vence em 12/06").

#### Questions to Consider

- Se o Venerável Mestre só entra no sistema para assinar, por que o dashboard dele não permite assinar ali mesmo?
- O que um obreiro idoso faz depois de ver "R$ 480,00 em aberto, 2 vencidas" sem nenhum caminho de ação? Isso constrói confiança ou constrangimento?
- Se removêssemos o `<h1>Dashboard</h1>` e a sidebar, alguém reconheceria que isto é o sistema de uma Loja Maçônica e não um CRM genérico?
