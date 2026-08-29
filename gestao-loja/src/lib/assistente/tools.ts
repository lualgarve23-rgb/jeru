// Ferramentas do Assistente IA — Fase 1: somente leitura, dados PESSOAIS do
// usuário logado. lodgeId/userId vêm SEMPRE da sessão, nunca do input da IA.
// `disponivel(user)` filtra por cargo ANTES de expor a ferramenta ao modelo.

import type Anthropic from "@anthropic-ai/sdk";
import { prisma } from "@/lib/prisma";
import {
  frequenciaAnual,
  MIN_SESSOES_PARA_ALERTA,
} from "@/lib/frequencia";
import {
  canReadSecretariaAdmin,
  canReadTesouraria,
} from "@/lib/permissions";
import { downloadFromLodgeDrive } from "@/lib/google-drive";
import { notificationWhere } from "@/lib/notifications";
import { buscarFaq, FAQ_CHAVES } from "@/lib/assistente/faq";

export type AssistenteUser = {
  id: string;
  lodgeId: string;
  role: string;
  name: string;
};

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

function centavos(v: number) {
  return (v / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function dataBr(d: Date) {
  return d.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
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

// Extrai texto de um PDF com o pdftotext (poppler) instalado no servidor
async function textoDePdf(pdf: Buffer): Promise<string> {
  const { execFile } = await import("node:child_process");
  const { promisify } = await import("node:util");
  const { writeFile, rm } = await import("node:fs/promises");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const { randomUUID } = await import("node:crypto");
  const tmp = join(tmpdir(), `assistente-${randomUUID()}.pdf`);
  await writeFile(tmp, pdf);
  try {
    const { stdout } = await promisify(execFile)(
      "pdftotext",
      ["-layout", tmp, "-"],
      { maxBuffer: 20 * 1024 * 1024 }
    );
    return stdout;
  } finally {
    await rm(tmp, { force: true });
  }
}

export const FERRAMENTAS: Ferramenta[] = [
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
      "Processos pessoais do usuário: pedidos de Atestado de Regularidade e de Quitte Placet, com status e assinaturas já feitas.",
    inputSchema: semInput,
    disponivel: paraTodos,
    executar: async (user) => {
      const [atestados, quittes] = await Promise.all([
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
            signedByMasterAt: true,
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
            veneravel: !!q.signedByMasterAt,
          },
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
            signedByMasterAt: true,
            user: { select: { name: true } },
          },
        }),
      ]);
      return {
        atestados: atestados.map((a) => ({
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
          solicitante: q.user.name,
          status: q.status,
          solicitadoEm: dataBr(q.dataSolicitacao),
          quitacaoFinanceira: q.quitacaoFinanceira,
          assinaturasPendentes: [
            !q.signedBySecAt && "Secretário",
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
        ata: `nº ${a.number}`,
        sessao: dataBr(a.session.date),
        status: a.status,
        trechos: trechos(a.content, termo),
      }));
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
        where: { id: String(input.documentoId ?? ""), lodgeId: user.lodgeId },
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
        texto: texto.slice(0, LIMITE),
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
