import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { canWriteSecretaria, INTERSTICE_MONTHS } from "@/lib/permissions";
import { createProcessoProgressao } from "../actions";
import { ActionForm } from "@/components/action-form";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { degreeLabels } from "@/lib/labels";
import { ProgressaoKanban } from "./kanban-board";

export const metadata = { title: "Progressões" };

export default async function ProgressoesPage() {
  const user = await requireRole(
    "SECRETARIO",
    "VENERAVEL_MESTRE",
    "CONSELHO_CONTAS"
  );
  const isWriter = canWriteSecretaria(user.role);

  const [processos, candidatos] = await Promise.all([
    prisma.processoProgressao.findMany({
      where: { lodgeId: user.lodgeId },
      orderBy: { createdAt: "desc" },
      include: {
        user: {
          select: {
            name: true,
            cim: true,
            initiationDate: true,
            degreeHistory: { orderBy: { date: "desc" }, take: 1 },
          },
        },
      },
    }),
    // obreiros ativos que ainda não são Mestres e sem processo aberto
    prisma.user.findMany({
      where: {
        lodgeId: user.lodgeId,
        status: "ATIVO",
        degree: { in: ["APRENDIZ", "COMPANHEIRO"] },
        processosProgressao: { none: { status: { not: "GRAU_CONCEDIDO" } } },
      },
      orderBy: { name: "asc" },
      select: { id: true, name: true, cim: true, degree: true },
    }),
  ]);

  const cards = processos.map((p) => {
    // data em que o interstício é cumprido, para exibir a trava no card
    const base = p.user.degreeHistory[0]?.date ?? p.user.initiationDate;
    let aptoEm: string | null = null;
    if (base) {
      const eligible = new Date(base);
      eligible.setMonth(eligible.getMonth() + INTERSTICE_MONTHS[p.grauAlvo]);
      aptoEm = eligible.toISOString();
    }
    return {
      id: p.id,
      nome: p.user.name,
      cim: p.user.cim,
      grauAlvo: p.grauAlvo,
      status: p.status,
      placetDeferido: p.placetDeferido,
      comunicadoEnviado: p.comunicadoEnviado,
      dataCerimonia: p.dataCerimonia?.toISOString() ?? null,
      aptoEm,
    };
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Progressão de Graus</h1>
        <p className="text-sm text-muted-foreground">
          Elevações e Exaltações — travas de interstício, Placet da Guarda dos
          Selos e comunicação de 15 dias.
        </p>
      </div>

      {isWriter && (
        <Card className="max-w-xl">
          <CardHeader>
            <CardTitle>Iniciar progressão</CardTitle>
          </CardHeader>
          <CardContent>
            {candidatos.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Nenhum obreiro elegível (ativos abaixo de Mestre, sem processo
                em andamento).
              </p>
            ) : (
              <ActionForm
                action={createProcessoProgressao}
                submitLabel="Abrir processo"
              >
                <div className="space-y-1">
                  <Label htmlFor="userId">Obreiro</Label>
                  <select
                    id="userId"
                    name="userId"
                    required
                    className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                  >
                    {candidatos.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name} — CIM {c.cim} (
                        {degreeLabels[c.degree] ?? c.degree})
                      </option>
                    ))}
                  </select>
                </div>
              </ActionForm>
            )}
          </CardContent>
        </Card>
      )}

      <ProgressaoKanban processos={cards} readOnly={!isWriter} />
    </div>
  );
}
