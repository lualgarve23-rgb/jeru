// Ferramentas do Assistente IA — Fase 1: somente leitura, dados PESSOAIS do
// usuário logado. lodgeId/userId vêm SEMPRE da sessão, nunca do input da IA.
// `disponivel(user)` filtra por cargo ANTES de expor a ferramenta ao modelo.

import type Anthropic from "@anthropic-ai/sdk";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { pendenteComAfastamento } from "@/lib/afastamento";
import { textoDePdf } from "@/lib/extrai-texto";
import {
  frequenciaAnual,
  MIN_SESSOES_PARA_ALERTA,
} from "@/lib/frequencia";
import {
  canReadSecretariaAdmin,
  canReadTesouraria,
  canWriteSecretaria,
} from "@/lib/permissions";
import { grausVisiveis, GRAUS_ACERVO } from "@/lib/graus";
import { downloadFromLodgeDrive } from "@/lib/google-drive";
import { notificationWhere } from "@/lib/notifications";
import { buscarFaq, FAQ_CHAVES } from "@/lib/assistente/faq";
import { pendenciasDoUsuario, haQuantoTempo } from "@/lib/pendencias";
import { balanceteDoQuadro } from "@/lib/balancete-quadro";
import {
  aplicarFechamentosAoGrafico,
  carimboFechamento,
  listarFechamentos,
  mesesFechados,
  referenciaMes,
  totaisDivergem,
} from "@/lib/fechamento-mes";
import { partesSaoPaulo } from "@/lib/datas-sp";

export type AssistenteUser = {
  id: string;
  lodgeId: string;
  role: string;
  degree?: string; // grau do irmão — segmenta biblioteca e documentos
  cargoRito?: string | null; // Orador/Vigilantes assinam pelo cargo do rito
  name: string;
};

// Editores da Secretaria enxergam o acervo inteiro; os demais, só o
// permitido ao próprio grau (mesma regra das telas).
function grausDoUsuario(user: AssistenteUser): string[] {
  return canWriteSecretaria(user.role)
    ? [...GRAUS_ACERVO]
    : grausVisiveis(user.degree);
}

export type Ferramenta = {
  nome: string;
  descricao: string;
  inputSchema: Anthropic.Tool.InputSchema;
  disponivel: (user: AssistenteUser) => boolean;
  executar: (user: AssistenteUser, input: Record<string, unknown>) => Promise<unknown>;
};

const semInput: Anthropic.Tool.InputSchema = {
  type: "object",
  properties: {},
  additionalProperties: false,
};

function paraTodos(user: AssistenteUser) {
  return user.role !== "SUPER_ADMIN";
}

// Ferramentas da LOJA — mesmas listas de leitura das telas (permissions.ts):
// Tesouraria: VM, Tesoureiro, Conselho de Contas. Secretaria: VM, Secretário,
// Conselho de Contas. Esmoler acompanha bem-estar (inadimplência e frequência).
function leTesouraria(user: AssistenteUser) {
  return canReadTesouraria(user.role);
}

function leSecretaria(user: AssistenteUser) {
  return canReadSecretariaAdmin(user.role);
}

function acompanhaBemEstar(user: AssistenteUser) {
  return user.role === "ESMOLER";
}

// Opções do ts_headline nas buscas full-text (trechos com «destaque»)
const FTS_HEADLINE =
  'MaxFragments=3, MaxWords=25, MinWords=8, FragmentDelimiter=" … ", StartSel=«, StopSel=»';

function centavos(v: number) {
  return (v / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function dataBr(d: Date) {
  return d.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
}

// Conteúdo de documentos (atas, pranchas, biblioteca, Drive) volta ao modelo
// entre delimitadores explícitos: o system prompt manda tratar o que está
// dentro como DADO citável, nunca como instrução (anti prompt injection).
export const DOC_INICIO = "<<<DOCUMENTO>>>";
export const DOC_FIM = "<<<FIM>>>";
export function documento(texto: string | null | undefined): string {
  return `${DOC_INICIO}\n${(texto ?? "").replace(/<<<(DOCUMENTO|FIM)>>>/g, "<<>>")}\n${DOC_FIM}`;
}

// Irmãos da loja com solicitação em andamento (atestado, Quitte, afastamento)
// — universo permitido à situacao_financeira_irmao
export async function irmaosComProcessoEmAndamento(lodgeId: string): Promise<Set<string>> {
  const [atestados, quittes, afastamentos] = await Promise.all([
    prisma.atestadoRegularidade.findMany({
      where: { lodgeId, status: "SOLICITADO" },
      select: { userId: true },
    }),
    prisma.quittePlacet.findMany({
      where: { lodgeId, status: { in: ["PENDENTE", "EM_ANALISE"] } },
      select: { userId: true },
    }),
    prisma.pedidoAfastamento.findMany({
      where: {
        lodgeId,
        OR: [
          { status: { in: ["AGUARDANDO_OBREIRO", "SOLICITADO", "EM_ASSINATURA"] } },
          { status: "ASSINADO", enviadoAt: null },
        ],
      },
      select: { userId: true },
    }),
  ]);
  return new Set([...atestados, ...quittes, ...afastamentos].map((x) => x.userId));
}

// Trechos do texto ao redor de cada ocorrência do termo (para citar a ata
// sem despejar o documento inteiro no contexto do modelo)
function trechos(texto: string, termo: string, max = 2, raio = 220) {
  const baixo = texto.toLowerCase();
  const alvo = termo.toLowerCase();
  const saida: string[] = [];
  let i = 0;
  while (saida.length < max) {
    const pos = baixo.indexOf(alvo, i);
    if (pos < 0) break;
    const ini = Math.max(0, pos - raio);
    const fim = Math.min(texto.length, pos + alvo.length + raio);
    saida.push(
      `${ini > 0 ? "…" : ""}${texto.slice(ini, fim).replace(/\s+/g, " ").trim()}${fim < texto.length ? "…" : ""}`
    );
    i = fim;
  }
  return saida;
}


export const FERRAMENTAS: Ferramenta[] = [
  {
    nome: "minha_fila",
    descricao:
      "O que está parado esperando o usuário AGORA ('minha vez'): assinaturas gov.br na vez do cargo dele (atestados, Quitte Placet, processos, Form. 116, atas — inclui Orador e Vigilantes pelo cargo do rito), aprovações de despesa, registros da Secretaria, capitações vencidas, convites de sessão sem resposta e alertas dirigidos. Cada item traz a ação e o link direto no app.",
    inputSchema: semInput,
    disponivel: paraTodos,
    executar: async (user) => {
      const itens = await pendenciasDoUsuario({
        id: user.id,
        lodgeId: user.lodgeId,
        role: user.role,
        cargoRito: user.cargoRito,
        degree: user.degree,
      });
      if (!itens.length) return { total: 0, info: "Nada pendente com você." };
      return {
        total: itens.length,
        itens: itens.slice(0, 20).map((p) => ({
          tipo: p.tipo,
          titulo: p.titulo,
          contexto: p.contexto,
          acao: p.acao,
          desde: haQuantoTempo(p.desde),
          link: p.link,
        })),
      };
    },
  },
  {
    nome: "situacao_financeira_irmao",
    descricao:
      "Secretário: situação financeira de UM irmão que tem solicitação em andamento (atestado de regularidade, Quitte Placet ou afastamento) — capitações em aberto com valor e vencimento e as últimas 3 pagas. Só aceita irmãos com processo em andamento; não expõe o quadro inteiro. Use o userId devolvido por processos_loja.",
    inputSchema: {
      type: "object",
      properties: {
        userId: {
          type: "string",
          description: "id do irmão (de processos_loja)",
        },
      },
      required: ["userId"],
      additionalProperties: false,
    },
    disponivel: (u) => u.role === "SECRETARIO",
    executar: async (user, input) => {
      const alvo = String(input.userId ?? "");
      // O id vindo da IA só vale se o irmão for da loja do usuário E tiver
      // solicitação em andamento (é o que a Secretaria precisa checar)
      const comProcesso = await irmaosComProcessoEmAndamento(user.lodgeId);
      if (!alvo || !comProcesso.has(alvo)) {
        return {
          erro: "Irmão sem solicitação em andamento nesta loja — a situação financeira só é consultada para atestado, Quitte Placet ou afastamento abertos.",
        };
      }
      const irmao = await prisma.user.findFirst({
        where: { id: alvo, lodgeId: user.lodgeId },
        select: { name: true, cim: true, status: true },
      });
      if (!irmao) return { erro: "Irmão não encontrado nesta loja." };
      const [abertas, pagas] = await Promise.all([
        prisma.invoice.findMany({
          where: { lodgeId: user.lodgeId, userId: alvo, status: { in: ["PENDENTE", "VENCIDA"] } },
          orderBy: { dueDate: "asc" },
          select: { description: true, status: true, amountCents: true, dueDate: true },
        }),
        prisma.invoice.findMany({
          where: { lodgeId: user.lodgeId, userId: alvo, status: "PAGA" },
          orderBy: { paidAt: "desc" },
          take: 3,
          select: { description: true, amountCents: true, paidAt: true },
        }),
      ]);
      return {
        irmao: { nome: irmao.name, cim: irmao.cim, situacao: irmao.status },
        emAberto: abertas.map((i) => ({
          descricao: i.description,
          status: i.status,
          valor: centavos(i.amountCents),
          vencimento: dataBr(i.dueDate),
        })),
        totalEmAberto: centavos(abertas.reduce((s, i) => s + i.amountCents, 0)),
        ultimasPagas: pagas.map((i) => ({
          descricao: i.description,
          valor: centavos(i.amountCents),
          pagaEm: i.paidAt ? dataBr(i.paidAt) : null,
        })),
      };
    },
  },
  {
    nome: "minhas_capitacoes",
    descricao:
      "Situação financeira pessoal do usuário: capitações (mensalidades) dos últimos 12 meses com status, valor e vencimento.",
    inputSchema: semInput,
    disponivel: paraTodos,
    executar: async (user) => {
      const invoices = await prisma.invoice.findMany({
        where: { lodgeId: user.lodgeId, userId: user.id },
        orderBy: [{ referenceYear: "desc" }, { referenceMonth: "desc" }],
        take: 12,
        select: {
          description: true,
          status: true,
          amountCents: true,
          dueDate: true,
          paidAt: true,
        },
      });
      const pendentes = invoices.filter((i) => i.status === "PENDENTE");
      return {
        emDia: pendentes.length === 0,
        pendentes: pendentes.length,
        cobrancas: invoices.map((i) => ({
          descricao: i.description,
          status: i.status,
          valor: centavos(i.amountCents),
          vencimento: dataBr(i.dueDate),
          pagaEm: i.paidAt ? dataBr(i.paidAt) : null,
        })),
      };
    },
  },
  {
    nome: "minha_frequencia",
    descricao:
      "Frequência pessoal do usuário nas sessões do ano corrente: presenças, sessões computadas e percentual.",
    inputSchema: semInput,
    disponivel: paraTodos,
    executar: async (user) => {
      const todos = await frequenciaAnual(user.lodgeId);
      const minha = todos.find((f) => f.userId === user.id);
      if (!minha) return { info: "Sem sessões computadas para você neste ano." };
      return {
        ano: new Date().getFullYear(),
        sessoesComputadas: minha.sessoesComputadas,
        presencas: minha.presencas,
        percentual: minha.percentual,
      };
    },
  },
  {
    nome: "minha_mutua",
    descricao:
      "Situação da Declaração de Beneficiários da Mútua/CABM (Form. 108) do usuário: entregue ou pendente.",
    inputSchema: semInput,
    disponivel: paraTodos,
    executar: async (user) => {
      const entrega = await prisma.mutuaEntrega.findFirst({
        where: { lodgeId: user.lodgeId, userId: user.id },
        select: { enviadaAt: true, entregueAntes: true, nome: true },
      });
      if (!entrega)
        return {
          entregue: false,
          info: "Form. 108 ainda não entregue — página /dashboard/mutua.",
        };
      return {
        entregue: true,
        anteriorAoSistema: entrega.entregueAntes,
        enviadaEm: dataBr(entrega.enviadaAt),
        arquivo: entrega.nome,
      };
    },
  },
  {
    nome: "proximas_sessoes",
    descricao: "Próximas sessões e eventos agendados da loja (data, tipo e grau).",
    inputSchema: semInput,
    disponivel: paraTodos,
    executar: async (user) => {
      const sessoes = await prisma.lodgeSession.findMany({
        where: { lodgeId: user.lodgeId, date: { gte: new Date() } },
        orderBy: { date: "asc" },
        take: 5,
        select: { date: true, type: true, degree: true, pauta: true },
      });
      return sessoes.map((s) => ({
        data: s.date.toLocaleString("pt-BR", {
          timeZone: "America/Sao_Paulo",
          dateStyle: "full",
          timeStyle: "short",
        }),
        tipo: s.type,
        grau: s.degree === "NA" ? null : s.degree,
        pauta: s.pauta,
      }));
    },
  },
  {
    nome: "meus_processos",
    descricao:
      "Solicitações pessoais do usuário à Secretaria: pedidos de Atestado de Regularidade, de Quitte Placet e de Afastamento (Form. 116), com status, etapa pendente e assinaturas já feitas.",
    inputSchema: semInput,
    disponivel: paraTodos,
    executar: async (user) => {
      const [atestados, quittes, afastamentos] = await Promise.all([
        prisma.atestadoRegularidade.findMany({
          where: { lodgeId: user.lodgeId, userId: user.id },
          orderBy: { solicitadoAt: "desc" },
          take: 5,
          select: {
            status: true,
            solicitadoAt: true,
            signedByTesAt: true,
            signedBySecAt: true,
            signedByMasterAt: true,
          },
        }),
        prisma.quittePlacet.findMany({
          where: { lodgeId: user.lodgeId, userId: user.id },
          orderBy: { dataSolicitacao: "desc" },
          take: 5,
          select: {
            status: true,
            dataSolicitacao: true,
            quitacaoFinanceira: true,
            signedBySecAt: true,
            signedByOradorAt: true,
            signedByMasterAt: true,
          },
        }),
        prisma.pedidoAfastamento.findMany({
          where: { lodgeId: user.lodgeId, userId: user.id },
          orderBy: { createdAt: "desc" },
          take: 5,
          select: {
            status: true,
            dias: true,
            createdAt: true,
            requerimentoSignedAt: true,
            dataSessao: true,
            artigo: true,
            signedBySecAt: true,
            signedByMasterAt: true,
            enviadoAt: true,
            parecer: true,
          },
        }),
      ]);
      return {
        atestados: atestados.map((a) => ({
          status: a.status,
          solicitadoEm: dataBr(a.solicitadoAt),
          assinaturas: {
            tesoureiro: !!a.signedByTesAt,
            secretario: !!a.signedBySecAt,
            veneravel: !!a.signedByMasterAt,
          },
        })),
        quittePlacets: quittes.map((q) => ({
          status: q.status,
          solicitadoEm: dataBr(q.dataSolicitacao),
          quitacaoFinanceira: q.quitacaoFinanceira,
          assinaturas: {
            secretario: !!q.signedBySecAt,
            orador: !!q.signedByOradorAt,
            veneravel: !!q.signedByMasterAt,
          },
        })),
        afastamentos: afastamentos.map((a) => ({
          status: a.status,
          etapa: pendenteComAfastamento(a),
          dias: a.dias,
          solicitadoEm: dataBr(a.createdAt),
          requerimentoAssinadoGovbr: !!a.requerimentoSignedAt,
          sessaoQueDeliberou: a.dataSessao ? dataBr(a.dataSessao) : null,
          artigo: a.artigo,
          assinaturasForm116: {
            secretario: !!a.signedBySecAt,
            veneravel: !!a.signedByMasterAt,
          },
          enviadoGuardaSelosEm: a.enviadoAt ? dataBr(a.enviadoAt) : null,
          parecer: a.parecer,
        })),
      };
    },
  },
  {
    nome: "minhas_notificacoes",
    descricao: "Notificações do usuário no sistema, não lidas primeiro.",
    inputSchema: semInput,
    disponivel: paraTodos,
    executar: async (user) => {
      const notas = await prisma.notification.findMany({
        where: notificationWhere(user),
        orderBy: [{ isRead: "asc" }, { createdAt: "desc" }],
        take: 10,
        select: { title: true, description: true, isRead: true, createdAt: true, link: true },
      });
      return notas.map((n) => ({
        titulo: n.title,
        descricao: n.description,
        lida: n.isRead,
        em: dataBr(n.createdAt),
        link: n.link,
      }));
    },
  },
  {
    nome: "info_benemerencia",
    descricao:
      "Como doar à Bolsa de Benemerência da loja (Pix) e se há chave cadastrada.",
    inputSchema: semInput,
    disponivel: paraTodos,
    executar: async (user) => {
      const lodge = await prisma.lodge.findUniqueOrThrow({
        where: { id: user.lodgeId },
        select: { pixKeyBenemerencia: true, pixKey: true },
      });
      const temChave = !!(lodge.pixKeyBenemerencia || lodge.pixKey);
      return {
        doacaoDisponivel: temChave,
        info: temChave
          ? "Doações em /dashboard/benemerencia — QR Code Pix e Copia e Cola, valor livre no app do banco."
          : "A loja ainda não cadastrou chave Pix; o Venerável pode cadastrar nas Configurações da Loja.",
      };
    },
  },
  {
    nome: "ajuda_app",
    descricao: `Explica como usar uma funcionalidade do sistema NoPrumo — inclui guias PASSO A PASSO dos fluxos ("como faço para assinar/enviar/entregar…"), dizendo quem faz o quê e em qual tela. Use sempre que a pergunta for sobre COMO fazer algo no sistema. Temas: ${FAQ_CHAVES.join(", ")} — e também os nomes das telas (atas, pranchas, admissoes, progressoes, despesas, balancete…).`,
    inputSchema: {
      type: "object",
      properties: {
        tema: {
          type: "string",
          description: "Tema ou palavra-chave da dúvida (ex.: carteirinha, govbr, mutua)",
        },
      },
      required: ["tema"],
      additionalProperties: false,
    },
    disponivel: paraTodos,
    executar: async (_user, input) => {
      const faq = buscarFaq(String(input.tema ?? ""));
      return faq ?? { info: `Tema não encontrado. Temas: ${FAQ_CHAVES.join(", ")}.` };
    },
  },
  // ---------------- Ferramentas da LOJA (por nível de acesso) ----------------
  {
    nome: "financas_loja",
    descricao:
      "Visão financeira da loja: receitas, despesas e saldo do livro-caixa no mês corrente e no ano, e capitações em aberto (pendentes e vencidas). Disponível para Venerável, Tesoureiro e Conselho de Contas.",
    inputSchema: semInput,
    disponivel: leTesouraria,
    executar: async (user) => {
      const agora = new Date();
      const inicioMes = new Date(agora.getFullYear(), agora.getMonth(), 1);
      const inicioAno = new Date(agora.getFullYear(), 0, 1);
      const soma = async (type: "RECEITA" | "DESPESA", desde: Date) => {
        const r = await prisma.transaction.aggregate({
          where: { lodgeId: user.lodgeId, type, date: { gte: desde } },
          _sum: { amountCents: true },
        });
        return r._sum.amountCents ?? 0;
      };
      const [recMes, despMes, recAno, despAno, abertas] = await Promise.all([
        soma("RECEITA", inicioMes),
        soma("DESPESA", inicioMes),
        soma("RECEITA", inicioAno),
        soma("DESPESA", inicioAno),
        prisma.invoice.groupBy({
          by: ["status"],
          where: {
            lodgeId: user.lodgeId,
            status: { in: ["PENDENTE", "VENCIDA"] },
          },
          _count: { _all: true },
          _sum: { amountCents: true },
        }),
      ]);
      return {
        mesCorrente: {
          receitas: centavos(recMes),
          despesas: centavos(despMes),
          saldo: centavos(recMes - despMes),
        },
        anoCorrente: {
          receitas: centavos(recAno),
          despesas: centavos(despAno),
          saldo: centavos(recAno - despAno),
        },
        capitacoesEmAberto: abertas.map((a) => ({
          status: a.status,
          quantidade: a._count._all,
          total: centavos(a._sum.amountCents ?? 0),
        })),
      };
    },
  },
  {
    nome: "balancete_loja",
    descricao:
      "Balancete mensal da Loja aberto a todo o quadro (só leitura): receitas, despesas e saldo do mês, totais por categoria, capitações recebidas (quantidade e total, sem nomes) e a série dos últimos 12 meses. Para o quadro em geral só existem os meses FECHADOS pela Tesouraria (sem mês/ano informado usa o último mês fechado); mês ainda aberto responde que não foi fechado. Venerável, Tesoureiro e Conselho de Contas consultam qualquer mês (padrão: mês corrente) e recebem também o status do fechamento/ciência do Conselho e os lançamentos do mês (nunca as baixas de capitação nem a beneficência linha a linha).",
    inputSchema: {
      type: "object",
      properties: {
        mes: { type: "number", description: "Mês (1-12); padrão: mês corrente" },
        ano: { type: "number", description: "Ano; padrão: ano corrente" },
      },
      additionalProperties: false,
    },
    disponivel: paraTodos,
    executar: async (user, input) => {
      const hoje = partesSaoPaulo(new Date());
      const m = Number(input.mes);
      const a = Number(input.ano);
      const fechados = mesesFechados(await listarFechamentos(user.lodgeId));
      const leTes = leTesouraria(user);
      let mes = m >= 1 && m <= 12 ? m : hoje.mes;
      let ano = a >= 2000 && a <= hoje.ano + 1 ? a : hoje.ano;
      if (!leTes) {
        // Quadro: só meses fechados (e não reabertos)
        if (fechados.length === 0) {
          return {
            fechado: false,
            mensagem: "A Tesouraria ainda não fechou nenhum mês; o Balancete da Loja fica disponível ao quadro depois do fechamento mensal e da ciência do Conselho de Contas.",
          };
        }
        if (!(m >= 1 && m <= 12) && !(a >= 2000)) {
          mes = fechados[0].mes;
          ano = fechados[0].ano;
        }
        if (!fechados.some((f) => f.mes === mes && f.ano === ano)) {
          return {
            referencia: referenciaMes(ano, mes),
            fechado: false,
            mensagem: `O balancete de ${referenciaMes(ano, mes)} ainda não foi fechado pela Tesouraria. Meses disponíveis: ${fechados.map((f) => referenciaMes(f.ano, f.mes)).join(", ")}.`,
          };
        }
      }
      const fechamento = fechados.find((f) => f.mes === mes && f.ano === ano) ?? null;
      const registro = leTes
        ? await import("@/lib/fechamento-mes").then((mod) => mod.buscarFechamento(user.lodgeId, ano, mes))
        : fechamento;
      const b = await balanceteDoQuadro(user.lodgeId, mes, ano);
      const carimbo = carimboFechamento(registro);
      const ultimos12 = leTes ? b.ultimos12 : aplicarFechamentosAoGrafico(b.ultimos12, fechados);
      return {
        referencia: referenciaMes(ano, mes),
        fechamento: {
          status: carimbo.status,
          descricao: carimbo.texto,
          cienciaConselho: !!registro?.cienciaConselhoAt,
          lancamentosPosteriores: fechamento ? totaisDivergem(fechamento, b) : undefined,
        },
        receitas: centavos(b.receitasCents),
        despesas: centavos(b.despesasCents),
        saldo: centavos(b.saldoCents),
        capitacoesRecebidas: {
          irmaos: b.capitacoes.quantidade,
          total: centavos(b.capitacoes.totalCents),
        },
        porCategoria: b.porCategoria.map((c) => ({
          categoria: c.nome,
          tipo: c.tipo,
          total: centavos(c.totalCents),
        })),
        ultimos12Meses: ultimos12.map((u) => ({
          mes: `${String(u.mes).padStart(2, "0")}/${u.ano}`,
          ...("aberto" in u && u.aberto
            ? { situacao: "ainda não fechado" }
            : {
                receitas: centavos(u.receitasCents),
                despesas: centavos(u.despesasCents),
                saldo: centavos(u.receitasCents - u.despesasCents),
              }),
        })),
        // lançamentos individuais só para quem lê a Tesouraria (VM, Tesoureiro,
        // Conselho); nunca as capitações nem a beneficência linha a linha
        lancamentos: leTesouraria(user)
          ? b.lancamentos.map((l) => ({
              data: dataBr(l.data),
              descricao: l.descricao,
              categoria: l.categoria,
              tipo: l.tipo,
              valor: centavos(l.valorCents),
            }))
          : undefined,
        observacao:
          "Balancete consolidado pela Tesouraria; dúvidas com o Tesoureiro ou o Conselho de Contas.",
      };
    },
  },
  {
    nome: "inadimplencia_loja",
    descricao:
      "Membros com capitações vencidas e membros irregulares, com quantidade e valor devido por irmão. Disponível para Venerável, Tesoureiro, Conselho de Contas e Esmoler.",
    inputSchema: semInput,
    disponivel: (u) => leTesouraria(u) || acompanhaBemEstar(u),
    executar: async (user) => {
      const vencidas = await prisma.invoice.groupBy({
        by: ["userId"],
        where: { lodgeId: user.lodgeId, status: "VENCIDA" },
        _count: { _all: true },
        _sum: { amountCents: true },
      });
      const users = await prisma.user.findMany({
        where: { id: { in: vencidas.map((v) => v.userId) } },
        select: { id: true, name: true, status: true },
      });
      const porId = new Map(users.map((u) => [u.id, u]));
      return {
        totalMembrosComVencidas: vencidas.length,
        membros: vencidas
          .map((v) => ({
            nome: porId.get(v.userId)?.name ?? "?",
            situacao: porId.get(v.userId)?.status,
            capitacoesVencidas: v._count._all,
            valorDevido: centavos(v._sum.amountCents ?? 0),
          }))
          .sort((a, b) => b.capitacoesVencidas - a.capitacoesVencidas),
      };
    },
  },
  {
    nome: "quadro_membros",
    descricao:
      "Quadro de obreiros da loja: total e contagens por situação (ativo, irregular, licenciado) e por grau. Disponível para Venerável, Secretário e Conselho de Contas.",
    inputSchema: semInput,
    disponivel: leSecretaria,
    executar: async (user) => {
      const membros = await prisma.user.findMany({
        where: {
          lodgeId: user.lodgeId,
          currentRole: { not: "SUPER_ADMIN" },
          status: { not: "EX_MEMBRO" },
        },
        select: { status: true, degree: true },
      });
      const conta = (chave: (m: (typeof membros)[number]) => string) => {
        const r: Record<string, number> = {};
        for (const m of membros) r[chave(m)] = (r[chave(m)] ?? 0) + 1;
        return r;
      };
      return {
        total: membros.length,
        porSituacao: conta((m) => m.status),
        porGrau: conta((m) => m.degree),
      };
    },
  },
  {
    nome: "frequencia_loja",
    descricao:
      "Frequência anual de todos os obreiros e alertas de baixa frequência (abaixo de 50% com sessões suficientes computadas). Disponível para Venerável, Secretário, Conselho de Contas e Esmoler.",
    inputSchema: semInput,
    disponivel: (u) => leSecretaria(u) || acompanhaBemEstar(u),
    executar: async (user) => {
      const todos = await frequenciaAnual(user.lodgeId);
      const computados = todos.filter((f) => f.percentual !== null);
      const media =
        computados.length > 0
          ? Math.round(
              computados.reduce((s, f) => s + (f.percentual ?? 0), 0) /
                computados.length
            )
          : null;
      const baixa = computados.filter(
        (f) =>
          f.sessoesComputadas >= MIN_SESSOES_PARA_ALERTA &&
          (f.percentual ?? 0) < 50
      );
      return {
        ano: new Date().getFullYear(),
        mediaPercentual: media,
        alertasBaixaFrequencia: baixa.map((f) => ({
          nome: f.name,
          grau: f.degree,
          presencas: f.presencas,
          sessoesComputadas: f.sessoesComputadas,
          percentual: f.percentual,
        })),
        obreiros: todos.map((f) => ({
          nome: f.name,
          percentual: f.percentual,
          presencas: f.presencas,
          sessoesComputadas: f.sessoesComputadas,
        })),
      };
    },
  },
  {
    nome: "confirmacoes_sessao",
    descricao:
      "Confirmações de presença (RSVP do convite) e ausências justificadas dos irmãos, sessão a sessão: quem confirmou (e se fica para o Ágape), quem justificou (com o texto da justificativa) e quem ainda não respondeu. Cobre as próximas sessões e a última realizada. Disponível para Venerável, Secretário e Conselho de Contas.",
    inputSchema: semInput,
    disponivel: leSecretaria,
    executar: async (user) => {
      const agora = new Date();
      const [proximas, ultima, membros] = await Promise.all([
        prisma.lodgeSession.findMany({
          where: { lodgeId: user.lodgeId, date: { gte: agora } },
          orderBy: { date: "asc" },
          take: 2,
          select: { id: true, date: true, type: true, degree: true },
        }),
        prisma.lodgeSession.findFirst({
          where: { lodgeId: user.lodgeId, date: { lt: agora } },
          orderBy: { date: "desc" },
          select: { id: true, date: true, type: true, degree: true },
        }),
        prisma.user.findMany({
          where: {
            lodgeId: user.lodgeId,
            status: { in: ["ATIVO", "IRREGULAR"] },
            currentRole: { not: "SUPER_ADMIN" },
          },
          select: { id: true, name: true },
        }),
      ]);
      const sessoes = [...proximas, ...(ultima ? [ultima] : [])];
      if (!sessoes.length)
        return { info: "Nenhuma sessão agendada ou realizada na loja." };
      const nomePorId = new Map(membros.map((m) => [m.id, m.name]));
      const resumo = async (
        s: (typeof sessoes)[number],
        passada: boolean
      ) => {
        const regs = await prisma.attendance.findMany({
          where: { lodgeId: user.lodgeId, sessionId: s.id, userId: { not: null } },
          select: {
            userId: true,
            checkedIn: true,
            rsvpAt: true,
            agapeConfirmed: true,
            justificado: true,
            justificativa: true,
            user: { select: { name: true } },
          },
        });
        const responderam = new Set(regs.map((r) => r.userId));
        const semResposta = membros
          .filter((m) => !responderam.has(m.id))
          .map((m) => m.name);
        const justificados = regs
          .filter((r) => r.justificado)
          .map((r) => ({
            nome: r.user?.name ?? "?",
            justificativa: r.justificativa,
          }));
        return {
          sessao: {
            data: s.date.toLocaleString("pt-BR", {
              timeZone: "America/Sao_Paulo",
              dateStyle: "full",
              timeStyle: "short",
            }),
            tipo: s.type,
            grau: s.degree === "NA" ? null : s.degree,
            situacao: passada ? "realizada" : "agendada",
          },
          ...(passada
            ? {
                presentes: regs
                  .filter((r) => r.checkedIn)
                  .map((r) => r.user?.name ?? "?"),
              }
            : {
                confirmados: regs
                  .filter((r) => !r.justificado && (r.rsvpAt || r.checkedIn))
                  .map((r) => ({
                    nome: r.user?.name ?? "?",
                    agape: r.agapeConfirmed,
                    confirmouEm: r.rsvpAt ? dataBr(r.rsvpAt) : null,
                  })),
              }),
          justificados,
          semResposta,
        };
      };
      return {
        totalMembrosAtivos: nomePorId.size,
        sessoes: await Promise.all(
          sessoes.map((s) => resumo(s, ultima ? s.id === ultima.id : false))
        ),
      };
    },
  },
  {
    nome: "processos_loja",
    descricao:
      "Processos em andamento na loja (Atestados de Regularidade e Quitte Placets de todos os irmãos), com solicitante, status e assinaturas pendentes. Disponível para Venerável, Secretário, Tesoureiro e Conselho de Contas.",
    inputSchema: semInput,
    disponivel: (u) => leSecretaria(u) || u.role === "TESOUREIRO",
    executar: async (user) => {
      const [atestados, quittes] = await Promise.all([
        prisma.atestadoRegularidade.findMany({
          where: { lodgeId: user.lodgeId },
          orderBy: { solicitadoAt: "desc" },
          take: 20,
          select: {
            status: true,
            solicitadoAt: true,
            signedByTesAt: true,
            signedBySecAt: true,
            signedByMasterAt: true,
            userId: true,
            user: { select: { name: true } },
          },
        }),
        prisma.quittePlacet.findMany({
          where: { lodgeId: user.lodgeId },
          orderBy: { dataSolicitacao: "desc" },
          take: 20,
          select: {
            status: true,
            dataSolicitacao: true,
            quitacaoFinanceira: true,
            signedBySecAt: true,
            signedByOradorAt: true,
            signedByMasterAt: true,
            userId: true,
            user: { select: { name: true } },
          },
        }),
      ]);
      return {
        atestados: atestados.map((a) => ({
          userId: a.userId,
          solicitante: a.user.name,
          status: a.status,
          solicitadoEm: dataBr(a.solicitadoAt),
          assinaturasPendentes: [
            !a.signedByTesAt && "Tesoureiro",
            !a.signedBySecAt && "Secretário",
            !a.signedByMasterAt && "Venerável",
          ].filter(Boolean),
        })),
        quittePlacets: quittes.map((q) => ({
          userId: q.userId,
          solicitante: q.user.name,
          status: q.status,
          solicitadoEm: dataBr(q.dataSolicitacao),
          quitacaoFinanceira: q.quitacaoFinanceira,
          assinaturasPendentes: [
            !q.signedBySecAt && "Secretário",
            !q.signedByOradorAt && "Orador",
            !q.signedByMasterAt && "Venerável",
          ].filter(Boolean),
        })),
      };
    },
  },
  {
    nome: "mutua_loja",
    descricao:
      "Situação da Mútua/CABM (Form. 108) na loja inteira: quantos irmãos entregaram a Declaração de Beneficiários e quem ainda está pendente. Disponível para Venerável, Secretário e Conselho de Contas.",
    inputSchema: semInput,
    disponivel: leSecretaria,
    executar: async (user) => {
      const [membros, entregas] = await Promise.all([
        prisma.user.findMany({
          where: {
            lodgeId: user.lodgeId,
            status: { in: ["ATIVO", "IRREGULAR"] },
            currentRole: { not: "SUPER_ADMIN" },
          },
          select: { id: true, name: true },
        }),
        prisma.mutuaEntrega.findMany({
          where: { lodgeId: user.lodgeId },
          select: { userId: true },
        }),
      ]);
      const entregou = new Set(entregas.map((e) => e.userId));
      const pendentes = membros.filter((m) => !entregou.has(m.id));
      return {
        totalMembros: membros.length,
        entregues: membros.length - pendentes.length,
        pendentes: pendentes.map((m) => m.name),
      };
    },
  },
  // ---------------- Atas e documentos do Drive ----------------
  {
    nome: "buscar_atas",
    descricao:
      "Busca um termo no TEXTO das atas da loja e devolve as atas encontradas (número, data da sessão, status) com trechos ao redor de cada ocorrência. Obreiros pesquisam só as atas ASSINADAS (as que foram ao quadro); VM, Secretário e Conselho também as em andamento.",
    inputSchema: {
      type: "object",
      properties: {
        termo: {
          type: "string",
          description: "Palavra ou expressão a procurar no texto das atas",
        },
        ano: { type: "number", description: "Opcional: limitar ao ano da sessão" },
      },
      required: ["termo"],
      additionalProperties: false,
    },
    disponivel: paraTodos,
    executar: async (user, input) => {
      const termo = String(input.termo ?? "").trim();
      if (termo.length < 3) return { erro: "Informe um termo com 3+ letras." };
      const ano = Number(input.ano) || null;
      // Full-text em português (stemming); a expressão do to_tsvector é a
      // mesma do índice GIN atas_content_fts.
      const statusSql = canReadSecretariaAdmin(user.role)
        ? Prisma.sql`a."status"::text <> 'RASCUNHO'`
        : Prisma.sql`a."status"::text = 'ASSINADA'`;
      const anoSql = ano
        ? Prisma.sql`s."date" >= ${new Date(ano, 0, 1)} AND s."date" < ${new Date(ano + 1, 0, 1)}`
        : Prisma.sql`TRUE`;
      const rows = await prisma.$queryRaw<
        { number: number; status: string; date: Date; trechos: string }[]
      >`
        SELECT a."number", a."status"::text AS status, s."date",
               ts_headline('portuguese', a."content",
                 websearch_to_tsquery('portuguese', ${termo}), ${FTS_HEADLINE}) AS trechos
        FROM "atas" a
        JOIN "lodge_sessions" s ON s."id" = a."sessionId"
        WHERE a."lodgeId" = ${user.lodgeId}
          AND to_tsvector('portuguese', a."content") @@ websearch_to_tsquery('portuguese', ${termo})
          AND ${statusSql} AND ${anoSql}
        ORDER BY s."date" DESC
        LIMIT 5`;
      if (rows.length)
        return rows.map((r) => ({
          fonte: `Ata nº ${r.number}, sessão de ${dataBr(r.date)}`,
          status: r.status,
          trechos: documento(r.trechos),
        }));
      // Fallback: substring exata (nomes próprios, códigos, siglas fora do stemming)
      const atas = await prisma.ata.findMany({
        where: {
          lodgeId: user.lodgeId,
          content: { contains: termo, mode: "insensitive" },
          status: canReadSecretariaAdmin(user.role)
            ? { not: "RASCUNHO" }
            : "ASSINADA",
          ...(ano
            ? {
                session: {
                  date: {
                    gte: new Date(ano, 0, 1),
                    lt: new Date(ano + 1, 0, 1),
                  },
                },
              }
            : {}),
        },
        orderBy: { session: { date: "desc" } },
        take: 5,
        select: {
          number: true,
          status: true,
          content: true,
          session: { select: { date: true, type: true } },
        },
      });
      if (!atas.length)
        return { info: `Nenhuma ata encontrada com "${termo}".` };
      return atas.map((a) => ({
        fonte: `Ata nº ${a.number}, sessão de ${dataBr(a.session.date)}`,
        status: a.status,
        trechos: trechos(a.content, termo).map(documento),
      }));
    },
  },
  {
    nome: "buscar_pranchas",
    descricao:
      "Busca um termo no assunto e no TEXTO das pranchas da loja e devolve as encontradas (número/ano, assunto, destinatário, data) com trechos ao redor de cada ocorrência. Disponível para Venerável, Secretário e Conselho de Contas.",
    inputSchema: {
      type: "object",
      properties: {
        termo: {
          type: "string",
          description: "Palavra ou expressão a procurar nas pranchas",
        },
        ano: { type: "number", description: "Opcional: limitar ao ano da prancha" },
      },
      required: ["termo"],
      additionalProperties: false,
    },
    disponivel: leSecretaria,
    executar: async (user, input) => {
      const termo = String(input.termo ?? "").trim();
      if (termo.length < 3) return { erro: "Informe um termo com 3+ letras." };
      const ano = Number(input.ano) || null;
      const anoSql = ano ? Prisma.sql`p."year" = ${ano}` : Prisma.sql`TRUE`;
      // Expressão idêntica ao índice GIN pranchas_content_fts
      const rows = await prisma.$queryRaw<
        {
          number: number;
          year: number;
          subject: string;
          recipient: string;
          createdAt: Date;
          trechos: string;
        }[]
      >`
        SELECT p."number", p."year", p."subject", p."recipient", p."createdAt",
               ts_headline('portuguese', p."subject" || ' ' || p."content",
                 websearch_to_tsquery('portuguese', ${termo}), ${FTS_HEADLINE}) AS trechos
        FROM "pranchas" p
        WHERE p."lodgeId" = ${user.lodgeId}
          AND to_tsvector('portuguese', p."subject" || ' ' || p."content")
              @@ websearch_to_tsquery('portuguese', ${termo})
          AND ${anoSql}
        ORDER BY p."year" DESC, p."number" DESC
        LIMIT 5`;
      if (!rows.length)
        return { info: `Nenhuma prancha encontrada com "${termo}".` };
      return rows.map((r) => ({
        fonte: `Prancha nº ${r.number}/${r.year} — ${r.subject}`,
        destinatario: r.recipient,
        data: dataBr(r.createdAt),
        trechos: documento(r.trechos),
      }));
    },
  },
  {
    nome: "buscar_biblioteca",
    descricao:
      "Busca um termo na Biblioteca Digital da loja (título, autor, descrição e o TEXTO dos arquivos) e devolve os itens encontrados com trechos ao redor de cada ocorrência. Disponível a todos os irmãos da loja.",
    inputSchema: {
      type: "object",
      properties: {
        termo: {
          type: "string",
          description: "Palavra ou expressão a procurar na biblioteca",
        },
      },
      required: ["termo"],
      additionalProperties: false,
    },
    disponivel: paraTodos,
    executar: async (user, input) => {
      const termo = String(input.termo ?? "").trim();
      if (termo.length < 3) return { erro: "Informe um termo com 3+ letras." };
      // Expressão idêntica ao índice GIN biblioteca_itens_texto_fts; título,
      // autor e descrição entram por ILIKE (poucos itens por loja).
      const rows = await prisma.$queryRaw<
        {
          id: string;
          titulo: string;
          autor: string | null;
          categoria: string;
          trechos: string | null;
        }[]
      >`
        SELECT b."id", b."titulo", b."autor", b."categoria"::text AS categoria,
               CASE WHEN to_tsvector('portuguese', coalesce(b."textoExtraido", ''))
                         @@ websearch_to_tsquery('portuguese', ${termo})
                    THEN ts_headline('portuguese', b."textoExtraido",
                      websearch_to_tsquery('portuguese', ${termo}), ${FTS_HEADLINE})
               END AS trechos
        FROM "biblioteca_itens" b
        WHERE b."lodgeId" = ${user.lodgeId}
          AND b."grauMinimo"::text = ANY(${grausDoUsuario(user)})
          AND (to_tsvector('portuguese', coalesce(b."textoExtraido", ''))
                 @@ websearch_to_tsquery('portuguese', ${termo})
               OR b."titulo" ILIKE ${"%" + termo + "%"}
               OR b."autor" ILIKE ${"%" + termo + "%"}
               OR b."descricao" ILIKE ${"%" + termo + "%"})
        ORDER BY b."createdAt" DESC
        LIMIT 5`;
      if (!rows.length)
        return { info: `Nada na biblioteca com "${termo}". O acervo fica em /dashboard/biblioteca.` };
      return rows.map((r) => ({
        id: r.id,
        fonte: `"${r.titulo}"${r.autor ? `, de ${r.autor}` : ""} (${r.categoria})`,
        trechos: documento(r.trechos ?? "(termo encontrado no título/autor/descrição)"),
      }));
    },
  },
  {
    nome: "ler_biblioteca",
    descricao:
      "Devolve o TEXTO COMPLETO de um item da Biblioteca Digital da loja (regulamentos, regimentos, decretos, rituais) pelo id devolvido por buscar_biblioteca, para responder com precisão citando artigos e trechos. Documentos muito longos vêm truncados. Disponível a todos os irmãos da loja.",
    inputSchema: {
      type: "object",
      properties: {
        itemId: {
          type: "string",
          description: "id do item (de buscar_biblioteca)",
        },
      },
      required: ["itemId"],
      additionalProperties: false,
    },
    disponivel: paraTodos,
    executar: async (user, input) => {
      // O id da IA só é aceito se o item pertencer à loja do usuário
      const item = await prisma.bibliotecaItem.findFirst({
        where: {
          id: String(input.itemId ?? ""),
          lodgeId: user.lodgeId,
          grauMinimo: { in: grausDoUsuario(user) as never[] },
        },
        select: { titulo: true, autor: true, categoria: true, textoExtraido: true },
      });
      if (!item) return { erro: "Item não encontrado na biblioteca da loja." };
      if (!item.textoExtraido)
        return {
          erro: "Este item ainda não tem texto extraído (formato sem suporte ou PDF escaneado sem camada de texto).",
        };
      const LIMITE = 30_000;
      return {
        fonte: `"${item.titulo}"${item.autor ? `, de ${item.autor}` : ""} (${item.categoria})`,
        truncado: item.textoExtraido.length > LIMITE,
        texto: documento(item.textoExtraido.slice(0, LIMITE)),
      };
    },
  },
  {
    nome: "listar_documentos_drive",
    descricao:
      "Lista os documentos do arquivo digital da loja no Google Drive (atas assinadas arquivadas, regulamentos, ofícios), com id, título, tipo e data — o id serve para ler_documento_drive. Aceita um termo opcional para filtrar pelo título. Disponível para Venerável, Secretário e Conselho de Contas.",
    inputSchema: {
      type: "object",
      properties: {
        termo: { type: "string", description: "Opcional: filtro pelo título" },
      },
      additionalProperties: false,
    },
    disponivel: leSecretaria,
    executar: async (user, input) => {
      const termo = String(input.termo ?? "").trim();
      const docs = await prisma.document.findMany({
        where: {
          lodgeId: user.lodgeId,
          grauMinimo: { in: grausDoUsuario(user) as never[] },
          ...(termo
            ? { title: { contains: termo, mode: "insensitive" } }
            : {}),
        },
        orderBy: { createdAt: "desc" },
        take: 25,
        select: { id: true, title: true, type: true, mimeType: true, createdAt: true },
      });
      if (!docs.length)
        return {
          info: termo
            ? `Nenhum documento com "${termo}" no título.`
            : "Nenhum documento arquivado no Drive da loja.",
        };
      return docs.map((d) => ({
        id: d.id,
        titulo: d.title,
        tipo: d.type,
        formato: d.mimeType,
        arquivadoEm: dataBr(d.createdAt),
      }));
    },
  },
  {
    nome: "ler_documento_drive",
    descricao:
      "Baixa um documento do Drive da loja (pelo id devolvido por listar_documentos_drive) e devolve o TEXTO extraído, para responder perguntas sobre o conteúdo. PDFs e arquivos de texto; documentos longos vêm truncados. Disponível para Venerável, Secretário e Conselho de Contas.",
    inputSchema: {
      type: "object",
      properties: {
        documentoId: {
          type: "string",
          description: "id do documento (de listar_documentos_drive)",
        },
      },
      required: ["documentoId"],
      additionalProperties: false,
    },
    disponivel: leSecretaria,
    executar: async (user, input) => {
      // O id da IA só é aceito se o documento pertencer à loja do usuário
      const doc = await prisma.document.findFirst({
        where: {
          id: String(input.documentoId ?? ""),
          lodgeId: user.lodgeId,
          grauMinimo: { in: grausDoUsuario(user) as never[] },
        },
        select: { title: true, driveFileId: true },
      });
      if (!doc) return { erro: "Documento não encontrado no arquivo da loja." };
      let arquivo;
      try {
        arquivo = await downloadFromLodgeDrive(user.lodgeId, doc.driveFileId);
      } catch (e) {
        return {
          erro: `Não foi possível baixar do Drive: ${
            e instanceof Error ? e.message : "erro desconhecido"
          }`,
        };
      }
      const LIMITE = 15_000;
      let texto: string;
      if (arquivo.mimeType === "application/pdf") {
        try {
          texto = await textoDePdf(arquivo.data);
        } catch {
          return { erro: "Falha ao extrair o texto do PDF." };
        }
      } else if (arquivo.mimeType.startsWith("text/")) {
        texto = arquivo.data.toString("utf8");
      } else {
        return {
          erro: `Formato ${arquivo.mimeType} não suportado para leitura — apenas PDF e texto.`,
        };
      }
      texto = texto.replace(/\n{3,}/g, "\n\n").trim();
      return {
        titulo: doc.title,
        truncado: texto.length > LIMITE,
        texto: documento(texto.slice(0, LIMITE)),
      };
    },
  },
];

export function ferramentasPara(user: AssistenteUser) {
  return FERRAMENTAS.filter((f) => f.disponivel(user));
}

export function paraAnthropicTools(fs: Ferramenta[]): Anthropic.Tool[] {
  return fs.map((f) => ({
    name: f.nome,
    description: f.descricao,
    input_schema: f.inputSchema,
  }));
}
