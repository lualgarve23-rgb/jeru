import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  faseRifa,
  podeGerirRifa,
  podeReservar,
  podeSortear,
  resumoRifa,
  rifaVisivelAoQuadro,
  validarCampanha,
  validarNumeros,
  RIFA_MAX_POR_RESERVA,
  RIFA_DIAS_RESULTADO,
  sortearComSemente,
  universoSorteio,
} from "../rifa";
import { instanteSaoPaulo } from "../datas-sp";

const base = {
  ativa: true,
  inicio: instanteSaoPaulo(2026, 9, 10),
  fim: instanteSaoPaulo(2026, 9, 30, 23, 59, 59),
  sorteioEm: instanteSaoPaulo(2026, 10, 5, 23, 59, 59),
  quantidadeNumeros: 100,
  valorCents: 1000,
  numeroSorteado: null as number | null,
};
const em = (a: number, m: number, d: number) => instanteSaoPaulo(a, m, d, 12);

describe("fases da campanha", () => {
  it("agendada → vendas → aguardando sorteio → sorteada / encerrada", () => {
    expect(faseRifa(base, em(2026, 9, 1))).toBe("agendada");
    expect(faseRifa(base, em(2026, 9, 10))).toBe("vendas");
    expect(faseRifa(base, em(2026, 9, 30))).toBe("vendas");
    expect(faseRifa(base, em(2026, 10, 1))).toBe("aguardando-sorteio");
    expect(faseRifa({ ...base, numeroSorteado: 7 }, em(2026, 10, 6))).toBe("sorteada");
    expect(faseRifa({ ...base, ativa: false }, em(2026, 9, 15))).toBe("encerrada");
  });

  it("irmão só reserva no período de vendas; sorteio só depois do fim das vendas", () => {
    expect(podeReservar(base, em(2026, 9, 15))).toBe(true);
    expect(podeReservar(base, em(2026, 10, 1))).toBe(false);
    expect(podeSortear(base, em(2026, 9, 15))).toBe(false);
    expect(podeSortear(base, em(2026, 10, 1))).toBe(true);
    expect(podeSortear({ ...base, numeroSorteado: 3 }, em(2026, 10, 6))).toBe(false);
  });

  it("quadro vê a rifa do início das vendas até 30 dias após o sorteio", () => {
    expect(rifaVisivelAoQuadro(base, em(2026, 9, 9))).toBe(false);
    expect(rifaVisivelAoQuadro(base, em(2026, 9, 10))).toBe(true);
    expect(rifaVisivelAoQuadro(base, em(2026, 10, 20))).toBe(true);
    expect(rifaVisivelAoQuadro(base, new Date(base.sorteioEm.getTime() + (RIFA_DIAS_RESULTADO + 1) * 86400000))).toBe(false);
    expect(rifaVisivelAoQuadro({ ...base, ativa: false }, em(2026, 9, 15))).toBe(false);
  });

  it("só VM e Esmoler gerem a rifa", () => {
    expect(podeGerirRifa("VENERAVEL_MESTRE")).toBe(true);
    expect(podeGerirRifa("ESMOLER")).toBe(true);
    for (const r of ["MEMBER", "SECRETARIO", "TESOUREIRO", "CONSELHO_CONTAS", "SUPER_ADMIN"]) {
      expect(podeGerirRifa(r)).toBe(false);
    }
  });
});

describe("validação da campanha", () => {
  const ok = { titulo: "Rifa de Natal", inicio: "2026-09-10", fim: "2026-09-30", sorteio: "2026-10-05", quantidadeNumeros: 100, valorReais: 10 };

  it("aceita dados corretos e converte para instantes de São Paulo", () => {
    const v = validarCampanha(ok);
    expect(v.ok).toBe(true);
    if (!v.ok) return;
    expect(v.dados.valorCents).toBe(1000);
    expect(v.dados.inicio.toISOString()).toBe(instanteSaoPaulo(2026, 9, 10).toISOString());
    expect(v.dados.fim.toISOString()).toBe(instanteSaoPaulo(2026, 9, 30, 23, 59, 59).toISOString());
    expect(v.dados.descricao).toBeNull();
  });

  it("rejeita datas invertidas, sorteio antes do fim, poucos números e valor baixo", () => {
    expect(validarCampanha({ ...ok, fim: "2026-09-01" })).toMatchObject({ ok: false });
    expect(validarCampanha({ ...ok, sorteio: "2026-09-20" })).toMatchObject({ ok: false });
    expect(validarCampanha({ ...ok, quantidadeNumeros: 1 })).toMatchObject({ ok: false });
    expect(validarCampanha({ ...ok, quantidadeNumeros: 999999 })).toMatchObject({ ok: false });
    expect(validarCampanha({ ...ok, valorReais: 0.5 })).toMatchObject({ ok: false });
    expect(validarCampanha({ ...ok, titulo: "ab" })).toMatchObject({ ok: false });
    expect(validarCampanha({ ...ok, inicio: "" })).toMatchObject({ ok: false });
  });

  it("sorteio no próprio último dia das vendas é permitido", () => {
    expect(validarCampanha({ ...ok, sorteio: "2026-09-30" }).ok).toBe(true);
  });
});

describe("validação dos números reservados", () => {
  it("remove repetidos, ordena e rejeita fora do intervalo ou já ocupados", () => {
    expect(validarNumeros([5, 3, 5], 10, new Set())).toEqual({ ok: true, numeros: [3, 5] });
    expect(validarNumeros([0], 10, new Set())).toMatchObject({ ok: false });
    expect(validarNumeros([11], 10, new Set())).toMatchObject({ ok: false });
    expect(validarNumeros([], 10, new Set())).toMatchObject({ ok: false });
    const r = validarNumeros([2, 4], 10, new Set([4]));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("4");
  });

  it("limita a quantidade por reserva", () => {
    const muitos = Array.from({ length: RIFA_MAX_POR_RESERVA + 1 }, (_, i) => i + 1);
    expect(validarNumeros(muitos, 1000, new Set())).toMatchObject({ ok: false });
  });
});

describe("resumo da arrecadação", () => {
  it("separa recebido, previsto e potencial", () => {
    const r = resumoRifa({ quantidadeNumeros: 100, valorCents: 1000 }, [{ pago: true }, { pago: false }, { pago: true }]);
    expect(r).toEqual({ vendidos: 3, pagos: 2, livres: 97, arrecadadoCents: 2000, previstoCents: 3000, potencialCents: 100000 });
  });
});

describe("sorteio pelo sistema", () => {
  const nums = [{ numero: 3, pago: true }, { numero: 7, pago: false }, { numero: 12, pago: true }, { numero: 20, pago: false }];

  it("universo: só pagos por padrão; todos os reservados se incluir não pagos", () => {
    expect(universoSorteio(nums, false)).toEqual([3, 12]);
    expect(universoSorteio(nums, true)).toEqual([3, 7, 12, 20]);
  });

  it("é determinístico pela semente e cai sempre dentro dos candidatos", () => {
    const semente = "0123456789abcdef0123456789abcdef";
    const a = sortearComSemente([12, 3, 7], semente);
    expect(a).toBe(sortearComSemente([3, 7, 12], semente));
    expect([3, 7, 12]).toContain(a);
    // regra documentada aos irmãos: posição = semente mod n na lista ordenada
    const idx = Number(BigInt("0x" + semente) % BigInt(3));
    expect(a).toBe([3, 7, 12][idx]);
    expect(sortearComSemente([42], semente)).toBe(42);
    expect(sortearComSemente([], semente)).toBeNull();
  });

  it("rejeita semente que não seja hex de 16 bytes", () => {
    expect(() => sortearComSemente([1, 2], "abc")).toThrow();
  });
});

describe("actions da rifa exigem sessão e restringem a gestão a VM/Esmoler", () => {
  const src = readFileSync(path.resolve(__dirname, "../../app/(app)/dashboard/rifa/actions.ts"), "utf8");
  it("gestão usa requireRole(...RIFA_GESTORES); reserva do irmão usa requireUser", () => {
    for (const fn of ["criarRifa", "atualizarRifa", "encerrarRifa", "reservarNumerosPara", "marcarPagamento", "registrarSorteio", "sortearPeloSistema", "removerFotoRifa"]) {
      const i = src.indexOf(`export async function ${fn}(`);
      expect(i, fn).toBeGreaterThan(-1);
      expect(src.slice(i, i + 400)).toContain("requireRole(...RIFA_GESTORES)");
    }
    const i = src.indexOf("export async function reservarNumeros(");
    expect(src.slice(i, i + 300)).toContain("requireUser()");
  });
});
