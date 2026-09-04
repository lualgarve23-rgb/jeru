import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/google-drive", () => ({ arquivarVersaoFinalNoDrive: vi.fn(), slugNome: (s: string) => s }));
vi.mock("@/lib/ata-pdf", () => ({ gerarAtaPdf: vi.fn() }));
vi.mock("@/lib/media", () => ({ resolveParaDataUri: vi.fn() }));

import { temPendenciaFinanceira, bloqueioAssinaturaQuitte } from "@/lib/quitte";
import { bloqueioFinanceiroAtestado } from "@/lib/atestado";

// "Hoje" = 15/03/2026 meio-dia em São Paulo
const HOJE = new Date("2026-03-15T15:00:00.000Z");
const venceuOntem = new Date("2026-03-15T02:59:59.000Z"); // 23:59:59 SP de 14/03
const venceHoje = new Date("2026-03-16T02:59:59.000Z"); // 23:59:59 SP de 15/03
const venceDepois = new Date("2026-04-11T02:59:59.000Z");

describe("Nada Consta do Quitte Placet — temPendenciaFinanceira", () => {
  it("PENDENTE dentro do prazo (inclusive vencendo hoje) não bloqueia", () => {
    expect(temPendenciaFinanceira([{ status: "PENDENTE", dueDate: venceHoje }], HOJE)).toBe(false);
    expect(temPendenciaFinanceira([{ status: "PENDENTE", dueDate: venceDepois }], HOJE)).toBe(false);
    expect(temPendenciaFinanceira([], HOJE)).toBe(false);
  });

  it("PENDENTE com vencimento passado ou status VENCIDA bloqueia", () => {
    expect(temPendenciaFinanceira([{ status: "PENDENTE", dueDate: venceuOntem }], HOJE)).toBe(true);
    expect(temPendenciaFinanceira([{ status: "VENCIDA", dueDate: venceuOntem }], HOJE)).toBe(true);
    expect(
      temPendenciaFinanceira(
        [
          { status: "PENDENTE", dueDate: venceDepois },
          { status: "VENCIDA", dueDate: venceuOntem },
        ],
        HOJE
      )
    ).toBe(true);
  });

  it("PAGA e CANCELADA nunca contam", () => {
    expect(
      temPendenciaFinanceira(
        [
          { status: "PAGA", dueDate: venceuOntem },
          { status: "CANCELADA", dueDate: venceuOntem },
        ],
        HOJE
      )
    ).toBe(false);
  });
});

describe("bloqueioAssinaturaQuitte — trava financeira", () => {
  const base = {
    status: "EM_ANALISE",
    cartaNome: "carta.pdf",
    dataSessaoComunicacao: new Date(),
    ataNome: "ata.pdf",
    formularioNome: "form122.pdf",
    formularioMime: "application/pdf",
    govbrPdf: null,
  };
  it("sem quitação e sem confirmação do Tesoureiro: bloqueado", () => {
    expect(bloqueioAssinaturaQuitte({ ...base, quitacaoFinanceira: false })).toMatch(/Nada Consta/);
  });
  it("Nada Consta confirmado pelo Tesoureiro levanta a trava mesmo sem quitação", () => {
    expect(
      bloqueioAssinaturaQuitte({ ...base, quitacaoFinanceira: false, quitacaoConfirmadaAt: new Date() })
    ).toBeNull();
  });
  it("sem capitações vencidas libera sem confirmação", () => {
    expect(bloqueioAssinaturaQuitte({ ...base, quitacaoFinanceira: true })).toBeNull();
  });
});

describe("bloqueioFinanceiroAtestado — qualquer capitação vencida bloqueia", () => {
  const vencida = { id: "a", referencia: "02/2026", valorCents: 15000, dueDate: venceuOntem, vencida: true };
  const noPrazo = { id: "b", referencia: "03/2026", valorCents: 15000, dueDate: venceDepois, vencida: false };

  it("uma vencida bloqueia com a mensagem de contagem e valor", () => {
    const msg = bloqueioFinanceiroAtestado(
      { emAberto: [vencida, noPrazo], totalVencidoCents: 15000 },
      { overrideAt: null }
    );
    expect(msg).toContain("Há 1 capitação vencida");
    expect(msg).toContain("150,00");
    expect(msg).toContain("override");
  });

  it("plural com várias vencidas", () => {
    const msg = bloqueioFinanceiroAtestado(
      { emAberto: [vencida, { ...vencida, id: "c" }], totalVencidoCents: 30000 },
      { overrideAt: null }
    );
    expect(msg).toContain("Há 2 capitações vencidas");
  });

  it("só pendente no prazo não bloqueia; override do Tesoureiro libera", () => {
    expect(bloqueioFinanceiroAtestado({ emAberto: [noPrazo], totalVencidoCents: 0 }, { overrideAt: null })).toBeNull();
    expect(
      bloqueioFinanceiroAtestado({ emAberto: [vencida], totalVencidoCents: 15000 }, { overrideAt: new Date() })
    ).toBeNull();
  });
});
