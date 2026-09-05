import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({ prisma: {} }));

import {
  agruparPorMes,
  ehCategoriaBeneficencia,
  filtrarParaQuadro,
  mesesAte,
  type TransacaoQuadro,
} from "@/lib/balancete-quadro";

const d = (dia: number) => new Date(Date.UTC(2026, 7, dia, 15));

const tx = (
  p: Partial<TransacaoQuadro> & { amountCents: number; description: string }
): TransacaoQuadro => ({
  type: "RECEITA",
  category: null,
  date: d(10),
  invoiceId: null,
  ...p,
});

const TRANSACOES: TransacaoQuadro[] = [
  // baixas de capitação: descrição carrega o nome do irmão
  tx({ description: "Capitação 08/2026 — João da Silva", amountCents: 15000, category: "Capitação", invoiceId: "inv1", date: d(3) }),
  tx({ description: "Mensalidade agosto — Pedro Souza", amountCents: 15000, category: "Capitação", invoiceId: "inv2", date: d(5) }),
  // sem invoiceId mas com categoria de capitação (baixa antiga/manual)
  tx({ description: "Capitação atrasada — Carlos Lima", amountCents: 15000, category: "mensalidades", date: d(6) }),
  tx({ description: "Tronco de Solidariedade", amountCents: 32050, category: "Tronco", date: d(7) }),
  tx({ description: "Ágape de agosto", amountCents: 80000, category: "Eventos", date: d(20) }),
  // beneficência: descrição cita o auxiliado
  tx({ type: "DESPESA", description: "Auxílio ao Ir. Antônio — remédios", amountCents: 40000, category: "Benemerência", date: d(12) }),
  tx({ type: "DESPESA", description: "Auxílio à viúva do Ir. Pereira", amountCents: 25000, category: "Auxílio fraterno", date: d(15) }),
  tx({ type: "DESPESA", description: "Aluguel do templo", amountCents: 120000, category: "Aluguel", date: d(1) }),
  tx({ type: "DESPESA", description: "Energia elétrica", amountCents: 21000, date: d(9) }),
];

const CATEGORIAS = [
  { nome: "Capitação", tipo: "RECEITA" },
  { nome: "Tronco", tipo: "RECEITA" },
  { nome: "Eventos", tipo: "RECEITA" },
  { nome: "Benemerência", tipo: "DESPESA" },
  { nome: "Auxílio fraterno", tipo: "DESPESA" },
  { nome: "Aluguel", tipo: "DESPESA" },
];

describe("balancete do quadro — filtrarParaQuadro", () => {
  const r = filtrarParaQuadro(TRANSACOES, CATEGORIAS);
  const texto = JSON.stringify(r);

  it("nenhum nome de irmão de capitação aparece em lugar algum", () => {
    for (const nome of ["João", "Pedro", "Carlos", "Antônio", "Pereira"]) {
      expect(texto).not.toContain(nome);
    }
  });

  it("capitações viram linha única com quantidade e total", () => {
    expect(r.capitacoes).toEqual({ quantidade: 3, totalCents: 45000 });
    expect(r.lancamentos.some((l) => l.categoria === "Capitações")).toBe(false);
    const cap = r.porCategoria.find((c) => c.nome === "Capitações");
    expect(cap?.totalCents).toBe(45000);
    expect(cap?.tipo).toBe("RECEITA");
  });

  it("beneficência entra só como total por categoria", () => {
    expect(r.porCategoria.find((c) => c.nome === "Benemerência")?.totalCents).toBe(40000);
    expect(r.porCategoria.find((c) => c.nome === "Auxílio fraterno")?.totalCents).toBe(25000);
    expect(r.lancamentos.some((l) => /aux/i.test(l.categoria))).toBe(false);
    expect(r.lancamentos.some((l) => /benem/i.test(l.categoria))).toBe(false);
  });

  it("demais lançamentos aparecem com descrição, em ordem de data", () => {
    expect(r.lancamentos.map((l) => l.descricao)).toEqual([
      "Aluguel do templo",
      "Tronco de Solidariedade",
      "Energia elétrica",
      "Ágape de agosto",
    ]);
    expect(r.lancamentos.find((l) => l.descricao === "Energia elétrica")?.categoria).toBe(
      "Sem categoria"
    );
  });

  it("totais batem com o livro-caixa completo", () => {
    expect(r.receitasCents).toBe(15000 * 3 + 32050 + 80000);
    expect(r.despesasCents).toBe(40000 + 25000 + 120000 + 21000);
    expect(r.saldoCents).toBe(r.receitasCents - r.despesasCents);
    const somaCat = (tipo: string) =>
      r.porCategoria.filter((c) => c.tipo === tipo).reduce((s, c) => s + c.totalCents, 0);
    expect(somaCat("RECEITA")).toBe(r.receitasCents);
    expect(somaCat("DESPESA")).toBe(r.despesasCents);
    // lançamentos visíveis + capitações + beneficência = tudo
    const visiveis = r.lancamentos.reduce((s, l) => s + l.valorCents, 0);
    expect(visiveis + r.capitacoes.totalCents + 40000 + 25000).toBe(
      r.receitasCents + r.despesasCents
    );
  });

  it("mês vazio devolve zeros sem quebrar", () => {
    const v = filtrarParaQuadro([], CATEGORIAS);
    expect(v.receitasCents).toBe(0);
    expect(v.porCategoria).toEqual([]);
    expect(v.lancamentos).toEqual([]);
    expect(v.capitacoes).toEqual({ quantidade: 0, totalCents: 0 });
  });

  it("reconhece beneficência sem acento e em qualquer caixa", () => {
    for (const n of ["BENEMERENCIA", "Benefício fraterno", "auxilio", "Esmolas", "Esmoler"]) {
      expect(ehCategoriaBeneficencia(n)).toBe(true);
    }
    expect(ehCategoriaBeneficencia("Tronco")).toBe(false);
    expect(ehCategoriaBeneficencia(null)).toBe(false);
  });
});

describe("balancete do quadro — últimos 12 meses", () => {
  it("mesesAte devolve 12 meses cronológicos terminando no mês pedido", () => {
    const m = mesesAte(2026, 2);
    expect(m).toHaveLength(12);
    expect(m[0]).toEqual({ mes: 3, ano: 2025 });
    expect(m[11]).toEqual({ mes: 2, ano: 2026 });
  });

  it("agruparPorMes soma no mês civil de São Paulo", () => {
    const meses = mesesAte(2026, 8, 2);
    const r = agruparPorMes(
      [
        // 31/07 23:30 em São Paulo = 01/08 02:30 UTC → julho
        { type: "RECEITA", amountCents: 100, date: new Date("2026-08-01T02:30:00Z") },
        { type: "DESPESA", amountCents: 40, date: new Date("2026-08-15T12:00:00Z") },
        { type: "RECEITA", amountCents: 999, date: new Date("2025-01-01T12:00:00Z") },
      ],
      meses
    );
    expect(r).toEqual([
      { mes: 7, ano: 2026, receitasCents: 100, despesasCents: 0 },
      { mes: 8, ano: 2026, receitasCents: 0, despesasCents: 40 },
    ]);
  });
});

describe("doações", () => {
  it("doação com nome do doador na descrição vira só o total 'Doações'", () => {
    const r = filtrarParaQuadro([
      { type: "RECEITA", description: "Pix de Fulano de Tal — benemerência", category: null, amountCents: 5000, date: new Date("2026-08-10T12:00:00Z"), invoiceId: null, donationId: "d1" },
      { type: "DESPESA", description: "Água", category: "Contas", amountCents: 1000, date: new Date("2026-08-11T12:00:00Z"), invoiceId: null, donationId: null },
    ]);
    expect(JSON.stringify(r)).not.toContain("Fulano");
    expect(r.porCategoria.find((c) => c.nome === "Doações")?.totalCents).toBe(5000);
    expect(r.lancamentos).toHaveLength(1);
  });
});
