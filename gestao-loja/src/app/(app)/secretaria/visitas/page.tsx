import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { canWriteSecretaria } from "@/lib/permissions";
import {
  registrarVisitaExterna,
  removerVisitaExterna,
  anexarCertificadoVisitaExterna,
} from "../actions";
import { ActionForm, ActionButton } from "@/components/action-form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default async function VisitasPage() {
  const user = await requireUser();
  const isWriter = canWriteSecretaria(user.role);

  const [membros, visitas] = await Promise.all([
    prisma.user.findMany({
      where: {
        lodgeId: user.lodgeId,
        status: { in: ["ATIVO", "IRREGULAR", "LICENCIADO"] },
        currentRole: { not: "SUPER_ADMIN" },
      },
      orderBy: { name: "asc" },
      select: { id: true, name: true, cim: true },
    }),
    prisma.visitaExterna.findMany({
      where: { lodgeId: user.lodgeId },
      orderBy: [{ date: "desc" }, { createdAt: "desc" }],
      include: {
        user: { select: { id: true, name: true, cim: true } },
        registradaPor: { select: { name: true } },
      },
    }),
  ]);

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Visitas a outras Oficinas</h1>
        <p className="text-sm text-muted-foreground">
          Registro das visitas dos irmãos da Loja a outras oficinas — cada
          visita entra no histórico geral do irmão.
        </p>
      </div>

      {isWriter && (
        <Card>
          <CardHeader>
            <CardTitle>Registrar visita</CardTitle>
            <CardDescription>
              Informe o irmão, a data e a oficina visitada.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ActionForm action={registrarVisitaExterna} submitLabel="Registrar visita">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label htmlFor="memberId">Irmão</Label>
                  <select
                    id="memberId"
                    name="memberId"
                    required
                    className="h-9 w-full rounded-md border bg-transparent px-2 text-sm"
                  >
                    {membros.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name} (CIM {m.cim})
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1">
                  <Label htmlFor="date">Data da visita</Label>
                  <Input id="date" name="date" type="date" required />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="lojaVisitada">Oficina visitada</Label>
                  <Input
                    id="lojaVisitada"
                    name="lojaVisitada"
                    required
                    placeholder="ex.: ARLS Estrela do Oriente nº 123"
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="potencia">Potência (opcional)</Label>
                  <Input id="potencia" name="potencia" placeholder="ex.: GOB-SP" />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="oriente">Oriente (opcional)</Label>
                  <Input id="oriente" name="oriente" placeholder="ex.: São Paulo — SP" />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="observacao">Observação (opcional)</Label>
                  <Input
                    id="observacao"
                    name="observacao"
                    placeholder="ex.: Sessão Magna de Iniciação"
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="certificado">Certificado de visita (opcional)</Label>
                  <Input
                    id="certificado"
                    name="certificado"
                    type="file"
                    accept="application/pdf,image/jpeg,image/png"
                  />
                  <p className="text-xs text-muted-foreground">
                    PDF, JPG ou PNG — arquivado no Drive da Loja.
                  </p>
                </div>
              </div>
            </ActionForm>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Visitas registradas ({visitas.length})</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Data</TableHead>
                <TableHead>Irmão</TableHead>
                <TableHead>Oficina visitada</TableHead>
                <TableHead>Observação</TableHead>
                <TableHead>Certificado</TableHead>
                {isWriter && <TableHead />}
              </TableRow>
            </TableHeader>
            <TableBody>
              {visitas.map((v) => (
                <TableRow key={v.id}>
                  <TableCell>{v.date.toLocaleDateString("pt-BR")}</TableCell>
                  <TableCell className="font-medium">
                    <Link
                      href={`/secretaria/membros/${v.user.id}`}
                      className="underline-offset-2 hover:underline"
                    >
                      {v.user.name}
                    </Link>
                    <span className="text-muted-foreground"> · CIM {v.user.cim}</span>
                  </TableCell>
                  <TableCell>
                    {v.lojaVisitada}
                    {(v.potencia || v.oriente) && (
                      <span className="text-muted-foreground">
                        {" "}
                        · {[v.potencia, v.oriente].filter(Boolean).join(" — ")}
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {v.observacao ?? "—"}
                  </TableCell>
                  <TableCell>
                    {v.certificadoDriveId ? (
                      <a
                        href={`https://drive.google.com/file/d/${v.certificadoDriveId}/view`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm underline underline-offset-2"
                      >
                        Ver certificado
                      </a>
                    ) : isWriter ? (
                      <ActionForm
                        action={anexarCertificadoVisitaExterna.bind(null, v.id)}
                        submitLabel="Anexar"
                        className="flex flex-col gap-1"
                      >
                        <Input
                          name="certificado"
                          type="file"
                          required
                          accept="application/pdf,image/jpeg,image/png"
                          className="h-8 max-w-48 text-xs"
                        />
                      </ActionForm>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  {isWriter && (
                    <TableCell>
                      <ActionButton
                        action={removerVisitaExterna.bind(null, v.id)}
                        label="Remover"
                        variant="outline"
                      />
                    </TableCell>
                  )}
                </TableRow>
              ))}
              {visitas.length === 0 && (
                <TableRow>
                  <TableCell
                    colSpan={isWriter ? 6 : 5}
                    className="text-muted-foreground"
                  >
                    Nenhuma visita registrada ainda.
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
