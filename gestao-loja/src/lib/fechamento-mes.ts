// Fechamento mensal do balancete (etapa 2 do Balancete da Loja, aprovada
// pelo VM em 05/09/2026):
//
//   Tesoureiro/VM fecha o mês (só meses já terminados) → totais congelados
//   → Conselho de Contas registra ciência → o quadro (/balancete) consulta.
//
// Depois de fechado, lançamentos manuais com data dentro do mês são
// bloqueados; baixas automáticas (Pix/Asaas/manual de capitação, pagamento
// de despesa) nunca são bloqueadas — entram com a data de hoje e o
// Tesoureiro é avisado de que os totais do fechamento não as incluem.
// "Reabrir" mantém o registro (reabertoAt) e esconde o mês do quadro até
// novo fechamento.
//
// As regras são funções puras (testáveis sem banco); o acesso ao Prisma
// fica nas funções `buscar*`/`fechamento*` do fim do arquivo.

import { prisma } from "@/lib/prisma";
import { partesSaoPaulo } from "@/lib/datas-sp";

export type FechamentoBase = {
  id: string;
  ano: number;
  mes: number;
  fechadoAt: Date;
  receitasCents: number;
  despesasCents: number;
  saldoCents: number;
  observacao?: string | null;
  cienciaConselhoAt: Date | null;
  reabertoAt: Date | null;
};

export type FechamentoComNomes = FechamentoBase & {
  fechadoPor: { name: string };
  cienciaConselhoPor: { name: string } | null;
  reabertoPor: { name: string } | null;
  motivoReabertura?: string | null;
};

// Dia a partir do qual o mês anterior ainda aberto vira pendência do Tesoureiro
export const DIA_LIMITE_FECHAMENTO = 10;

export const MSG_MES_FECHADO = "Mês fechado — reabra na Tesouraria";

// ───────────── Regras puras ─────────────

// Só fecha mês já terminado: (ano, mes) anterior ao mês civil atual em São Paulo
export function mesFechavel(ano: number, mes: number, agora: Date = new Date()): boolean {
  if (!Number.isInteger(ano) || !Number.isInteger(mes) || mes < 1 || mes > 12) return false;
  const hoje = partesSaoPaulo(agora);
  return ano < hoje.ano || (ano === hoje.ano && mes < hoje.mes);
}

// Fechado e não reaberto
export function estaFechado(f: Pick<FechamentoBase, "reabertoAt"> | null | undefined): boolean {
  return !!f && f.reabertoAt == null;
}

// Meses consultáveis pelo quadro: fechados e não reabertos, do mais recente ao mais antigo
export function mesesFechados<T extends Pick<FechamentoBase, "ano" | "mes" | "reabertoAt">>(
  fechamentos: T[]
): T[] {
  return fechamentos
    .filter((f) => estaFechado(f))
    .sort((a, b) => b.ano - a.ano || b.mes - a.mes);
}

// O fechamento (ativo) que cobre a data informada, se houver — ou null.
// Serve tanto para bloquear lançamentos manuais quanto para avisar o
// Tesoureiro de baixas automáticas em mês já fechado.
export function fechamentoDaData<T extends Pick<FechamentoBase, "ano" | "mes" | "reabertoAt">>(
  fechamentos: T[],
  date: Date
): T | null {
  const p = partesSaoPaulo(date);
  return fechamentos.find((f) => estaFechado(f) && f.ano === p.ano && f.mes === p.mes) ?? null;
}

export function lancamentoBloqueado(
  fechamentos: Pick<FechamentoBase, "ano" | "mes" | "reabertoAt">[],
  date: Date
): boolean {
  return fechamentoDaData(fechamentos, date) != null;
}

// Mês anterior ao de `agora` (em São Paulo)
export function mesAnteriorSp(agora: Date = new Date()): { ano: number; mes: number } {
  const h = partesSaoPaulo(agora);
  return h.mes === 1 ? { ano: h.ano - 1, mes: 12 } : { ano: h.ano, mes: h.mes - 1 };
}

// Pendência do Tesoureiro: mês anterior ainda aberto depois do dia 10
export function fechamentoAtrasado(
  fechamentos: Pick<FechamentoBase, "ano" | "mes" | "reabertoAt">[],
  agora: Date = new Date()
): { ano: number; mes: number } | null {
  const h = partesSaoPaulo(agora);
  if (h.dia <= DIA_LIMITE_FECHAMENTO) return null;
  const ant = mesAnteriorSp(agora);
  const fechado = fechamentos.some(
    (f) => estaFechado(f) && f.ano === ant.ano && f.mes === ant.mes
  );
  return fechado ? null : ant;
}

// Totais gravados no fechamento × calculados agora: houve lançamento depois?
export function totaisDivergem(
  f: Pick<FechamentoBase, "receitasCents" | "despesasCents">,
  calc: { receitasCents: number; despesasCents: number }
): boolean {
  return f.receitasCents !== calc.receitasCents || f.despesasCents !== calc.despesasCents;
}

// Gráfico do quadro: meses não fechados aparecem vazios e marcados "aberto"
export function aplicarFechamentosAoGrafico<
  M extends { ano: number; mes: number; receitasCents: number; despesasCents: number },
>(
  meses: M[],
  fechamentos: Pick<FechamentoBase, "ano" | "mes" | "reabertoAt">[]
): (M & { aberto: boolean })[] {
  const chaves = new Set(mesesFechados(fechamentos).map((f) => `${f.ano}-${f.mes}`));
  return meses.map((m) =>
    chaves.has(`${m.ano}-${m.mes}`)
      ? { ...m, aberto: false }
      : { ...m, receitasCents: 0, despesasCents: 0, aberto: true }
  );
}

export function referenciaMes(ano: number, mes: number): string {
  return `${String(mes).padStart(2, "0")}/${ano}`;
}

function dataHoraBr(d: Date) {
  return d.toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// "Fechado por X em data · Ciência do Conselho por Y em data" (ou "Aberto")
export function carimboFechamento(f: FechamentoComNomes | null | undefined): {
  status: "aberto" | "fechado" | "reaberto";
  texto: string;
} {
  if (!f) return { status: "aberto", texto: "Aberto — a Tesouraria ainda não fechou este mês." };
  if (f.reabertoAt) {
    return {
      status: "reaberto",
      texto: `Reaberto por ${f.reabertoPor?.name ?? "—"} em ${dataHoraBr(f.reabertoAt)}${
        f.motivoReabertura ? ` (${f.motivoReabertura})` : ""
      } — feche novamente para o quadro voltar a ver o mês.`,
    };
  }
  const partes = [`Fechado por ${f.fechadoPor.name} em ${dataHoraBr(f.fechadoAt)}`];
  partes.push(
    f.cienciaConselhoAt
      ? `Ciência do Conselho por ${f.cienciaConselhoPor?.name ?? "—"} em ${dataHoraBr(f.cienciaConselhoAt)}`
      : "Aguardando ciência do Conselho de Contas"
  );
  return { status: "fechado", texto: partes.join(" · ") };
}

// ───────────── Prisma ─────────────

const comNomes = {
  fechadoPor: { select: { name: true } },
  cienciaConselhoPor: { select: { name: true } },
  reabertoPor: { select: { name: true } },
} as const;

export async function buscarFechamento(
  lodgeId: string,
  ano: number,
  mes: number
): Promise<FechamentoComNomes | null> {
  return prisma.fechamentoMes.findUnique({
    where: { lodgeId_ano_mes: { lodgeId, ano, mes } },
    include: comNomes,
  });
}

// Todos os fechamentos da loja (inclusive reabertos), mais recentes primeiro
export async function listarFechamentos(lodgeId: string): Promise<FechamentoComNomes[]> {
  return prisma.fechamentoMes.findMany({
    where: { lodgeId },
    include: comNomes,
    orderBy: [{ ano: "desc" }, { mes: "desc" }],
  });
}

// Fechamento ativo que cobre a data (null se o mês está aberto)
export async function fechamentoAtivoDaData(lodgeId: string, date: Date) {
  const p = partesSaoPaulo(date);
  const f = await prisma.fechamentoMes.findUnique({
    where: { lodgeId_ano_mes: { lodgeId, ano: p.ano, mes: p.mes } },
    select: { id: true, ano: true, mes: true, reabertoAt: true },
  });
  return estaFechado(f) ? f : null;
}

// Baixa automática (capitação, pagamento de despesa) cuja data cairia em mês
// já fechado: a Transaction entra com a data de HOJE e o Tesoureiro é avisado
// de que os totais do fechamento não incluem o valor. Devolve a data a gravar.
export async function dataRespeitandoFechamento(
  lodgeId: string,
  dataDesejada: Date,
  origem: { descricao: string; amountCents: number; chave: string }
): Promise<Date> {
  const f = await fechamentoAtivoDaData(lodgeId, dataDesejada);
  if (!f) return dataDesejada;
  const hoje = new Date();
  const { notificarEvento, usuariosDoCargo } = await import("@/lib/notificar-evento");
  const tesoureiros = await usuariosDoCargo(prisma, lodgeId, "TESOUREIRO");
  const destinos: (string | null)[] = tesoureiros.length ? tesoureiros : [null];
  const valor = (origem.amountCents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  for (const userId of destinos) {
    await notificarEvento(prisma, {
      lodgeId,
      sourceKey: `evento:fechamento:${f.id}:pagamento:${origem.chave}${userId ? `:${userId}` : ""}`,
      userId,
      type: "FINANCIAL_APPROVAL",
      title: `Pagamento entrou em mês já fechado (${referenciaMes(f.ano, f.mes)})`,
      description:
        `${origem.descricao} — ${valor}. O lançamento foi gravado com a data de hoje; ` +
        `os totais do fechamento de ${referenciaMes(f.ano, f.mes)} não incluem este valor. ` +
        `Se precisar, reabra o mês e feche novamente.`,
      link: `/tesouraria/balancete?mes=${f.mes}&ano=${f.ano}`,
    });
  }
  return hoje;
}
