// Base de Visitantes: irmãos de outras Oficinas que visitam a Loja.
// O check-in por QR e o RSVP do convite chamam `vincularVisitante`, que
// encontra (ou cria) o cadastro da pessoa e completa campos vazios com o
// que foi informado. A Secretaria enriquece a ficha depois.

import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";

export type DadosVisitante = {
  nome: string;
  cim?: string | null;
  email?: string | null;
  telefone?: string | null;
  lojaOrigem?: string | null;
  potencia?: string | null;
};

export type VisitanteCandidato = {
  id: string;
  nome: string;
  cim: string | null;
  email: string | null;
  lojaOrigem: string | null;
};

const limpa = (v: unknown) => {
  const s = String(v ?? "").trim();
  return s ? s : null;
};

// Normaliza o que vem dos formulários públicos (check-in/RSVP)
export function normalizarDadosVisitante(d: DadosVisitante): DadosVisitante {
  return {
    nome: String(d.nome ?? "").trim().replace(/\s+/g, " "),
    cim: limpa(d.cim),
    email: limpa(d.email)?.toLowerCase() ?? null,
    telefone: normalizarTelefone(d.telefone),
    lojaOrigem: limpa(d.lojaOrigem),
    potencia: limpa(d.potencia),
  };
}

// Mantém só dígitos e um "+" inicial; vazio vira null
export function normalizarTelefone(v: unknown): string | null {
  const s = String(v ?? "").trim();
  if (!s) return null;
  const mais = s.startsWith("+") ? "+" : "";
  const digitos = s.replace(/\D/g, "");
  return digitos ? mais + digitos : null;
}

const chave = (v: string | null | undefined) => (v ?? "").trim().toLowerCase();

// Regra de correspondência (pura, testável): CIM igual; senão e-mail igual;
// senão nome igual E loja de origem igual (ou nenhum dos dois com loja).
// Nome igual com lojas diferentes NÃO casa — são pessoas distintas até prova
// em contrário (a Secretaria pode mesclar).
export function escolherCorrespondencia<T extends VisitanteCandidato>(
  candidatos: T[],
  d: DadosVisitante
): T | null {
  const cim = chave(d.cim);
  if (cim) {
    const porCim = candidatos.find((c) => chave(c.cim) === cim);
    if (porCim) return porCim;
  }
  const email = chave(d.email);
  if (email) {
    const porEmail = candidatos.find((c) => chave(c.email) === email);
    if (porEmail) return porEmail;
  }
  const nome = chave(d.nome);
  const loja = chave(d.lojaOrigem);
  const porNome = candidatos.filter((c) => chave(c.nome) === nome);
  if (porNome.length === 0) return null;
  if (loja) {
    return porNome.find((c) => chave(c.lojaOrigem) === loja) ?? null;
  }
  // Sem loja informada: só casa se houver um único homônimo
  return porNome.length === 1 ? porNome[0] : null;
}

// Campos vazios do cadastro recebem o valor informado agora; campos já
// preenchidos ficam como estão (a Secretaria é a fonte de verdade).
export function completarCampos(
  atual: {
    cim: string | null;
    email: string | null;
    telefone: string | null;
    lojaOrigem: string | null;
    potencia: string | null;
  },
  d: DadosVisitante
): Prisma.VisitanteUpdateInput {
  const upd: Prisma.VisitanteUpdateInput = {};
  if (!atual.cim && d.cim) upd.cim = d.cim;
  if (!atual.email && d.email) upd.email = d.email;
  if (!atual.telefone && d.telefone) upd.telefone = d.telefone;
  if (!atual.lojaOrigem && d.lojaOrigem) upd.lojaOrigem = d.lojaOrigem;
  if (!atual.potencia && d.potencia) upd.potencia = d.potencia;
  return upd;
}

// Encontra ou cria o cadastro do visitante na Loja. Retorna o id.
export async function vincularVisitante(
  lodgeId: string,
  bruto: DadosVisitante
): Promise<string> {
  const d = normalizarDadosVisitante(bruto);
  if (!d.nome) throw new Error("Nome do visitante obrigatório.");
  const ou: Prisma.VisitanteWhereInput[] = [
    { nome: { equals: d.nome, mode: "insensitive" } },
  ];
  if (d.cim) ou.push({ cim: { equals: d.cim, mode: "insensitive" } });
  if (d.email) ou.push({ email: { equals: d.email, mode: "insensitive" } });
  const candidatos = await prisma.visitante.findMany({
    where: { lodgeId, OR: ou },
    select: {
      id: true,
      nome: true,
      cim: true,
      email: true,
      telefone: true,
      lojaOrigem: true,
      potencia: true,
    },
  });
  const achado = escolherCorrespondencia(candidatos, d);
  if (achado) {
    const upd = completarCampos(achado, d);
    if (Object.keys(upd).length > 0) {
      await prisma.visitante.update({ where: { id: achado.id }, data: upd });
    }
    return achado.id;
  }
  const novo = await prisma.visitante.create({
    data: {
      lodgeId,
      nome: d.nome,
      cim: d.cim,
      email: d.email,
      telefone: d.telefone,
      lojaOrigem: d.lojaOrigem,
      potencia: d.potencia,
    },
    select: { id: true },
  });
  return novo.id;
}

// Resumo por visitante para a lista da Secretaria e a tool do assistente
export async function listarVisitantes(lodgeId: string, busca?: string | null) {
  const q = (busca ?? "").trim();
  const filtro: Prisma.VisitanteWhereInput = q
    ? {
        OR: [
          { nome: { contains: q, mode: "insensitive" } },
          { cim: { contains: q, mode: "insensitive" } },
          { email: { contains: q, mode: "insensitive" } },
          { lojaOrigem: { contains: q, mode: "insensitive" } },
          { potencia: { contains: q, mode: "insensitive" } },
          { oriente: { contains: q, mode: "insensitive" } },
        ],
      }
    : {};
  const rows = await prisma.visitante.findMany({
    where: { lodgeId, ...filtro },
    orderBy: { nome: "asc" },
    include: {
      presencas: {
        where: { checkedIn: true },
        select: { id: true, session: { select: { date: true } } },
        orderBy: { session: { date: "desc" } },
      },
    },
  });
  return rows.map(({ presencas, ...v }) => ({
    ...v,
    totalVisitas: presencas.length,
    ultimaVisita: presencas[0]?.session.date ?? null,
    primeiraVisita: presencas[presencas.length - 1]?.session.date ?? null,
  }));
}
