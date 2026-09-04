// Datas de vencimento e "hoje" no fuso da Loja (America/Sao_Paulo), sem
// depender do TZ do servidor. Os vencimentos são gravados como 23:59:59 de
// São Paulo do dia escolhido, e "vencida" compara com o início do dia atual
// em São Paulo — assim uma capitação só vence depois do dia acabar no Brasil.

export const FUSO_LOJA = "America/Sao_Paulo";

const dtf = new Intl.DateTimeFormat("en-US", {
  timeZone: FUSO_LOJA,
  hourCycle: "h23",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});

// Componentes civis (ano, mês 1-12, dia, hora...) de um instante em São Paulo
export function partesSaoPaulo(instante: Date) {
  const p: Record<string, number> = {};
  for (const { type, value } of dtf.formatToParts(instante)) {
    if (type !== "literal") p[type] = Number(value);
  }
  return {
    ano: p.year,
    mes: p.month,
    dia: p.day,
    hora: p.hour,
    minuto: p.minute,
    segundo: p.second,
  };
}

// Deslocamento (minutos) de São Paulo em relação ao UTC naquele instante
function offsetMinutos(instante: Date): number {
  const c = partesSaoPaulo(instante);
  const comoUtc = Date.UTC(c.ano, c.mes - 1, c.dia, c.hora, c.minuto, c.segundo);
  return Math.round((comoUtc - instante.getTime()) / 60000);
}

// Instante UTC que corresponde à hora civil informada em São Paulo
export function instanteSaoPaulo(
  ano: number,
  mes: number,
  dia: number,
  hora = 0,
  minuto = 0,
  segundo = 0
): Date {
  const palpite = Date.UTC(ano, mes - 1, dia, hora, minuto, segundo);
  // Duas passagens cobrem mudanças de horário de verão perto do instante
  let off = offsetMinutos(new Date(palpite));
  let utc = palpite - off * 60000;
  off = offsetMinutos(new Date(utc));
  utc = palpite - off * 60000;
  return new Date(utc);
}

// Lê "AAAA-MM-DD" (input type=date) ou um Date e devolve as partes civis.
// Um Date é interpretado pelo seu dia civil em UTC (é como o navegador
// serializa inputs de data) — e uma string sem hora também.
function diaCivil(d: string | Date): { ano: number; mes: number; dia: number } | null {
  if (typeof d === "string") {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(d.trim());
    if (!m) return null;
    return { ano: Number(m[1]), mes: Number(m[2]), dia: Number(m[3]) };
  }
  if (isNaN(d.getTime())) return null;
  return { ano: d.getUTCFullYear(), mes: d.getUTCMonth() + 1, dia: d.getUTCDate() };
}

// Vencimento: 23:59:59 de São Paulo do dia informado (null se inválido)
export function fimDoDiaSaoPaulo(d: string | Date): Date | null {
  const c = diaCivil(d);
  if (!c) return null;
  const r = instanteSaoPaulo(c.ano, c.mes, c.dia, 23, 59, 59);
  return isNaN(r.getTime()) ? null : r;
}

// 00:00:00 de São Paulo do dia em que `agora` cai (para "já venceu?")
export function inicioDoDiaSaoPaulo(agora: Date = new Date()): Date {
  const c = partesSaoPaulo(agora);
  return instanteSaoPaulo(c.ano, c.mes, c.dia, 0, 0, 0);
}

// [início, fim) do mês civil em São Paulo
export function intervaloMesSaoPaulo(ano: number, mes: number): { inicio: Date; fim: Date } {
  const inicio = instanteSaoPaulo(ano, mes, 1);
  const fim = mes === 12 ? instanteSaoPaulo(ano + 1, 1, 1) : instanteSaoPaulo(ano, mes + 1, 1);
  return { inicio, fim };
}

// "AAAA-MM-DD" do dia atual em São Paulo (chaves diárias de notificação)
export function diaSaoPauloIso(agora: Date = new Date()): string {
  const c = partesSaoPaulo(agora);
  return `${c.ano}-${String(c.mes).padStart(2, "0")}-${String(c.dia).padStart(2, "0")}`;
}

// Capitação vencida = vencimento anterior ao início do dia atual em São Paulo
export function capitacaoVencida(dueDate: Date, agora: Date = new Date()): boolean {
  return dueDate < inicioDoDiaSaoPaulo(agora);
}
