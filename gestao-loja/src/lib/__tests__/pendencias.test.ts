import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

vi.mock("@/lib/prisma", () => ({ prisma: {} }));

import {
  montarPendencias,
  haQuantoTempo,
  type DadosPendencias,
  type TipoPendencia,
  type UsuarioPendencias,
} from "@/lib/pendencias";

const agora = new Date("2026-09-04T15:00:00Z");
const ontem = new Date("2026-09-03T12:00:00Z");
const amanha = new Date("2026-09-05T20:00:00Z");
const depois = new Date("2026-09-12T20:00:00Z");

// Loja com um item de CADA fonte, todos na vez de alguém
function dados(): DadosPendencias {
  return {
    atestados: [
      {
        id: "at1",
        userId: "obreiro",
        solicitadoAt: ontem,
        signedByTesAt: null,
        signedBySecAt: null,
        signedByMasterAt: null,
        user: { name: "João Silva" },
      },
    ],
    quittes: [
      {
        id: "qp1",
        userId: "obreiro",
        status: "EM_ANALISE",
        dataSolicitacao: ontem,
        quitacaoFinanceira: true,
        cartaNome: "carta.pdf",
        dataSessaoComunicacao: ontem,
        ataNome: "ata.pdf",
        formularioNome: "form122.pdf",
        signedBySecAt: ontem,
        signedByOradorAt: null,
        signedByMasterAt: null,
        user: { name: "João Silva" },
      },
    ],
    processos: [
      {
        id: "pd1",
        titulo: "Prancha nº 3/2026",
        createdAt: ontem,
        assinantes: [
          { ordem: 1, cargo: "VIGILANTE_1", signedAt: null },
          { ordem: 2, cargo: "VENERAVEL_MESTRE", signedAt: null },
        ],
      },
    ],
    afastamentos: [
      {
        id: "af1",
        userId: "obreiro",
        status: "SOLICITADO",
        createdAt: ontem,
        requerimentoSignedAt: ontem,
        dataSessao: null,
        signedBySecAt: null,
        signedByMasterAt: null,
        enviadoAt: null,
        user: { name: "João Silva" },
      },
    ],
    atas: [
      {
        id: "ata1",
        number: 12,
        status: "AGUARDANDO_ASSINATURAS",
        updatedAt: ontem,
        govbrSolicitado: false,
        signedByMasterId: null,
        signedBySecId: null,
        govbrMasterAt: null,
        govbrSecAt: null,
        session: { date: ontem },
      },
      {
        id: "ata2",
        number: 13,
        status: "EM_VALIDACAO",
        updatedAt: ontem,
        govbrSolicitado: false,
        signedByMasterId: null,
        signedBySecId: null,
        govbrMasterAt: null,
        govbrSecAt: null,
        session: { date: ontem },
      },
    ],
    despesas: [
      {
        id: "d1",
        description: "Aluguel do templo",
        amountCents: 120000,
        createdAt: ontem,
        approvedByMasterId: null,
        approvedByTreasurerId: null,
      },
    ],
    capitacoes: [
      {
        id: "inv1",
        description: "Capitação 08/2026",
        amountCents: 15000,
        dueDate: new Date("2026-08-10T02:59:59Z"),
        status: "PENDENTE",
      },
      {
        id: "inv2",
        description: "Capitação 09/2026",
        amountCents: 15000,
        dueDate: new Date("2026-09-30T02:59:59Z"),
        status: "PENDENTE",
      },
    ],
    sessoes: [
      {
        id: "s1",
        date: amanha,
        degree: "APRENDIZ",
        type: "ORDINARIA",
        inviteToken: "tok1",
        createdAt: ontem,
        respondeu: false,
      },
      {
        id: "s2",
        date: depois,
        degree: "MESTRE",
        type: "ORDINARIA",
        inviteToken: "tok2",
        createdAt: ontem,
        respondeu: false,
      },
    ],
    notificacoes: [
      {
        id: "n1",
        userId: null,
        sourceKey: "lgpd-exclusao:obreiro",
        title: "Pedido de exclusão de dados (LGPD)",
        description: "João Silva pediu a exclusão",
        link: "/secretaria/membros/obreiro",
        createdAt: ontem,
      },
      {
        id: "n2",
        userId: "esmoler",
        sourceKey: "esmoler-fin:esmoler:obreiro",
        title: "João Silva passou a Irregular",
        description: "3 capitações vencidas",
        link: "/secretaria/membros/obreiro",
        createdAt: ontem,
      },
    ],
    candidatos: [
      {
        id: "c1",
        nomeCandidato: "Pedro Profano",
        status: "AGUARDANDO_PLACET",
        dataEscrutinio: null,
        aprovado: true,
        updatedAt: ontem,
      },
    ],
    fechamentos: [
      {
        id: "f1",
        ano: 2026,
        mes: 7,
        fechadoAt: ontem,
        cienciaConselhoAt: null,
        reabertoAt: null,
      },
    ],
  };
}

const u = (
  role: string,
  extra: Partial<UsuarioPendencias> = {}
): UsuarioPendencias => ({
  id: extra.id ?? `u-${role}`,
  lodgeId: "l1",
  role,
  degree: "MESTRE",
  ...extra,
});

const tipos = (ps: { tipo: TipoPendencia }[]) => ps.map((p) => p.tipo);

describe("pendências — cada tipo gera link direto (nunca genérico)", () => {
  const GENERICOS = ["/secretaria/processos", "/dashboard", "/dashboard/notificacoes", "/secretaria/atas", "/tesouraria/despesas", "/tesouraria/mensalidades"];

  it("todos os 12 tipos aparecem em algum perfil e apontam para o item", () => {
    const todos = [
      ...montarPendencias(u("VENERAVEL_MESTRE"), dados(), agora),
      ...montarPendencias(u("SECRETARIO"), dados(), agora),
      ...montarPendencias(u("TESOUREIRO"), dados(), agora),
      ...montarPendencias(u("MEMBER", { id: "obreiro", cargoRito: "1º Vigilante", degree: "APRENDIZ" }), dados(), agora),
      ...montarPendencias(u("ESMOLER", { id: "esmoler" }), dados(), agora),
      ...montarPendencias(u("MEMBER", { cargoRito: "Orador" }), dados(), agora),
      ...montarPendencias(u("CONSELHO_CONTAS"), dados(), agora),
    ];
    const vistos = new Set(tipos(todos));
    for (const t of [
      "atestado", "quitte", "processo", "afastamento", "ata", "despesa",
      "capitacao", "convite", "lgpd", "esmoler", "candidato", "fechamento",
    ] satisfies TipoPendencia[]) {
      expect(vistos, `tipo ${t} não gerado`).toContain(t);
    }
    for (const p of todos) {
      expect(p.link.startsWith("/")).toBe(true);
      expect(GENERICOS, `${p.chave} usa link genérico ${p.link}`).not.toContain(p.link);
      expect(p.chave).toMatch(/^[a-z]+-/);
      expect(p.titulo.length).toBeGreaterThan(3);
      expect(p.desde).toBeInstanceOf(Date);
    }
  });

  it("links seguem o padrão de destaque dos Processos e das rotas do app", () => {
    const sec = montarPendencias(u("SECRETARIO"), dados(), agora);
    const link = (tipo: TipoPendencia) => sec.find((p) => p.tipo === tipo)?.link;
    expect(link("afastamento")).toMatch(/^\/secretaria\/processos\?destaque=afastamento-af1/);
    // ata1 ainda espera o VM; a ata em validação (ata2) é a do Secretário
    expect(link("ata")).toBe("/secretaria/atas/ata2");
    expect(
      montarPendencias(u("VENERAVEL_MESTRE"), dados(), agora).find((p) => p.chave === "ata-ata1")?.link
    ).toBe("/secretaria/atas/ata1");
    expect(
      montarPendencias(u("MEMBER", { cargoRito: "Orador" }), dados(), agora).find((p) => p.tipo === "quitte")?.link
    ).toMatch(/^\/secretaria\/processos\?destaque=quitte-qp1/);
    expect(link("lgpd")).toBe("/secretaria/membros/obreiro");
    expect(link("candidato")).toMatch(/^\/secretaria\/admissoes#candidato-c1/);

    const tes = montarPendencias(u("TESOUREIRO"), dados(), agora);
    expect(tes.find((p) => p.tipo === "atestado")?.link).toMatch(
      /^\/secretaria\/processos\?destaque=atestado-at1/
    );
    expect(tes.find((p) => p.tipo === "despesa")?.link).toBe("/tesouraria/despesas#despesa-d1");

    const obreiro = montarPendencias(
      u("MEMBER", { id: "obreiro", cargoRito: "1º Vigilante", degree: "APRENDIZ" }),
      dados(),
      agora
    );
    expect(obreiro.find((p) => p.tipo === "capitacao")?.link).toBe("/tesouraria/mensalidades/inv1");
    expect(obreiro.find((p) => p.tipo === "convite")?.link).toBe("/convite/tok1");
    expect(obreiro.find((p) => p.tipo === "processo")?.link).toMatch(
      /^\/secretaria\/processos\?destaque=processo-pd1/
    );
  });
});

describe("pendências — só o que está na vez do cargo", () => {
  it("atestado: Tesoureiro primeiro; Secretário e VM ainda não", () => {
    expect(tipos(montarPendencias(u("TESOUREIRO"), dados(), agora))).toContain("atestado");
    expect(tipos(montarPendencias(u("SECRETARIO"), dados(), agora))).not.toContain("atestado");
    expect(tipos(montarPendencias(u("VENERAVEL_MESTRE"), dados(), agora))).not.toContain("atestado");
  });

  it("Quitte: com o Secretário assinado, é a vez do Orador (cargo do rito), não do VM", () => {
    const orador = montarPendencias(u("MEMBER", { cargoRito: "Orador" }), dados(), agora);
    const q = orador.find((p) => p.tipo === "quitte");
    expect(q?.acao).toBe("assinar");
    expect(q?.contexto).toMatch(/Orador/);
    expect(tipos(montarPendencias(u("VENERAVEL_MESTRE"), dados(), agora))).not.toContain("quitte");
    expect(tipos(montarPendencias(u("MEMBER"), dados(), agora))).not.toContain("quitte");
  });

  it("Quitte sem Nada Consta cai para a Tesouraria como registro", () => {
    const d = dados();
    d.quittes[0].quitacaoFinanceira = false;
    const tes = montarPendencias(u("TESOUREIRO"), d, agora).find((p) => p.tipo === "quitte");
    expect(tes?.acao).toBe("registrar");
    expect(tipos(montarPendencias(u("MEMBER", { cargoRito: "Orador" }), d, agora))).not.toContain("quitte");
  });

  it("processo genérico: 1º Vigilante pelo cargoRito; obreiro sem cargo não vê", () => {
    expect(
      tipos(montarPendencias(u("MEMBER", { cargoRito: "Primeiro Vigilante" }), dados(), agora))
    ).toContain("processo");
    expect(tipos(montarPendencias(u("MEMBER"), dados(), agora))).not.toContain("processo");
    expect(tipos(montarPendencias(u("VENERAVEL_MESTRE"), dados(), agora))).not.toContain("processo");
  });

  it("afastamento: obreiro assina o requerimento; Secretário registra; depois Sec → VM assinam", () => {
    const d = dados();
    d.afastamentos[0].status = "AGUARDANDO_OBREIRO";
    const eu = montarPendencias(u("MEMBER", { id: "obreiro" }), d, agora).find((p) => p.tipo === "afastamento");
    expect(eu?.acao).toBe("assinar");
    expect(eu?.link).toBe("/solicitacoes/afastamento");
    expect(tipos(montarPendencias(u("SECRETARIO"), d, agora))).not.toContain("afastamento");

    d.afastamentos[0].status = "SOLICITADO";
    expect(montarPendencias(u("SECRETARIO"), d, agora).find((p) => p.tipo === "afastamento")?.acao).toBe("registrar");

    d.afastamentos[0].status = "EM_ASSINATURA";
    expect(montarPendencias(u("SECRETARIO"), d, agora).find((p) => p.tipo === "afastamento")?.acao).toBe("assinar");
    expect(tipos(montarPendencias(u("VENERAVEL_MESTRE"), d, agora))).not.toContain("afastamento");
    d.afastamentos[0].signedBySecAt = ontem;
    expect(tipos(montarPendencias(u("VENERAVEL_MESTRE"), d, agora))).toContain("afastamento");
    expect(tipos(montarPendencias(u("SECRETARIO"), d, agora))).not.toContain("afastamento");
  });

  it("ata: VM assina antes do Secretário; em validação todos respondem", () => {
    const vm = montarPendencias(u("VENERAVEL_MESTRE"), dados(), agora).filter((p) => p.tipo === "ata");
    expect(vm.map((p) => p.chave)).toEqual(expect.arrayContaining(["ata-ata1", "ata-ata2"]));
    expect(vm.find((p) => p.chave === "ata-ata1")?.acao).toBe("assinar");
    const sec = montarPendencias(u("SECRETARIO"), dados(), agora).filter((p) => p.tipo === "ata");
    expect(sec.find((p) => p.chave === "ata-ata1")).toBeUndefined();
    const obreiro = montarPendencias(u("MEMBER"), dados(), agora).filter((p) => p.tipo === "ata");
    expect(obreiro.map((p) => p.chave)).toEqual(["ata-ata2"]);
    expect(obreiro[0].acao).toBe("responder");
  });

  it("despesa: VM e Tesoureiro aprovam uma vez cada", () => {
    const d = dados();
    d.despesas[0].approvedByMasterId = "vm";
    expect(tipos(montarPendencias(u("VENERAVEL_MESTRE"), d, agora))).not.toContain("despesa");
    expect(tipos(montarPendencias(u("TESOUREIRO"), d, agora))).toContain("despesa");
    expect(tipos(montarPendencias(u("MEMBER"), d, agora))).not.toContain("despesa");
  });

  it("capitações: só as vencidas no fuso de São Paulo (a do mês corrente não)", () => {
    const eu = montarPendencias(u("MEMBER"), dados(), agora).filter((p) => p.tipo === "capitacao");
    expect(eu.map((p) => p.chave)).toEqual(["capitacao-inv1"]);
    expect(eu[0].acao).toBe("pagar");
  });

  it("convites: só as 2 próximas sessões do meu grau sem resposta", () => {
    const aprendiz = montarPendencias(u("MEMBER", { degree: "APRENDIZ" }), dados(), agora).filter(
      (p) => p.tipo === "convite"
    );
    expect(aprendiz.map((p) => p.chave)).toEqual(["convite-s1"]);
    const mestre = montarPendencias(u("MEMBER"), dados(), agora).filter((p) => p.tipo === "convite");
    expect(mestre.map((p) => p.chave)).toEqual(["convite-s1", "convite-s2"]);
    const d = dados();
    d.sessoes[0].respondeu = true;
    expect(
      montarPendencias(u("MEMBER"), d, agora).filter((p) => p.tipo === "convite").map((p) => p.chave)
    ).toEqual(["convite-s2"]);
  });

  it("LGPD só para quem escreve na Secretaria; alertas do Esmoler só ao destinatário", () => {
    expect(tipos(montarPendencias(u("SECRETARIO"), dados(), agora))).toContain("lgpd");
    expect(tipos(montarPendencias(u("TESOUREIRO"), dados(), agora))).not.toContain("lgpd");
    expect(tipos(montarPendencias(u("ESMOLER", { id: "esmoler" }), dados(), agora))).toContain("esmoler");
    expect(tipos(montarPendencias(u("ESMOLER", { id: "outro" }), dados(), agora))).not.toContain("esmoler");
    expect(tipos(montarPendencias(u("MEMBER"), dados(), agora))).not.toContain("lgpd");
  });

  it("ordena por prioridade (assinaturas antes) e pelo mais antigo", () => {
    const vm = montarPendencias(u("VENERAVEL_MESTRE"), dados(), agora);
    for (let i = 1; i < vm.length; i++) {
      expect(vm[i - 1].prioridade).toBeLessThanOrEqual(vm[i].prioridade);
    }
    expect(vm[0].acao).toMatch(/assinar|aprovar/);
  });

  it("haQuantoTempo em português", () => {
    expect(haQuantoTempo(agora, agora)).toBe("hoje");
    expect(haQuantoTempo(ontem, agora)).toBe("há 1 dia");
    expect(haQuantoTempo(new Date("2026-08-25T00:00:00Z"), agora)).toBe("há 10 dias");
  });
});

describe("pendências — isolamento por loja (estático)", () => {
  it("toda query de coleta filtra por lodgeId e os links nunca são genéricos", () => {
    const src = readFileSync(path.resolve(__dirname, "../pendencias.ts"), "utf8");
    const finds = src.match(/prisma\.\w+\.findMany\(\{\s*where:\s*\{\s*lodgeId/g) ?? [];
    expect(finds.length).toBeGreaterThanOrEqual(10);
    // nenhum findMany sem lodgeId na cláusula where
    const todos = src.match(/prisma\.\w+\.findMany\(/g) ?? [];
    expect(todos.length).toBe(finds.length);
    // links: só via linkProcessos (destaque) ou rota com id
    expect(src).not.toMatch(/link:\s*"\/secretaria\/processos"/);
  });
});

describe("fechamento mensal do balancete", () => {
  it("Conselho vê a ciência pendente; ciência registrada ou mês reaberto somem", () => {
    const c = montarPendencias(u("CONSELHO_CONTAS"), dados(), agora);
    const f = c.find((p) => p.tipo === "fechamento");
    expect(f?.chave).toBe("ciencia-f1");
    expect(f?.acao).toBe("registrar");
    expect(f?.link).toBe("/tesouraria/balancete?mes=7&ano=2026#fechamento");

    const d = dados();
    d.fechamentos[0].cienciaConselhoAt = agora;
    expect(montarPendencias(u("CONSELHO_CONTAS"), d, agora).some((p) => p.tipo === "fechamento")).toBe(false);
    const r = dados();
    r.fechamentos[0].reabertoAt = agora;
    expect(montarPendencias(u("CONSELHO_CONTAS"), r, agora).some((p) => p.tipo === "fechamento")).toBe(false);
    // ninguém mais recebe a ciência
    expect(montarPendencias(u("TESOUREIRO"), dados(), agora).some((p) => p.chave === "ciencia-f1")).toBe(false);
    expect(montarPendencias(u("VENERAVEL_MESTRE"), dados(), agora).some((p) => p.chave === "ciencia-f1")).toBe(false);
  });

  it("Tesoureiro: mês anterior aberto só vira pendência depois do dia 10", () => {
    // 04/09: Agosto aberto, mas ainda dentro do prazo
    expect(montarPendencias(u("TESOUREIRO"), dados(), agora).some((p) => p.tipo === "fechamento")).toBe(false);
    const dia11 = new Date("2026-09-11T15:00:00Z");
    const t = montarPendencias(u("TESOUREIRO"), dados(), dia11).find((p) => p.tipo === "fechamento");
    expect(t?.chave).toBe("fechamento-2026-08");
    expect(t?.link).toBe("/tesouraria/balancete?mes=8&ano=2026#fechamento");
    // Agosto fechado: nada pendente
    const d = dados();
    d.fechamentos.push({ id: "f2", ano: 2026, mes: 8, fechadoAt: ontem, cienciaConselhoAt: null, reabertoAt: null });
    expect(montarPendencias(u("TESOUREIRO"), d, dia11).some((p) => p.tipo === "fechamento")).toBe(false);
    // Agosto reaberto: volta a pendência
    d.fechamentos[1].reabertoAt = agora;
    expect(montarPendencias(u("TESOUREIRO"), d, dia11).some((p) => p.chave === "fechamento-2026-08")).toBe(true);
    // VM não recebe esta pendência
    expect(montarPendencias(u("VENERAVEL_MESTRE"), dados(), dia11).some((p) => p.tipo === "fechamento")).toBe(false);
  });
});
