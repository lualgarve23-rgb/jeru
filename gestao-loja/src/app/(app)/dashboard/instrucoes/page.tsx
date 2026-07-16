import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { grausInstrucaoPermitidos } from "@/lib/permissions";
import { registrarInstrucao, removerInstrucao } from "./actions";
import { ActionForm, ActionButton } from "@/components/action-form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

const GRAU_INFO = {
  APRENDIZ: { titulo: "Aprendizes", vigilante: "2º Vigilante" },
  COMPANHEIRO: { titulo: "Companheiros", vigilante: "1º Vigilante" },
} as const;

export default async function InstrucoesPage() {
  const user = await requireUser();
  const { cargoRito } = await prisma.user.findUniqueOrThrow({
    where: { id: user.id },
    select: { cargoRito: true },
  });
  const graus = grausInstrucaoPermitidos(user.role, cargoRito);
  if (!graus.length) redirect("/dashboard");

  const lodge = await prisma.lodge.findUniqueOrThrow({
    where: { id: user.lodgeId },
    select: { instrucoesAprendiz: true, instrucoesCompanheiro: true },
  });
  const meta = {
    APRENDIZ: lodge.instrucoesAprendiz,
    COMPANHEIRO: lodge.instrucoesCompanheiro,
  } as const;

  const membros = await prisma.user.findMany({
    where: {
      lodgeId: user.lodgeId,
      degree: { in: graus },
      status: { in: ["ATIVO", "IRREGULAR", "LICENCIADO"] },
      currentRole: { not: "SUPER_ADMIN" },
    },
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      cim: true,
      degree: true,
      instrucoesRecebidas: {
        orderBy: { date: "desc" },
        include: { registradaPor: { select: { name: true } } },
      },
    },
  });

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Instruções de Grau</h1>
        <p className="text-sm text-muted-foreground">
          Registro e check-in das instruções ministradas pelos Vigilantes —
          contam para a progressão de grau.
        </p>
      </div>

      {graus.map((grau) => {
        const doGrau = membros.filter((m) => m.degree === grau);
        const necessarias = meta[grau];
        return (
          <Card key={grau}>
            <CardHeader>
              <CardTitle>
                {GRAU_INFO[grau].titulo}{" "}
                <span className="text-sm font-normal text-muted-foreground">
                  — instruídos pelo {GRAU_INFO[grau].vigilante}
                </span>
              </CardTitle>
              <CardDescription>
                {necessarias > 0
                  ? `A loja exige ${necessarias} instrução(ões) para a progressão.`
                  : "A loja ainda não definiu o nº de instruções exigidas (Configurações da Loja)."}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {doGrau.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Nenhum obreiro neste grau.
                </p>
              ) : (
                <>
                  <ActionForm
                    action={registrarInstrucao}
                    submitLabel="Registrar instrução (check-in)"
                  >
                    <div className="grid gap-3 sm:grid-cols-3">
                      <div className="space-y-1">
                        <Label htmlFor={`memberId-${grau}`}>Obreiro</Label>
                        <select
                          id={`memberId-${grau}`}
                          name="memberId"
                          required
                          className="h-9 w-full rounded-md border bg-transparent px-2 text-sm"
                        >
                          {doGrau.map((m) => (
                            <option key={m.id} value={m.id}>
                              {m.name} (CIM {m.cim})
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="space-y-1">
                        <Label htmlFor={`date-${grau}`}>Data</Label>
                        <Input
                          id={`date-${grau}`}
                          name="date"
                          type="date"
                          required
                        />
                      </div>
                      <div className="space-y-1">
                        <Label htmlFor={`tema-${grau}`}>Tema (opcional)</Label>
                        <Input
                          id={`tema-${grau}`}
                          name="tema"
                          placeholder="ex.: Simbolismo da Régua de 24 polegadas"
                        />
                      </div>
                    </div>
                  </ActionForm>

                  <ul className="space-y-4 text-sm">
                    {doGrau.map((m) => {
                      const feitas = m.instrucoesRecebidas.filter(
                        (i) => i.degree === grau
                      );
                      const completo =
                        necessarias > 0 && feitas.length >= necessarias;
                      return (
                        <li key={m.id} className="rounded-md border p-3">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-medium">{m.name}</span>
                            <Badge variant={completo ? "default" : "secondary"}>
                              {feitas.length}
                              {necessarias > 0 ? ` / ${necessarias}` : ""}{" "}
                              instrução(ões)
                            </Badge>
                            {completo && (
                              <span className="text-xs text-green-700">
                                ✓ requisito cumprido
                              </span>
                            )}
                          </div>
                          {feitas.length > 0 && (
                            <ul className="mt-2 space-y-1 text-muted-foreground">
                              {feitas.map((i) => (
                                <li
                                  key={i.id}
                                  className="flex flex-wrap items-center gap-2"
                                >
                                  <span>
                                    {i.date.toLocaleDateString("pt-BR")}
                                    {i.tema ? ` — ${i.tema}` : ""} · por{" "}
                                    {i.registradaPor.name}
                                  </span>
                                  <ActionButton
                                    action={removerInstrucao.bind(null, i.id)}
                                    label="Remover"
                                    variant="outline"
                                  />
                                </li>
                              ))}
                            </ul>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
