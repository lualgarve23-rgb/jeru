import { InfoDica } from "@/components/info-dica";
import { AJUDA } from "@/lib/ajuda";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { canWriteSecretaria } from "@/lib/permissions";
import {
  requestQuittePlacet,
  refreshQuitacaoFinanceira,
  signQuittePlacet,
  negarQuittePlacet,
} from "../actions";
import { ActionForm, ActionButton } from "@/components/action-form";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { statusPlacetLabels, statusPlacetTone } from "@/lib/labels";

export default async function QuittePlacetsPage() {
  const user = await requireRole(
    "SECRETARIO",
    "VENERAVEL_MESTRE",
    "CONSELHO_CONTAS"
  );
  const isWriter = canWriteSecretaria(user.role);
  const canSign = user.role === "VENERAVEL_MESTRE" || user.role === "SECRETARIO";

  const [placets, members] = await Promise.all([
    prisma.quittePlacet.findMany({
      where: { lodgeId: user.lodgeId },
      orderBy: { dataSolicitacao: "desc" },
      include: { user: { select: { name: true, cim: true } } },
    }),
    prisma.user.findMany({
      where: { lodgeId: user.lodgeId },
      orderBy: { name: "asc" },
      select: { id: true, name: true, cim: true },
    }),
  ]);

  return (
    <div className="space-y-6">
      <h1 className="flex items-center gap-1 text-2xl font-bold">Quitte Placets<InfoDica titulo="Quitte Placets" texto={AJUDA.quitte} /></h1>

      {isWriter && (
        <Card className="max-w-xl">
          <CardHeader>
            <CardTitle>Nova solicitação</CardTitle>
          </CardHeader>
          <CardContent>
            <ActionForm action={requestQuittePlacet} submitLabel="Solicitar">
              <div className="space-y-1">
                <Label htmlFor="userId">Obreiro</Label>
                <select
                  id="userId"
                  name="userId"
                  required
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                >
                  <option value="">Selecione...</option>
                  {members.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name} (CIM {m.cim})
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <Label htmlFor="motivo">Motivo</Label>
                <textarea
                  id="motivo"
                  name="motivo"
                  rows={2}
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                />
              </div>
            </ActionForm>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="pt-6">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Obreiro</TableHead>
                <TableHead>Nada Consta</TableHead>
                <TableHead>Assinaturas</TableHead>
                <TableHead>Status</TableHead>
                {(isWriter || canSign) && <TableHead>Ações</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {placets.map((p) => (
                <TableRow key={p.id}>
                  <TableCell>
                    {p.user.name}
                    <span className="block text-xs text-muted-foreground">
                      CIM {p.user.cim}
                    </span>
                  </TableCell>
                  <TableCell>
                    <Badge variant={p.quitacaoFinanceira ? "success" : "warning"}>
                      {p.quitacaoFinanceira ? "Nada Consta" : "Pendências"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-xs">
                    <span aria-hidden="true">
                      VM {p.signedByMasterId ? "✓" : "—"} · Sec{" "}
                      {p.signedBySecId ? "✓" : "—"}
                    </span>
                    <span className="sr-only">
                      Venerável Mestre{" "}
                      {p.signedByMasterId ? "assinou" : "não assinou"}; Secretário{" "}
                      {p.signedBySecId ? "assinou" : "não assinou"}
                    </span>
                  </TableCell>
                  <TableCell>
                    <Badge variant={statusPlacetTone(p.status)}>
                      {statusPlacetLabels[p.status]}
                    </Badge>
                  </TableCell>
                  {(isWriter || canSign) && (
                    <TableCell>
                      <div className="flex flex-wrap gap-2">
                      {isWriter && !p.quitacaoFinanceira && (
                        <ActionButton
                          action={() => refreshQuitacaoFinanceira(p.id)}
                          label="Reconsultar Tesouraria"
                          variant="outline"
                        />
                      )}
                      {canSign &&
                        p.status !== "APROVADO" &&
                        p.status !== "NEGADO" && (
                          <ActionButton
                            action={() => signQuittePlacet(p.id)}
                            label="Assinar"
                          />
                        )}
                      {isWriter &&
                        p.status !== "APROVADO" &&
                        p.status !== "NEGADO" && (
                          <ActionButton
                            action={() => negarQuittePlacet(p.id)}
                            label="Negar"
                            variant="destructive"
                          />
                        )}
                      </div>
                    </TableCell>
                  )}
                </TableRow>
              ))}
              {placets.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground">
                    Nenhuma solicitação registrada.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
