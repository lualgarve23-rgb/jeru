import { prisma } from "@/lib/prisma";

// Frequência anual por membro: presenças ÷ sessões computadas no ano.
// Só contam as sessões que o membro podia assistir (grau da sessão ≤ grau do
// membro) e posteriores à sua iniciação.

const DEGREE_RANK: Record<string, number> = {
  APRENDIZ: 1,
  COMPANHEIRO: 2,
  MESTRE: 3,
};

// Sessões mínimas computadas no ano antes de emitir alertas de frequência
// (evita falsos positivos no início do ano).
export const MIN_SESSOES_PARA_ALERTA = 3;

export type FrequenciaMembro = {
  userId: string;
  name: string;
  degree: string;
  sessoesComputadas: number;
  presencas: number;
  // 0–100; null quando não há sessão computada para o membro
  percentual: number | null;
};

export async function frequenciaAnual(
  lodgeId: string,
  ano = new Date().getFullYear()
): Promise<FrequenciaMembro[]> {
  const inicio = new Date(ano, 0, 1);
  const fimAno = new Date(ano + 1, 0, 1);
  const agora = new Date();
  const fim = agora < fimAno ? agora : fimAno;

  const [sessions, members, atts] = await Promise.all([
    prisma.lodgeSession.findMany({
      where: { lodgeId, date: { gte: inicio, lte: fim } },
      select: { id: true, date: true, degree: true },
    }),
    prisma.user.findMany({
      where: {
        lodgeId,
        status: { in: ["ATIVO", "IRREGULAR"] },
        currentRole: { not: "SUPER_ADMIN" },
      },
      select: { id: true, name: true, degree: true, initiationDate: true },
    }),
    prisma.attendance.findMany({
      where: {
        lodgeId,
        userId: { not: null },
        session: { date: { gte: inicio, lte: fim } },
      },
      select: { userId: true, sessionId: true },
    }),
  ]);

  const presencas = new Set(atts.map((a) => `${a.userId}:${a.sessionId}`));

  return members.map((m) => {
    const rank = DEGREE_RANK[m.degree] ?? 3;
    const computadas = sessions.filter(
      (s) =>
        (DEGREE_RANK[s.degree] ?? 1) <= rank &&
        (!m.initiationDate || s.date >= m.initiationDate)
    );
    const presentes = computadas.filter((s) =>
      presencas.has(`${m.id}:${s.id}`)
    ).length;
    return {
      userId: m.id,
      name: m.name,
      degree: m.degree,
      sessoesComputadas: computadas.length,
      presencas: presentes,
      percentual: computadas.length
        ? Math.round((presentes / computadas.length) * 100)
        : null,
    };
  });
}
