import { prisma } from "@/lib/prisma";
import { proximoCargoAtestado, cargoAssinanteAtestado } from "@/lib/atestado";
import {
  proximoCargoQuitte,
  cargoAssinanteQuitte,
  cargoQuitteDosCargos,
} from "@/lib/quitte";
import {
  cargoLabel,
  cargosProcesso,
  estadoProcesso,
  type AssinanteProcesso,
} from "@/lib/processos";
import { canWriteSecretaria, canWriteTesouraria } from "@/lib/permissions";
import { capitacaoVencida } from "@/lib/datas-sp";
import { linkProcessos } from "@/lib/notifications";
import { cargoCorresponde } from "@/lib/cargos";

/*
 * "Minha vez" — tudo o que está parado esperando o usuário logado, num só
 * lugar: assinaturas na vez do cargo (atestado, Quitte, processos, Form. 116,
 * atas), aprovações (despesas), registros da Secretaria (sessão do
 * afastamento, Form. 122, candidatos, LGPD), pagamentos do próprio irmão,
 * convites sem resposta e alertas dirigidos ao Esmoler.
 *
 * A montagem é pura (montarPendencias) para ser testável sem banco; a coleta
 * (pendenciasDoUsuario) só busca no Prisma e delega. Todo item tem um link
 * direto ao card/página do recurso — nunca uma rota genérica.
 */

export type AcaoPendencia =
  | "assinar"
  | "aprovar"
  | "registrar"
  | "pagar"
  | "responder"
  | "acompanhar";

export type TipoPendencia =
  | "atestado"
  | "quitte"
  | "processo"
  | "afastamento"
  | "ata"
  | "despesa"
  | "capitacao"
  | "convite"
  | "lgpd"
  | "esmoler"
  | "candidato";

export type Pendencia = {
  chave: string; // "<tipo>-<id>" — estável, serve de key e de destaque
  tipo: TipoPendencia;
  titulo: string;
  contexto: string;
  link: string;
  desde: Date;
  acao?: AcaoPendencia;
  // 1 = mais urgente (assinaturas/aprovações), 3 = acompanhamento
  prioridade: 1 | 2 | 3;
};

export type UsuarioPendencias = {
  id: string;
  lodgeId: string;
  role: string;
  cargoRito?: string | null;
  degree?: string;
};

export const ACAO_LABEL: Record<AcaoPendencia, string> = {
  assinar: "Assinar",
  aprovar: "Aprovar",
  registrar: "Registrar",
  pagar: "Pagar",
  responder: "Responder",
  acompanhar: "Acompanhar",
};

const DIA_MS = 86_400_000;

export function diasDesde(d: Date, agora = new Date()) {
  return Math.max(0, Math.floor((agora.getTime() - d.getTime()) / DIA_MS));
}

export function haQuantoTempo(d: Date, agora = new Date()) {
  const dias = diasDesde(d, agora);
  if (dias === 0) return "hoje";
  if (dias === 1) return "há 1 dia";
  return `há ${dias} dias`;
}

const DEGREE_RANK: Record<string, number> = {
  APRENDIZ: 1,
  COMPANHEIRO: 2,
  MESTRE: 3,
};

function ultimaData(...datas: (Date | null | undefined)[]): Date | null {
  let r: Date | null = null;
  for (const d of datas) if (d && (!r || d > r)) r = d;
  return r;
}

// ───────────── Dados brutos (formato mínimo de cada fonte) ─────────────

export type DadosPendencias = {
  atestados: {
    id: string;
    userId: string;
    solicitadoAt: Date;
    signedByTesAt: Date | null;
    signedBySecAt: Date | null;
    signedByMasterAt: Date | null;
    user: { name: string };
  }[];
  quittes: {
    id: string;
    userId: string;
    status: string;
    dataSolicitacao: Date;
    quitacaoFinanceira: boolean;
    cartaNome: string | null;
    dataSessaoComunicacao: Date | null;
    ataNome: string | null;
    formularioNome: string | null;
    signedBySecAt: Date | null;
    signedByOradorAt: Date | null;
    signedByMasterAt: Date | null;
    user: { name: string };
  }[];
  processos: {
    id: string;
    titulo: string;
    createdAt: Date;
    assinantes: AssinanteProcesso[];
  }[];
  afastamentos: {
    id: string;
    userId: string;
    status: string;
    createdAt: Date;
    requerimentoSignedAt: Date | null;
    dataSessao: Date | null;
    signedBySecAt: Date | null;
    signedByMasterAt: Date | null;
    enviadoAt: Date | null;
    user: { name: string };
  }[];
  atas: {
    id: string;
    number: number;
    status: string;
    updatedAt: Date;
    govbrSolicitado: boolean;
    signedByMasterId: string | null;
    signedBySecId: string | null;
    govbrMasterAt: Date | null;
    govbrSecAt: Date | null;
    session: { date: Date };
  }[];
  despesas: {
    id: string;
    description: string;
    amountCents: number;
    createdAt: Date;
    approvedByMasterId: string | null;
    approvedByTreasurerId: string | null;
  }[];
  // só as do próprio usuário
  capitacoes: {
    id: string;
    description: string;
    amountCents: number;
    dueDate: Date;
    status: string;
  }[];
  // próximas sessões com a resposta (RSVP) do próprio usuário, se houver
  sessoes: {
    id: string;
    date: Date;
    degree: string;
    type: string;
    inviteToken: string;
    createdAt: Date;
    respondeu: boolean;
  }[];
  // notificações não lidas relevantes (LGPD e alertas dirigidos ao Esmoler)
  notificacoes: {
    id: string;
    userId: string | null;
    sourceKey: string | null;
    title: string;
    description: string;
    link: string | null;
    createdAt: Date;
  }[];
  candidatos: {
    id: string;
    nomeCandidato: string;
    status: string;
    dataEscrutinio: Date | null;
    aprovado: boolean | null;
    updatedAt: Date;
  }[];
};

function brl(cents: number) {
  return (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function dataBr(d: Date) {
  return d.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
}

// ───────────── Montagem (pura) ─────────────

export function montarPendencias(
  user: UsuarioPendencias,
  dados: DadosPendencias,
  agora = new Date()
): Pendencia[] {
  const cargos = cargosProcesso(user.role, user.cargoRito);
  const secretaria = canWriteSecretaria(user.role);
  const tesouraria = canWriteTesouraria(user.role);
  const vm = user.role === "VENERAVEL_MESTRE";
  const out: Pendencia[] = [];

  // Atestados: cadeia Tesoureiro → Secretário → VM (níveis de acesso)
  for (const a of dados.atestados) {
    const proximo = proximoCargoAtestado(a);
    if (!proximo || proximo !== user.role) continue;
    out.push({
      chave: `atestado-${a.id}`,
      tipo: "atestado",
      titulo: `Atestado de Regularidade de ${a.user.name}`,
      contexto: `Assinatura gov.br como ${cargoAssinanteAtestado(user.role)} · solicitado em ${dataBr(a.solicitadoAt)}`,
      link: linkProcessos(`atestado-${a.id}`),
      desde: ultimaData(a.signedByTesAt, a.signedBySecAt) ?? a.solicitadoAt,
      acao: "assinar",
      prioridade: 1,
    });
  }

  // Quitte Placet: pré-requisitos (carta do irmão, Nada Consta, sessão/ata,
  // Form. 122) e depois a cadeia Secretário → Orador → VM
  for (const q of dados.quittes) {
    if (q.status !== "PENDENTE" && q.status !== "EM_ANALISE") continue;
    const chave = `quitte-${q.id}`;
    const base = {
      chave,
      tipo: "quitte" as const,
      titulo: `Quitte Placet de ${q.user.name}`,
      link: linkProcessos(chave),
    };
    if (!q.cartaNome) {
      if (q.userId === user.id) {
        out.push({
          ...base,
          titulo: "Seu pedido de Quitte Placet",
          contexto: "Falta anexar a carta de próprio punho",
          link: "/secretaria/quitte-placets",
          desde: q.dataSolicitacao,
          acao: "registrar",
          prioridade: 2,
        });
      }
      continue;
    }
    if (!q.quitacaoFinanceira) {
      if (tesouraria)
        out.push({
          ...base,
          contexto: "Confirmar o Nada Consta da Tesouraria (trava financeira)",
          desde: q.dataSolicitacao,
          acao: "registrar",
          prioridade: 2,
        });
      continue;
    }
    if (!q.dataSessaoComunicacao || !q.ataNome) {
      if (secretaria)
        out.push({
          ...base,
          contexto: "Registrar a sessão de comunicação à Loja e anexar a ata",
          desde: q.dataSolicitacao,
          acao: "registrar",
          prioridade: 2,
        });
      continue;
    }
    if (!q.formularioNome) {
      if (secretaria)
        out.push({
          ...base,
          contexto: "Gerar ou anexar o Form. 122 em PDF",
          link: `/secretaria/quitte-placets#form-placet-${q.id}`,
          desde: q.dataSessaoComunicacao,
          acao: "registrar",
          prioridade: 2,
        });
      continue;
    }
    const proximo = proximoCargoQuitte(q);
    if (!proximo) continue;
    const meu = cargoQuitteDosCargos(cargos, q);
    if (meu !== proximo) continue;
    out.push({
      ...base,
      contexto: `Assinatura gov.br como ${cargoAssinanteQuitte(proximo)} · solicitado em ${dataBr(q.dataSolicitacao)}`,
      desde:
        ultimaData(q.signedBySecAt, q.signedByOradorAt) ?? q.dataSessaoComunicacao,
      acao: "assinar",
      prioridade: 1,
    });
  }

  // Processos genéricos (cadeia ordenada; Orador/Vigilantes pelo cargoRito)
  for (const p of dados.processos) {
    const e = estadoProcesso(cargos, p.assinantes);
    if (!e.minhaVez || !e.cargo) continue;
    out.push({
      chave: `processo-${p.id}`,
      tipo: "processo",
      titulo: p.titulo,
      contexto: `Assinatura gov.br como ${cargoLabel(e.cargo)} · aberto em ${dataBr(p.createdAt)}`,
      link: linkProcessos(`processo-${p.id}`),
      desde:
        ultimaData(...p.assinantes.map((a) => a.signedAt)) ?? p.createdAt,
      acao: "assinar",
      prioridade: 1,
    });
  }

  // Afastamentos (Form. 116)
  for (const p of dados.afastamentos) {
    const chave = `afastamento-${p.id}`;
    const link = linkProcessos(chave);
    if (p.status === "AGUARDANDO_OBREIRO") {
      if (p.userId === user.id)
        out.push({
          chave,
          tipo: "afastamento",
          titulo: "Seu pedido de afastamento",
          contexto: "Assinar o requerimento com a sua conta gov.br",
          link: "/solicitacoes/afastamento",
          desde: p.createdAt,
          acao: "assinar",
          prioridade: 1,
        });
      continue;
    }
    if (p.status === "SOLICITADO") {
      if (secretaria)
        out.push({
          chave,
          tipo: "afastamento",
          titulo: `Afastamento de ${p.user.name}`,
          contexto: "Registrar a sessão que deliberou e o artigo (gera o Form. 116)",
          link,
          desde: p.requerimentoSignedAt ?? p.createdAt,
          acao: "registrar",
          prioridade: 2,
        });
      continue;
    }
    if (p.status === "EM_ASSINATURA") {
      const vez = !p.signedBySecAt ? "SECRETARIO" : "VENERAVEL_MESTRE";
      if (vez !== user.role) continue;
      out.push({
        chave,
        tipo: "afastamento",
        titulo: `Form. 116 — afastamento de ${p.user.name}`,
        contexto: `Assinatura gov.br como ${vez === "SECRETARIO" ? "Secretário" : "Venerável Mestre"}`,
        link,
        desde: p.signedBySecAt ?? p.dataSessao ?? p.createdAt,
        acao: "assinar",
        prioridade: 1,
      });
      continue;
    }
    if (p.status === "ASSINADO" && !p.enviadoAt && secretaria) {
      out.push({
        chave,
        tipo: "afastamento",
        titulo: `Afastamento de ${p.user.name}`,
        contexto: "Enviar o Form. 116 assinado à Guarda dos Selos",
        link,
        desde: p.signedByMasterAt ?? p.createdAt,
        acao: "registrar",
        prioridade: 2,
      });
    }
  }

  // Atas: VM assina primeiro, Secretário depois (senha ou gov.br); em
  // validação, todos os irmãos leem e respondem
  for (const a of dados.atas) {
    const link = `/secretaria/atas/${a.id}`;
    const titulo = `Ata nº ${a.number} — sessão de ${dataBr(a.session.date)}`;
    if (a.status === "AGUARDANDO_ASSINATURAS") {
      const vezVm = a.govbrSolicitado ? !a.govbrMasterAt : !a.signedByMasterId;
      const vezSec = a.govbrSolicitado
        ? !!a.govbrMasterAt && !a.govbrSecAt
        : !!a.signedByMasterId && !a.signedBySecId;
      const minha =
        (user.role === "VENERAVEL_MESTRE" && vezVm) ||
        (user.role === "SECRETARIO" && vezSec);
      if (!minha) continue;
      out.push({
        chave: `ata-${a.id}`,
        tipo: "ata",
        titulo,
        contexto: a.govbrSolicitado
          ? "Assinatura gov.br do balaústre"
          : "Assinatura do balaústre (confirmação por senha)",
        link,
        desde: a.updatedAt,
        acao: "assinar",
        prioridade: 1,
      });
    } else if (a.status === "EM_VALIDACAO") {
      out.push({
        chave: `ata-${a.id}`,
        tipo: "ata",
        titulo,
        contexto: "Ata enviada aos irmãos para validação — leia e aponte ajustes",
        link,
        desde: a.updatedAt,
        acao: "responder",
        prioridade: 3,
      });
    } else if (a.status === "RASCUNHO" && user.role === "SECRETARIO") {
      out.push({
        chave: `ata-${a.id}`,
        tipo: "ata",
        titulo,
        contexto: "Rascunho aguardando lavratura",
        link,
        desde: a.updatedAt,
        acao: "registrar",
        prioridade: 3,
      });
    }
  }

  // Despesas: aprovação dupla VM + Tesoureiro
  for (const d of dados.despesas) {
    const minha =
      (vm && !d.approvedByMasterId) ||
      (user.role === "TESOUREIRO" && !d.approvedByTreasurerId);
    if (!minha) continue;
    out.push({
      chave: `despesa-${d.id}`,
      tipo: "despesa",
      titulo: `Despesa: ${d.description}`,
      contexto: `${brl(d.amountCents)} · aguardando a sua aprovação`,
      link: `/tesouraria/despesas#despesa-${d.id}`,
      desde: d.createdAt,
      acao: "aprovar",
      prioridade: 1,
    });
  }

  // Capitações vencidas do próprio irmão
  for (const i of dados.capitacoes) {
    const vencida =
      i.status === "VENCIDA" ||
      (i.status === "PENDENTE" && capitacaoVencida(i.dueDate, agora));
    if (!vencida) continue;
    out.push({
      chave: `capitacao-${i.id}`,
      tipo: "capitacao",
      titulo: i.description,
      contexto: `${brl(i.amountCents)} · venceu em ${dataBr(i.dueDate)}`,
      link: `/tesouraria/mensalidades/${i.id}`,
      desde: i.dueDate,
      acao: "pagar",
      prioridade: 2,
    });
  }

  // Convites das próximas 2 sessões sem resposta (só sessões do meu grau)
  const meuRank = DEGREE_RANK[user.degree ?? ""] ?? 3;
  const proximas = dados.sessoes
    .filter((s) => s.date >= agora && (DEGREE_RANK[s.degree] ?? 0) <= meuRank)
    .sort((a, b) => a.date.getTime() - b.date.getTime())
    .slice(0, 2);
  for (const s of proximas) {
    if (s.respondeu) continue;
    out.push({
      chave: `convite-${s.id}`,
      tipo: "convite",
      titulo: `Convite para a sessão de ${dataBr(s.date)}`,
      contexto: "Confirme presença ou justifique a ausência",
      link: `/convite/${s.inviteToken}`,
      desde: s.createdAt,
      acao: "responder",
      prioridade: 3,
    });
  }

  // Notificações: pedidos LGPD (Secretaria) e alertas dirigidos ao Esmoler
  for (const n of dados.notificacoes) {
    const key = n.sourceKey ?? "";
    if (key.startsWith("lgpd-exclusao:") && secretaria) {
      out.push({
        chave: `lgpd-${n.id}`,
        tipo: "lgpd",
        titulo: n.title,
        contexto: `${n.description} · prazo legal de 15 dias`,
        link: n.link ?? `/secretaria/membros/${key.slice("lgpd-exclusao:".length)}`,
        desde: n.createdAt,
        acao: "acompanhar",
        prioridade: 2,
      });
    } else if (key.startsWith("esmoler-") && n.userId === user.id) {
      out.push({
        chave: `esmoler-${n.id}`,
        tipo: "esmoler",
        titulo: n.title,
        contexto: n.description,
        link: n.link ?? `/n/${n.id}`,
        desde: n.createdAt,
        acao: "acompanhar",
        prioridade: 3,
      });
    }
  }

  // Candidatos aguardando ação da Secretaria
  if (secretaria) {
    for (const c of dados.candidatos) {
      let contexto: string | null = null;
      if (c.status === "AGUARDANDO_PLACET") {
        contexto = "Expedir/assinar a prancha do Placet de Iniciação";
      } else if (
        c.status === "ESCRUTINIO" &&
        c.dataEscrutinio &&
        c.dataEscrutinio < agora &&
        c.aprovado == null
      ) {
        contexto = `Registrar o resultado do escrutínio de ${dataBr(c.dataEscrutinio)}`;
      }
      if (!contexto) continue;
      out.push({
        chave: `candidato-${c.id}`,
        tipo: "candidato",
        titulo: `Candidato ${c.nomeCandidato}`,
        contexto,
        link: `/secretaria/admissoes#candidato-${c.id}`,
        desde: c.updatedAt,
        acao: "registrar",
        prioridade: 2,
      });
    }
  }

  return out.sort(
    (a, b) => a.prioridade - b.prioridade || a.desde.getTime() - b.desde.getTime()
  );
}

// ───────────── Coleta (Prisma) ─────────────

export async function coletarDados(user: UsuarioPendencias): Promise<DadosPendencias> {
  const lodgeId = user.lodgeId;
  const agora = new Date();
  const [
    atestados,
    quittes,
    processos,
    afastamentos,
    atas,
    despesas,
    capitacoes,
    sessoes,
    notificacoes,
    candidatos,
  ] = await Promise.all([
    prisma.atestadoRegularidade.findMany({
      where: { lodgeId, status: "SOLICITADO" },
      select: {
        id: true,
        userId: true,
        solicitadoAt: true,
        signedByTesAt: true,
        signedBySecAt: true,
        signedByMasterAt: true,
        user: { select: { name: true } },
      },
    }),
    prisma.quittePlacet.findMany({
      where: { lodgeId, status: { in: ["PENDENTE", "EM_ANALISE"] } },
      select: {
        id: true,
        userId: true,
        status: true,
        dataSolicitacao: true,
        quitacaoFinanceira: true,
        cartaNome: true,
        dataSessaoComunicacao: true,
        ataNome: true,
        formularioNome: true,
        signedBySecAt: true,
        signedByOradorAt: true,
        signedByMasterAt: true,
        user: { select: { name: true } },
      },
    }),
    prisma.processoDocumento.findMany({
      where: { lodgeId, status: "EM_ASSINATURA" },
      select: {
        id: true,
        titulo: true,
        createdAt: true,
        assinantes: {
          orderBy: { ordem: "asc" },
          select: { ordem: true, cargo: true, signedAt: true },
        },
      },
    }),
    prisma.pedidoAfastamento.findMany({
      where: {
        lodgeId,
        OR: [
          { status: { in: ["AGUARDANDO_OBREIRO", "SOLICITADO", "EM_ASSINATURA"] } },
          { status: "ASSINADO", enviadoAt: null },
        ],
      },
      select: {
        id: true,
        userId: true,
        status: true,
        createdAt: true,
        requerimentoSignedAt: true,
        dataSessao: true,
        signedBySecAt: true,
        signedByMasterAt: true,
        enviadoAt: true,
        user: { select: { name: true } },
      },
    }),
    prisma.ata.findMany({
      where: {
        lodgeId,
        status: { in: ["RASCUNHO", "EM_VALIDACAO", "AGUARDANDO_ASSINATURAS"] },
      },
      select: {
        id: true,
        number: true,
        status: true,
        updatedAt: true,
        govbrSolicitado: true,
        signedByMasterId: true,
        signedBySecId: true,
        govbrMasterAt: true,
        govbrSecAt: true,
        session: { select: { date: true } },
      },
    }),
    prisma.expense.findMany({
      where: { lodgeId, status: "PENDENTE_APROVACAO" },
      select: {
        id: true,
        description: true,
        amountCents: true,
        createdAt: true,
        approvedByMasterId: true,
        approvedByTreasurerId: true,
      },
    }),
    prisma.invoice.findMany({
      where: { lodgeId, userId: user.id, status: { in: ["PENDENTE", "VENCIDA"] } },
      select: { id: true, description: true, amountCents: true, dueDate: true, status: true },
    }),
    prisma.lodgeSession.findMany({
      where: { lodgeId, date: { gte: agora } },
      orderBy: { date: "asc" },
      take: 6,
      select: {
        id: true,
        date: true,
        degree: true,
        type: true,
        inviteToken: true,
        createdAt: true,
        attendances: { where: { userId: user.id }, select: { id: true } },
      },
    }),
    prisma.notification.findMany({
      where: {
        lodgeId,
        isRead: false,
        OR: [
          { sourceKey: { startsWith: "lgpd-exclusao:" } },
          { userId: user.id, sourceKey: { startsWith: "esmoler-" } },
        ],
      },
      select: {
        id: true,
        userId: true,
        sourceKey: true,
        title: true,
        description: true,
        link: true,
        createdAt: true,
      },
    }),
    prisma.processoAdmissao.findMany({
      where: { lodgeId, status: { in: ["ESCRUTINIO", "AGUARDANDO_PLACET"] } },
      select: {
        id: true,
        nomeCandidato: true,
        status: true,
        dataEscrutinio: true,
        aprovado: true,
        updatedAt: true,
      },
    }),
  ]);
  return {
    atestados,
    quittes,
    processos,
    afastamentos,
    atas,
    despesas,
    capitacoes,
    sessoes: sessoes.map((s) => ({
      id: s.id,
      date: s.date,
      degree: s.degree,
      type: s.type,
      inviteToken: s.inviteToken,
      createdAt: s.createdAt,
      respondeu: s.attendances.length > 0,
    })),
    notificacoes,
    candidatos,
  };
}

export async function pendenciasDoUsuario(user: UsuarioPendencias): Promise<Pendencia[]> {
  if (user.role === "SUPER_ADMIN") return [];
  let u = user;
  if (u.cargoRito === undefined || u.degree === undefined) {
    const db = await prisma.user.findUnique({
      where: { id: user.id },
      select: { cargoRito: true, degree: true },
    });
    u = { ...user, cargoRito: db?.cargoRito ?? null, degree: db?.degree ?? user.degree };
  }
  return montarPendencias(u, await coletarDados(u));
}

// ───────────── Fila da Loja (visão do Venerável) ─────────────

export type ItemFila = {
  chave: string;
  tipo: TipoPendencia;
  titulo: string;
  // cargo (e nome, quando resolvido) com quem o item está parado
  paradoCom: string;
  desde: Date;
  dias: number;
  link: string;
};

export type ResumoFila = {
  itens: ItemFila[];
  // gargalos: itens parados por cargo, do maior para o menor
  gargalos: { cargo: string; itens: number; maisAntigoDias: number }[];
  paradosMais7Dias: number;
};

export async function resumoFilaDaLoja(lodgeId: string, agora = new Date()): Promise<ResumoFila> {
  const [dados, ocupantes] = await Promise.all([
    coletarDados({ id: "", lodgeId, role: "VENERAVEL_MESTRE" }),
    prisma.user.findMany({
      where: {
        lodgeId,
        status: "ATIVO",
        OR: [
          { currentRole: { in: ["VENERAVEL_MESTRE", "SECRETARIO", "TESOUREIRO"] } },
          { cargoRito: { not: null } },
        ],
      },
      select: { name: true, currentRole: true, cargoRito: true },
    }),
  ]);
  const nome = (cargo: string) => {
    const u =
      cargo === "ORADOR"
        ? ocupantes.find((o) => cargoCorresponde(o.cargoRito, "Orador"))
        : cargo === "VIGILANTE_1"
          ? ocupantes.find((o) => cargoCorresponde(o.cargoRito, "1º Vigilante"))
          : cargo === "VIGILANTE_2"
            ? ocupantes.find((o) => cargoCorresponde(o.cargoRito, "2º Vigilante"))
            : ocupantes.find((o) => o.currentRole === cargo);
    const label = cargoLabel(cargo);
    return u ? `${label} (${u.name.split(" ")[0]})` : `${label} (cargo vago)`;
  };

  const itens: ItemFila[] = [];
  const add = (
    i: Omit<ItemFila, "dias"> & { desde: Date | null }
  ) => {
    const desde = i.desde ?? agora;
    itens.push({ ...i, desde, dias: diasDesde(desde, agora) });
  };

  for (const a of dados.atestados) {
    const proximo = proximoCargoAtestado(a);
    if (!proximo) continue;
    add({
      chave: `atestado-${a.id}`,
      tipo: "atestado",
      titulo: `Atestado de ${a.user.name}`,
      paradoCom: nome(proximo),
      desde: ultimaData(a.signedByTesAt, a.signedBySecAt) ?? a.solicitadoAt,
      link: linkProcessos(`atestado-${a.id}`),
    });
  }
  for (const q of dados.quittes) {
    const paradoCom = !q.cartaNome
      ? `Irmão ${q.user.name.split(" ")[0]} (carta)`
      : !q.quitacaoFinanceira
        ? nome("TESOUREIRO")
        : !q.dataSessaoComunicacao || !q.ataNome || !q.formularioNome
          ? nome("SECRETARIO")
          : nome(proximoCargoQuitte(q) ?? "VENERAVEL_MESTRE");
    add({
      chave: `quitte-${q.id}`,
      tipo: "quitte",
      titulo: `Quitte Placet de ${q.user.name}`,
      paradoCom,
      desde:
        ultimaData(q.signedBySecAt, q.signedByOradorAt, q.dataSessaoComunicacao) ??
        q.dataSolicitacao,
      link: linkProcessos(`quitte-${q.id}`),
    });
  }
  for (const p of dados.processos) {
    const ordenados = [...p.assinantes].sort((a, b) => a.ordem - b.ordem);
    const proximo = ordenados.find((a) => !a.signedAt);
    if (!proximo) continue;
    add({
      chave: `processo-${p.id}`,
      tipo: "processo",
      titulo: p.titulo,
      paradoCom: nome(proximo.cargo),
      desde: ultimaData(...ordenados.map((a) => a.signedAt)) ?? p.createdAt,
      link: linkProcessos(`processo-${p.id}`),
    });
  }
  for (const p of dados.afastamentos) {
    const paradoCom =
      p.status === "AGUARDANDO_OBREIRO"
        ? `Irmão ${p.user.name.split(" ")[0]} (gov.br)`
        : p.status === "SOLICITADO" || p.status === "ASSINADO"
          ? nome("SECRETARIO")
          : !p.signedBySecAt
            ? nome("SECRETARIO")
            : nome("VENERAVEL_MESTRE");
    add({
      chave: `afastamento-${p.id}`,
      tipo: "afastamento",
      titulo: `Afastamento de ${p.user.name}`,
      paradoCom,
      desde:
        ultimaData(p.signedByMasterAt, p.signedBySecAt, p.dataSessao, p.requerimentoSignedAt) ??
        p.createdAt,
      link: linkProcessos(`afastamento-${p.id}`),
    });
  }
  for (const a of dados.atas) {
    if (a.status !== "AGUARDANDO_ASSINATURAS") continue;
    const vezVm = a.govbrSolicitado ? !a.govbrMasterAt : !a.signedByMasterId;
    add({
      chave: `ata-${a.id}`,
      tipo: "ata",
      titulo: `Ata nº ${a.number}`,
      paradoCom: nome(vezVm ? "VENERAVEL_MESTRE" : "SECRETARIO"),
      desde: a.updatedAt,
      link: `/secretaria/atas/${a.id}`,
    });
  }
  for (const d of dados.despesas) {
    add({
      chave: `despesa-${d.id}`,
      tipo: "despesa",
      titulo: `Despesa: ${d.description}`,
      paradoCom: !d.approvedByMasterId ? nome("VENERAVEL_MESTRE") : nome("TESOUREIRO"),
      desde: d.createdAt,
      link: `/tesouraria/despesas#despesa-${d.id}`,
    });
  }

  itens.sort((a, b) => b.dias - a.dias);
  const porCargo = new Map<string, { itens: number; maisAntigoDias: number }>();
  for (const i of itens) {
    const g = porCargo.get(i.paradoCom) ?? { itens: 0, maisAntigoDias: 0 };
    g.itens += 1;
    g.maisAntigoDias = Math.max(g.maisAntigoDias, i.dias);
    porCargo.set(i.paradoCom, g);
  }
  const gargalos = [...porCargo.entries()]
    .map(([cargo, g]) => ({ cargo, ...g }))
    .sort((a, b) => b.itens - a.itens || b.maisAntigoDias - a.maisAntigoDias);
  return {
    itens,
    gargalos,
    paradosMais7Dias: itens.filter((i) => i.dias > 7).length,
  };
}
