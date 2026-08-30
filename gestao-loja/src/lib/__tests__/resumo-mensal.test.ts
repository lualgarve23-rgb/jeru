import { describe, it, expect } from "vitest";
import { mesAnterior, htmlResumoMensal, type ResumoMensal } from "@/lib/resumo-mensal";

const resumo: ResumoMensal = {
  capitacoes: { emitidas: 30, pagas: 25, recebidoCents: 250000, emAberto: 5, emAbertoCents: 50000 },
  frequencia: { sessoes: 4, presencas: 96, mediaPorSessao: 24, visitantes: 6, justificadas: 8 },
  processos: { criados: 3, assinados: 2, emAssinatura: 1 },
  assistente: { perguntas: 42, usuarios: 12 },
};

describe("mesAnterior", () => {
  it("devolve o mês fechado, inclusive na virada de ano", () => {
    expect(mesAnterior(new Date(2026, 8, 1))).toEqual({ ano: 2026, mes: 8 });
    expect(mesAnterior(new Date(2026, 0, 1))).toEqual({ ano: 2025, mes: 12 });
  });
});

describe("htmlResumoMensal", () => {
  it("traz as quatro seções com os números e valores em reais", () => {
    const html = htmlResumoMensal("ARLS Acácia nº 9999", 2026, 8, resumo);
    expect(html).toContain("agosto de 2026");
    expect(html).toContain("Capitações do mês");
    expect(html).toContain("Frequência");
    expect(html).toContain("Processos (caixa de assinaturas)");
    expect(html).toContain("Assistente IA");
    expect(html).toContain("2.500,00");
    expect(html).toContain("média de 24 por sessão");
    expect(html).toContain("<strong>42</strong>");
  });
});
