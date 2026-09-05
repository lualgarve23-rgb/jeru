// Balancete da Loja para TODO o quadro (decisão do VM, 05/09/2026): a mesma
// base do livro-caixa da Tesouraria, mas só leitura e sem expor irmão algum.
//
// Regras de privacidade (aplicadas em filtrarParaQuadro, função pura):
// - baixas de capitação (Transaction com invoiceId, ou categoria de
//   capitação/mensalidade) NÃO aparecem linha a linha — a descrição da
//   cobrança traz nome e mês do irmão. Viram a linha única `capitacoes`
//   (quantidade + total).
// - beneficência (benemerência, auxílio, esmola…) só entra como total da
//   categoria, nunca como lançamento individual (a descrição pode citar quem
//   foi auxiliado).

import { prisma } from "@/lib/prisma";
import { intervaloMesSaoPaulo, partesSaoPaulo } from "@/lib/datas-sp";

export type TransacaoQuadro = {
  type: "RECEITA" | "DESPESA";
  description: string;
  category: string | null;
  amountCents: number;
  date: Date;
  invoiceId: string | null;
  donationId?: string | null;
};

export type CategoriaQuadro = { nome: string; tipo: string };

export type LinhaCategoria = { nome: string; tipo: "RECEITA" | "DESPESA"; totalCents: number };
export type LancamentoQuadro = {
  data: Date;
  descricao: string;
  categoria: string;
  tipo: "RECEITA" | "DESPESA";
  valorCents: number;
};

export type ResumoQuadro = {
  receitasCents: number;
  despesasCents: number;
  saldoCents: number;
  porCategoria: LinhaCategoria[];
  lancamentos: LancamentoQuadro[];
  capitacoes: { quantidade: number; totalCents: number };
};

export type MesQuadro = { mes: number; ano: number; receitasCents: number; despesasCents: number };

export type BalanceteQuadro = ResumoQuadro & { ultimos12: MesQuadro[] };

export const SEM_CATEGORIA = "Sem categoria";

function normaliza(s: string | null | undefined): string {
  return (s ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

// Categoria de capitação/mensalidade — mesma tag que settleInvoice grava
// ("Capitação"); cobre variações digitadas pela Tesouraria.
export function ehCategoriaCapitacao(nome: string | null | undefined): boolean {
  const n = normaliza(nome);
  return n.includes("capita") || n.includes("mensalidade");
}

export function ehCapitacao(t: Pick<TransacaoQuadro, "invoiceId" | "category">): boolean {
  return t.invoiceId != null || ehCategoriaCapitacao(t.category);
}

// Beneficência: só o total da categoria vai ao quadro
export function ehCategoriaBeneficencia(nome: string | null | undefined): boolean {
  const n = normaliza(nome);
  return (
    n.includes("benemer") ||
    n.includes("benefic") ||
    n.includes("auxilio") ||
    n.includes("esmol")
  );
}

// Função pura: recebe as transações do mês e as categorias cadastradas da
// loja e devolve o que o quadro pode ver. `categorias` serve para
// reconhecer, pelo cadastro, tags de beneficência/capitação mesmo quando
// a transação foi gravada com grafia diferente (comparação normalizada).
export function filtrarParaQuadro(
  transactions: TransacaoQuadro[],
  categorias: CategoriaQuadro[] = []
): ResumoQuadro {
  const cadastro = new Map(categorias.map((c) => [normaliza(c.nome), c.nome]));
  const nomeCategoria = (t: TransacaoQuadro) =>
    cadastro.get(normaliza(t.category)) ?? t.category ?? SEM_CATEGORIA;

  let receitasCents = 0;
  let despesasCents = 0;
  const porCategoria = new Map<string, LinhaCategoria>();
  const lancamentos: LancamentoQuadro[] = [];
  const capitacoes = { quantidade: 0, totalCents: 0 };

  for (const t of transactions) {
    if (t.type === "RECEITA") receitasCents += t.amountCents;
    else despesasCents += t.amountCents;

    const capitacao = ehCapitacao(t);
    // Doações (Bolsa de Benemerência etc.): só o total, nunca o doador
    const doacao = !capitacao && t.donationId != null;
    const nome = capitacao ? "Capitações" : doacao ? "Doações" : nomeCategoria(t);
    const key = `${t.type}:${nome}`;
    const linha = porCategoria.get(key) ?? { nome, tipo: t.type, totalCents: 0 };
    linha.totalCents += t.amountCents;
    porCategoria.set(key, linha);

    if (capitacao) {
      capitacoes.quantidade += 1;
      capitacoes.totalCents += t.amountCents;
      continue;
    }
    if (doacao || ehCategoriaBeneficencia(nome)) continue;
    lancamentos.push({
      data: t.date,
      descricao: t.description,
      categoria: nome,
      tipo: t.type,
      valorCents: t.amountCents,
    });
  }

  return {
    receitasCents,
    despesasCents,
    saldoCents: receitasCents - despesasCents,
    porCategoria: [...porCategoria.values()].sort(
      (a, b) => a.tipo.localeCompare(b.tipo) || b.totalCents - a.totalCents
    ),
    lancamentos: lancamentos.sort((a, b) => a.data.getTime() - b.data.getTime()),
    capitacoes,
  };
}

// Os 12 meses terminando em (ano, mes), em ordem cronológica
export function mesesAte(ano: number, mes: number, quantidade = 12): { mes: number; ano: number }[] {
  const r: { mes: number; ano: number }[] = [];
  let m = mes;
  let a = ano;
  for (let i = 0; i < quantidade; i++) {
    r.unshift({ mes: m, ano: a });
    m -= 1;
    if (m === 0) {
      m = 12;
      a -= 1;
    }
  }
  return r;
}

// Função pura: soma receitas/despesas por mês civil de São Paulo
export function agruparPorMes(
  transactions: Pick<TransacaoQuadro, "type" | "amountCents" | "date">[],
  meses: { mes: number; ano: number }[]
): MesQuadro[] {
  const mapa = new Map<string, MesQuadro>();
  for (const m of meses) {
    mapa.set(`${m.ano}-${m.mes}`, { ...m, receitasCents: 0, despesasCents: 0 });
  }
  for (const t of transactions) {
    const p = partesSaoPaulo(t.date);
    const linha = mapa.get(`${p.ano}-${p.mes}`);
    if (!linha) continue;
    if (t.type === "RECEITA") linha.receitasCents += t.amountCents;
    else linha.despesasCents += t.amountCents;
  }
  return meses.map((m) => mapa.get(`${m.ano}-${m.mes}`)!);
}

export async function balanceteDoQuadro(
  lodgeId: string,
  mes: number,
  ano: number
): Promise<BalanceteQuadro> {
  const { inicio, fim } = intervaloMesSaoPaulo(ano, mes);
  const meses = mesesAte(ano, mes);
  const inicio12 = intervaloMesSaoPaulo(meses[0].ano, meses[0].mes).inicio;

  const [transactions, categorias, historico] = await Promise.all([
    prisma.transaction.findMany({
      where: { lodgeId, date: { gte: inicio, lt: fim } },
      orderBy: { date: "asc" },
      select: {
        type: true,
        description: true,
        category: true,
        amountCents: true,
        date: true,
        invoiceId: true,
        donationId: true,
      },
    }),
    prisma.categoriaFinanceira.findMany({
      where: { lodgeId },
      select: { nome: true, tipo: true },
    }),
    prisma.transaction.findMany({
      where: { lodgeId, date: { gte: inicio12, lt: fim } },
      select: { type: true, amountCents: true, date: true },
    }),
  ]);

  return {
    ...filtrarParaQuadro(transactions, categorias),
    ultimos12: agruparPorMes(historico, meses),
  };
}
