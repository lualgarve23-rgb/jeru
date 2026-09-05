import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

vi.mock("@/lib/prisma", () => ({ prisma: {} }));

import {
  aplicarFechamentosAoGrafico,
  carimboFechamento,
  fechamentoAtrasado,
  fechamentoDaData,
  lancamentoBloqueado,
  mesFechavel,
  mesesFechados,
  totaisDivergem,
  type FechamentoComNomes,
} from "@/lib/fechamento-mes";
import { mesesAte } from "@/lib/balancete-quadro";

// 04/09/2026 12:00 em São Paulo
const agora = new Date("2026-09-04T15:00:00Z");
const f = (ano: number, mes: number, extra: Partial<{ reabertoAt: Date | null }> = {}) => ({
  id: `${ano}-${mes}`,
  ano,
  mes,
  reabertoAt: null as Date | null,
  ...extra,
});

describe("mesFechavel — só mês já terminado (calendário de São Paulo)", () => {
  it("meses anteriores ao corrente fecham; o corrente e futuros não", () => {
    expect(mesFechavel(2026, 8, agora)).toBe(true);
    expect(mesFechavel(2025, 12, agora)).toBe(true);
    expect(mesFechavel(2026, 9, agora)).toBe(false);
    expect(mesFechavel(2026, 10, agora)).toBe(false);
    expect(mesFechavel(2027, 1, agora)).toBe(false);
  });
  it("virada de mês pelo fuso de São Paulo: 01/10 00:30 UTC ainda é 30/09 no Brasil", () => {
    const utcOutubro = new Date("2026-10-01T00:30:00Z");
    expect(mesFechavel(2026, 9, utcOutubro)).toBe(false);
    expect(mesFechavel(2026, 9, new Date("2026-10-01T03:30:00Z"))).toBe(true);
  });
  it("rejeita mês/ano inválidos", () => {
    expect(mesFechavel(2026, 0, agora)).toBe(false);
    expect(mesFechavel(2026, 13, agora)).toBe(false);
    expect(mesFechavel(NaN, 5, agora)).toBe(false);
  });
});

describe("bloqueio de lançamento em mês fechado", () => {
  const fechamentos = [f(2026, 8), f(2026, 7, { reabertoAt: agora })];
  it("data dentro de mês fechado é bloqueada; mês reaberto ou aberto não", () => {
    expect(lancamentoBloqueado(fechamentos, new Date("2026-08-15T12:00:00Z"))).toBe(true);
    expect(lancamentoBloqueado(fechamentos, new Date("2026-07-15T12:00:00Z"))).toBe(false);
    expect(lancamentoBloqueado(fechamentos, new Date("2026-09-01T12:00:00Z"))).toBe(false);
  });
  it("a fronteira do mês segue São Paulo: 01/09 02:59 UTC ainda é 31/08", () => {
    expect(fechamentoDaData(fechamentos, new Date("2026-09-01T02:59:59Z"))?.mes).toBe(8);
    expect(fechamentoDaData(fechamentos, new Date("2026-09-01T03:00:00Z"))).toBeNull();
  });
});

describe("seleção de meses do quadro", () => {
  it("só fechados e não reabertos, do mais recente ao mais antigo", () => {
    const lista = mesesFechados([f(2026, 5), f(2026, 8), f(2026, 7, { reabertoAt: agora }), f(2025, 12)]);
    expect(lista.map((x) => `${x.mes}/${x.ano}`)).toEqual(["8/2026", "5/2026", "12/2025"]);
  });
  it("gráfico: meses não fechados ficam vazios e marcados aberto", () => {
    const meses = mesesAte(2026, 9).map((m) => ({ ...m, receitasCents: 100, despesasCents: 50 }));
    const g = aplicarFechamentosAoGrafico(meses, [f(2026, 8), f(2026, 7, { reabertoAt: agora })]);
    const ago = g.find((m) => m.mes === 8)!;
    const jul = g.find((m) => m.mes === 7)!;
    const set = g.find((m) => m.mes === 9)!;
    expect(ago).toMatchObject({ aberto: false, receitasCents: 100, despesasCents: 50 });
    expect(jul).toMatchObject({ aberto: true, receitasCents: 0, despesasCents: 0 });
    expect(set.aberto).toBe(true);
    expect(g.filter((m) => !m.aberto)).toHaveLength(1);
  });
  it("divergência entre totais gravados e calculados", () => {
    expect(totaisDivergem({ receitasCents: 10, despesasCents: 5 }, { receitasCents: 10, despesasCents: 5 })).toBe(false);
    expect(totaisDivergem({ receitasCents: 10, despesasCents: 5 }, { receitasCents: 12, despesasCents: 5 })).toBe(true);
  });
});

describe("fechamentoAtrasado — pendência do Tesoureiro", () => {
  it("até o dia 10 nada; depois, o mês anterior aberto (inclusive na virada do ano)", () => {
    expect(fechamentoAtrasado([], new Date("2026-09-10T15:00:00Z"))).toBeNull();
    expect(fechamentoAtrasado([], new Date("2026-09-11T15:00:00Z"))).toEqual({ ano: 2026, mes: 8 });
    expect(fechamentoAtrasado([f(2026, 8)], new Date("2026-09-11T15:00:00Z"))).toBeNull();
    expect(fechamentoAtrasado([f(2026, 8, { reabertoAt: agora })], new Date("2026-09-11T15:00:00Z"))).toEqual({ ano: 2026, mes: 8 });
    expect(fechamentoAtrasado([], new Date("2027-01-15T15:00:00Z"))).toEqual({ ano: 2026, mes: 12 });
  });
});

describe("carimboFechamento", () => {
  const base: FechamentoComNomes = {
    id: "x",
    ano: 2026,
    mes: 8,
    fechadoAt: new Date("2026-09-02T13:00:00Z"),
    receitasCents: 0,
    despesasCents: 0,
    saldoCents: 0,
    cienciaConselhoAt: null,
    reabertoAt: null,
    fechadoPor: { name: "Carlos Tesoureiro" },
    cienciaConselhoPor: null,
    reabertoPor: null,
  };
  it("aberto, fechado sem/ com ciência e reaberto", () => {
    expect(carimboFechamento(null).status).toBe("aberto");
    const semCiencia = carimboFechamento(base);
    expect(semCiencia.status).toBe("fechado");
    expect(semCiencia.texto).toContain("Fechado por Carlos Tesoureiro em 02/09/2026");
    expect(semCiencia.texto).toContain("Aguardando ciência");
    const comCiencia = carimboFechamento({
      ...base,
      cienciaConselhoAt: new Date("2026-09-03T13:00:00Z"),
      cienciaConselhoPor: { name: "Ana Conselho" },
    });
    expect(comCiencia.texto).toContain("Ciência do Conselho por Ana Conselho em 03/09/2026");
    const reaberto = carimboFechamento({
      ...base,
      reabertoAt: new Date("2026-09-04T13:00:00Z"),
      reabertoPor: { name: "Carlos Tesoureiro" },
      motivoReabertura: "faltou o aluguel",
    });
    expect(reaberto.status).toBe("reaberto");
    expect(reaberto.texto).toContain("faltou o aluguel");
  });
});

// ── Estáticos: permissões das actions e bloqueios nos lançamentos ──

const ler = (rel: string) => readFileSync(path.resolve(__dirname, "../..", rel), "utf8");
const bloco = (src: string, nome: string) => {
  const i = src.indexOf(`export async function ${nome}(`);
  expect(i, `${nome} não encontrada`).toBeGreaterThan(-1);
  const fim = src.indexOf("\nexport async function ", i + 1);
  return src.slice(i, fim === -1 ? undefined : fim);
};

describe("permissões do fechamento (estático)", () => {
  const actions = ler("app/(app)/tesouraria/actions.ts");

  it("fecharMes e reabrirMes só para quem escreve na Tesouraria (Tesoureiro/VM)", () => {
    expect(bloco(actions, "fecharMes")).toContain("await requireTesourariaWriter()");
    expect(bloco(actions, "reabrirMes")).toContain("await requireTesourariaWriter()");
    expect(bloco(actions, "fecharMes")).toContain("mesFechavel(");
    expect(bloco(actions, "reabrirMes")).toContain("Informe o motivo da reabertura");
  });

  it("ciência só para o Conselho de Contas", () => {
    const b = bloco(actions, "registrarCienciaBalancete");
    expect(b).toContain('await requireRole("CONSELHO_CONTAS")');
    expect(b).not.toContain("requireTesourariaWriter");
  });

  it("cada etapa audita e notifica", () => {
    expect(bloco(actions, "fecharMes")).toContain('acao: "balancete.fechar"');
    expect(bloco(actions, "reabrirMes")).toContain('acao: "balancete.reabrir"');
    expect(bloco(actions, "registrarCienciaBalancete")).toContain('acao: "balancete.ciencia-conselho"');
    for (const n of ["fecharMes", "reabrirMes", "registrarCienciaBalancete"]) {
      expect(bloco(actions, n)).toContain("notificarEvento(");
      expect(bloco(actions, n)).toContain("aposEventoDaLoja(");
    }
    expect(bloco(actions, "fecharMes")).toContain('"CONSELHO_CONTAS"');
    expect(bloco(actions, "fecharMes")).toContain('"VENERAVEL_MESTRE"');
    expect(bloco(actions, "registrarCienciaBalancete")).toContain('"TESOUREIRO"');
  });

  it("lançamentos manuais bloqueados em mês fechado; baixas automáticas só mudam a data", () => {
    expect(bloco(actions, "createReceita")).toContain("fechamentoAtivoDaData(");
    expect(bloco(actions, "createReceita")).toContain("MSG_MES_FECHADO");
    expect(bloco(actions, "createExpense")).toContain("MSG_MES_FECHADO");
    expect(bloco(actions, "payExpense")).toContain("dataRespeitandoFechamento(");
    expect(bloco(actions, "payExpense")).not.toContain("MSG_MES_FECHADO");
    const settle = ler("lib/settle-invoice.ts");
    expect(settle).toContain("dataRespeitandoFechamento(");
    expect(settle).not.toContain("MSG_MES_FECHADO");
  });

  it("página da Tesouraria: ciência só no Conselho; fechar/reabrir só para writers", () => {
    const page = ler("app/(app)/tesouraria/balancete/page.tsx");
    expect(page).toMatch(/user\.role === "CONSELHO_CONTAS" && fechado && !fechamento\?\.cienciaConselhoAt/);
    expect(page).toContain("isWriter && !fechado && fechavel");
    expect(page).toContain("isWriter && fechado");
  });

  it("quadro: só meses fechados (mesesFechados) e totais gravados nos cards", () => {
    const page = ler("app/(app)/balancete/page.tsx");
    expect(page).toContain("mesesFechados(await listarFechamentos(");
    expect(page).toContain("A Tesouraria ainda não fechou nenhum mês");
    expect(page).toContain("brl(escolhido.receitasCents)");
    expect(page).toContain("aplicarFechamentosAoGrafico(");
  });
});
