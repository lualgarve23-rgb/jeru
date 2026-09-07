// Rifa de Benemerência (aprovada pelo VM em 07/09/2026):
//
//   VM ou Esmoler habilita uma campanha (título, período de venda, nº de
//   números, valor de cada número, data do sorteio) → enquanto vigente, a
//   Rifa aparece no menu de TODOS os irmãos da loja, que escolhem os seus
//   números e pagam por Pix (chave da Benemerência) → no dia do sorteio o
//   VM/Esmoler registra o número sorteado na própria ferramenta e o sistema
//   aponta o irmão dono do número.
//
// Regras puras (testáveis sem banco) aqui em cima; acesso ao Prisma no fim.

import { prisma } from "@/lib/prisma";
import { fimDoDiaSaoPaulo, instanteSaoPaulo } from "@/lib/datas-sp";

export const RIFA_GESTORES = ["VENERAVEL_MESTRE", "ESMOLER"] as const;
export const RIFA_MAX_NUMEROS = 10000;
// Máximo de números que um irmão reserva de uma vez (evita "comprar tudo")
export const RIFA_MAX_POR_RESERVA = 50;
// Dias após o sorteio em que a Rifa ainda aparece ao quadro (resultado)
export const RIFA_DIAS_RESULTADO = 30;

export function podeGerirRifa(role: string): boolean {
  return (RIFA_GESTORES as readonly string[]).includes(role);
}

export type RifaBase = {
  ativa: boolean;
  inicio: Date;
  fim: Date;
  sorteioEm: Date;
  quantidadeNumeros: number;
  valorCents: number;
  numeroSorteado: number | null;
};

export type FaseRifa =
  | "agendada" // ainda não começou a venda
  | "vendas" // período de venda
  | "aguardando-sorteio" // venda encerrada, sorteio não registrado
  | "sorteada"
  | "encerrada"; // desativada pelo gestor

export function faseRifa(r: RifaBase, agora: Date = new Date()): FaseRifa {
  if (!r.ativa) return "encerrada";
  if (r.numeroSorteado != null) return "sorteada";
  if (agora < r.inicio) return "agendada";
  if (agora <= r.fim) return "vendas";
  return "aguardando-sorteio";
}

export const FASE_LABEL: Record<FaseRifa, string> = {
  agendada: "Agendada",
  vendas: "Números à venda",
  "aguardando-sorteio": "Aguardando sorteio",
  sorteada: "Sorteada",
  encerrada: "Encerrada",
};

// O quadro (todos os irmãos) vê a Rifa da abertura das vendas até 30 dias
// depois do sorteio; gestores (VM/Esmoler) veem sempre que houver campanha ativa.
export function rifaVisivelAoQuadro(r: RifaBase, agora: Date = new Date()): boolean {
  if (!r.ativa) return false;
  if (agora < r.inicio) return false;
  const limite = new Date(r.sorteioEm.getTime() + RIFA_DIAS_RESULTADO * 86400000);
  return agora <= limite;
}

export function podeReservar(r: RifaBase, agora: Date = new Date()): boolean {
  return faseRifa(r, agora) === "vendas";
}

// Só se sorteia depois de encerrada a venda (ou do dia do sorteio, o que
// vier primeiro) — nunca durante as vendas.
export function podeSortear(r: RifaBase, agora: Date = new Date()): boolean {
  const fase = faseRifa(r, agora);
  return fase === "aguardando-sorteio";
}

export type ErroCampanha = string;

// Validação do formulário da campanha (datas "AAAA-MM-DD" do input type=date)
export function validarCampanha(input: {
  titulo: string;
  descricao?: string;
  inicio: string;
  fim: string;
  sorteio: string;
  quantidadeNumeros: number;
  valorReais: number;
}):
  | { ok: true; dados: { titulo: string; descricao: string | null; inicio: Date; fim: Date; sorteioEm: Date; quantidadeNumeros: number; valorCents: number } }
  | { ok: false; error: ErroCampanha } {
  const titulo = input.titulo.trim();
  if (titulo.length < 3) return { ok: false, error: "Dê um título à campanha (ex.: Rifa de Natal 2026)." };
  if (titulo.length > 120) return { ok: false, error: "Título longo demais (até 120 caracteres)." };
  const descricao = (input.descricao ?? "").trim();
  if (descricao.length > 1000) return { ok: false, error: "Descrição longa demais (até 1000 caracteres)." };
  const ini = /^(\d{4})-(\d{2})-(\d{2})$/.exec(input.inicio.trim());
  const inicio = ini ? instanteSaoPaulo(Number(ini[1]), Number(ini[2]), Number(ini[3])) : null;
  const fim = fimDoDiaSaoPaulo(input.fim);
  const sorteioEm = fimDoDiaSaoPaulo(input.sorteio);
  if (!inicio || isNaN(inicio.getTime())) return { ok: false, error: "Informe a data de início da campanha." };
  if (!fim) return { ok: false, error: "Informe a data de fim da campanha." };
  if (!sorteioEm) return { ok: false, error: "Informe a data do sorteio." };
  if (fim < inicio) return { ok: false, error: "O fim da campanha não pode ser antes do início." };
  if (sorteioEm < fim) return { ok: false, error: "O sorteio deve ser no último dia da campanha ou depois." };
  const qtd = Math.trunc(input.quantidadeNumeros);
  if (!Number.isFinite(qtd) || qtd < 2) return { ok: false, error: "A rifa precisa de pelo menos 2 números." };
  if (qtd > RIFA_MAX_NUMEROS) return { ok: false, error: `No máximo ${RIFA_MAX_NUMEROS} números.` };
  const valorCents = Math.round(input.valorReais * 100);
  if (!Number.isFinite(valorCents) || valorCents < 100) return { ok: false, error: "Informe o valor de cada número (mínimo R$ 1,00)." };
  if (valorCents > 100000000) return { ok: false, error: "Valor do número alto demais." };
  return { ok: true, dados: { titulo, descricao: descricao || null, inicio, fim, sorteioEm, quantidadeNumeros: qtd, valorCents } };
}

// Números pedidos pelo irmão: inteiros únicos dentro de 1..quantidade
export function validarNumeros(
  pedidos: number[],
  quantidadeNumeros: number,
  ocupados: Set<number>
): { ok: true; numeros: number[] } | { ok: false; error: string } {
  const numeros = Array.from(new Set(pedidos.map((n) => Math.trunc(n)))).filter((n) => Number.isFinite(n));
  if (numeros.length === 0) return { ok: false, error: "Escolha pelo menos um número." };
  if (numeros.length > RIFA_MAX_POR_RESERVA) return { ok: false, error: `Reserve até ${RIFA_MAX_POR_RESERVA} números por vez.` };
  const fora = numeros.filter((n) => n < 1 || n > quantidadeNumeros);
  if (fora.length) return { ok: false, error: `Número inválido: ${fora.join(", ")}.` };
  const tomados = numeros.filter((n) => ocupados.has(n));
  if (tomados.length) return { ok: false, error: `Já reservado por outro irmão: ${tomados.join(", ")}. Escolha outro número.` };
  return { ok: true, numeros: numeros.sort((a, b) => a - b) };
}

// ───────────── Sorteio pelo sistema ─────────────

export type SorteioModo = "MANUAL" | "SISTEMA_PAGOS" | "SISTEMA_TODOS";

export const SORTEIO_MODO_LABEL: Record<SorteioModo, string> = {
  MANUAL: "número informado pelo gestor (sorteio externo)",
  SISTEMA_PAGOS: "sorteado pelo sistema entre os números pagos",
  SISTEMA_TODOS: "sorteado pelo sistema entre todos os números reservados (pagos e a pagar)",
};

// Escolha determinística a partir da semente (hex de 16 bytes, gerada com
// crypto.randomBytes na hora do sorteio): índice = semente mod n. Guardar a
// semente permite a qualquer irmão reproduzir o resultado.
export function sortearComSemente(candidatos: number[], sementeHex: string): number | null {
  if (candidatos.length === 0) return null;
  if (!/^[0-9a-f]{32}$/i.test(sementeHex)) throw new Error("Semente inválida.");
  const ordenados = [...candidatos].sort((a, b) => a - b);
  const idx = Number(BigInt("0x" + sementeHex) % BigInt(ordenados.length));
  return ordenados[idx];
}

// Universo do sorteio pelo sistema: só pagos, ou todos os reservados
export function universoSorteio(
  numeros: { numero: number; pago: boolean }[],
  incluirNaoPagos: boolean
): number[] {
  return numeros.filter((n) => incluirNaoPagos || n.pago).map((n) => n.numero);
}

export function brl(cents: number): string {
  return (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function dataBr(d: Date): string {
  return d.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
}

// "AAAA-MM-DD" em São Paulo (para preencher inputs type=date)
export function isoSp(d: Date): string {
  return d.toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
}

// Resumo da arrecadação para o gestor
export function resumoRifa(
  r: Pick<RifaBase, "quantidadeNumeros" | "valorCents">,
  numeros: { pago: boolean }[]
) {
  const vendidos = numeros.length;
  const pagos = numeros.filter((n) => n.pago).length;
  return {
    vendidos,
    pagos,
    livres: r.quantidadeNumeros - vendidos,
    arrecadadoCents: pagos * r.valorCents,
    previstoCents: vendidos * r.valorCents,
    potencialCents: r.quantidadeNumeros * r.valorCents,
  };
}

// ───────────── Prisma ─────────────

export const rifaSelect = {
  id: true,
  titulo: true,
  descricao: true,
  ativa: true,
  inicio: true,
  fim: true,
  sorteioEm: true,
  quantidadeNumeros: true,
  valorCents: true,
  numeroSorteado: true,
  sorteadoAt: true,
  observacaoSorteio: true,
  sorteioModo: true,
  sorteioSemente: true,
  sorteioUniverso: true,
  fotos: true,
  createdAt: true,
  criadoPor: { select: { name: true } },
  ganhador: { select: { id: true, name: true } },
  sorteadoPor: { select: { name: true } },
} as const;

// Campanha ativa da loja (a mais recente), se houver
export async function rifaAtiva(lodgeId: string) {
  return prisma.rifaCampanha.findFirst({
    where: { lodgeId, ativa: true },
    orderBy: { createdAt: "desc" },
    select: rifaSelect,
  });
}

// Menu: o quadro só vê o item enquanto a campanha estiver vigente
export async function rifaNoMenu(lodgeId: string, role: string, agora: Date = new Date()): Promise<boolean> {
  if (podeGerirRifa(role)) return true;
  const r = await prisma.rifaCampanha.findFirst({
    where: { lodgeId, ativa: true },
    orderBy: { createdAt: "desc" },
    select: { ativa: true, inicio: true, fim: true, sorteioEm: true, quantidadeNumeros: true, valorCents: true, numeroSorteado: true },
  });
  return !!r && rifaVisivelAoQuadro(r, agora);
}
