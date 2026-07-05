import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { toCsv, csvResponse } from "@/lib/csv";
import { degreeLabels, memberStatusLabels } from "@/lib/labels";

// Exporta a frequência por membro em CSV (?ano= filtra o exercício):
// sessões realizadas, presenças e percentual.
export async function GET(request: Request) {
  const user = await requireRole(
    "SECRETARIO",
    "VENERAVEL_MESTRE",
    "CONSELHO_CONTAS"
  );
  const url = new URL(request.url);
  const year = Number(url.searchParams.get("ano")) || undefined;
  const dateFilter = year
    ? { gte: new Date(year, 0, 1), lt: new Date(year + 1, 0, 1) }
    : undefined;

  const [sessions, members] = await Promise.all([
    prisma.lodgeSession.findMany({
      where: { lodgeId: user.lodgeId, ...(dateFilter ? { date: dateFilter } : {}) },
      select: { id: true },
    }),
    prisma.user.findMany({
      where: {
        lodgeId: user.lodgeId,
        status: { in: ["ATIVO", "IRREGULAR", "LICENCIADO"] },
        currentRole: { not: "SUPER_ADMIN" },
      },
      orderBy: { name: "asc" },
      select: {
        name: true,
        cim: true,
        degree: true,
        status: true,
        attendances: {
          where: dateFilter ? { session: { date: dateFilter } } : {},
          select: { id: true },
        },
      },
    }),
  ]);

  const total = sessions.length;
  const csv = toCsv(
    ["Membro", "CIM", "Grau", "Situação", "Presenças", "Sessões", "Frequência (%)"],
    members.map((m) => {
      const pres = m.attendances.length;
      return [
        m.name,
        m.cim,
        degreeLabels[m.degree] ?? m.degree,
        memberStatusLabels[m.status] ?? m.status,
        pres,
        total,
        total > 0 ? Math.round((pres / total) * 100) : 0,
      ];
    })
  );
  return csvResponse(`frequencia${year ? `-${year}` : ""}.csv`, csv);
}
