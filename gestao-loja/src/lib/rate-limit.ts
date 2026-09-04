// Rate limit em memória por IP para as rotas públicas (janela deslizante).
// Roda no middleware (single-instance atrás do nginx); se o app um dia for
// escalado horizontalmente, trocar por um store partilhado (Redis).

type Regra = { prefixo: string; porMinuto: number; porMinutoPost: number };

// Limites por prefixo de rota pública: navegação (GET) mais folgada,
// escrita (POST — check-in, RSVP, envio de formulário) mais apertada.
export const REGRAS_PUBLICAS: Regra[] = [
  { prefixo: "/checkin/", porMinuto: 30, porMinutoPost: 15 },
  { prefixo: "/convite/", porMinuto: 20, porMinutoPost: 10 },
  { prefixo: "/candidato/", porMinuto: 20, porMinutoPost: 10 },
  { prefixo: "/verificar/", porMinuto: 20, porMinutoPost: 10 },
  { prefixo: "/api/verificar/", porMinuto: 30, porMinutoPost: 10 },
  { prefixo: "/esqueci-senha", porMinuto: 15, porMinutoPost: 5 },
  // Login: navegação livre, mas tentativas (POST da server action e o
  // endpoint credentials do Auth.js) limitadas a 10/min por IP
  { prefixo: "/login", porMinuto: 60, porMinutoPost: 10 },
  { prefixo: "/api/auth/", porMinuto: 60, porMinutoPost: 10 },
];

const JANELA_MS = 60_000;
// Limpeza periódica para o Map não crescer sem limite sob scraping distribuído
const LIMPEZA_A_CADA = 1_000;

const hits = new Map<string, number[]>();
let chamadasDesdeLimpeza = 0;

function limparExpirados(agora: number) {
  for (const [chave, tempos] of hits) {
    const vivos = tempos.filter((t) => agora - t < JANELA_MS);
    if (vivos.length === 0) hits.delete(chave);
    else hits.set(chave, vivos);
  }
}

export function regraPara(pathname: string): Regra | null {
  return REGRAS_PUBLICAS.find((r) => pathname.startsWith(r.prefixo)) ?? null;
}

// true = dentro do limite; false = bloquear com 429
export function permitir(
  ip: string,
  pathname: string,
  metodo: string,
  agora = Date.now()
): boolean {
  const regra = regraPara(pathname);
  if (!regra) return true;

  const escrita = metodo !== "GET" && metodo !== "HEAD";
  const limite = escrita ? regra.porMinutoPost : regra.porMinuto;
  // POST e GET contam em baldes separados: navegar não consome o limite de envio
  const chave = `${ip}|${regra.prefixo}|${escrita ? "w" : "r"}`;

  if (++chamadasDesdeLimpeza >= LIMPEZA_A_CADA) {
    chamadasDesdeLimpeza = 0;
    limparExpirados(agora);
  }

  const tempos = (hits.get(chave) ?? []).filter((t) => agora - t < JANELA_MS);
  if (tempos.length >= limite) {
    hits.set(chave, tempos);
    return false;
  }
  tempos.push(agora);
  hits.set(chave, tempos);
  return true;
}

// Só para os testes reiniciarem o estado
export function zerarRateLimit() {
  hits.clear();
  chamadasDesdeLimpeza = 0;
}
