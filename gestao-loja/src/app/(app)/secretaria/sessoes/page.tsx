import { InfoDica } from "@/components/info-dica";
import { AJUDA } from "@/lib/ajuda";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { canWriteSecretaria } from "@/lib/permissions";
import { createSession } from "../actions";
import { ActionForm } from "@/components/action-form";
import { TipoGrauSelects } from "./tipo-grau-selects";
import {
  sessionTypeLabels,
  degreeLabels,
  ataStatusLabels,
} from "@/lib/labels";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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

export default async function SessoesPage() {
  const user = await requireUser();
  const sessions = await prisma.lodgeSession.findMany({
    where: { lodgeId: user.lodgeId },
    orderBy: { date: "desc" },
    include: {
      _count: {
        select: { attendances: { where: { checkedIn: true } } },
      },
      ata: true,
    },
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="flex items-center gap-1 text-2xl font-bold">Sessões e Livro de Presenças<InfoDica titulo="Sessões e Livro de Presenças" texto={AJUDA.sessoes} /></h1>
        <a
          className="flex h-9 items-center rounded-md border px-3 text-sm underline-offset-2 hover:underline"
          href={`/secretaria/sessoes/export?ano=${new Date().getFullYear()}`}
          download
        >
          Exportar frequência (CSV)
        </a>
      </div>

      {canWriteSecretaria(user.role) && (
        <Card className="max-w-lg">
          <CardHeader>
            <CardTitle>Convocar nova sessão</CardTitle>
          </CardHeader>
          <CardContent>
            <ActionForm action={createSession} submitLabel="Criar sessão">
              <div className="grid gap-3 sm:grid-cols-4">
                <div className="space-y-1">
                  <Label htmlFor="date">Data</Label>
                  <Input id="date" name="date" type="date" required />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="hora">Início</Label>
                  <Input
                    id="hora"
                    name="hora"
                    type="time"
                    required
                    defaultValue="20:00"
                  />
                </div>
                <TipoGrauSelects />
              </div>
              <div className="space-y-1">
                <Label htmlFor="pauta">Pauta do dia (opcional)</Label>
                <textarea
                  id="pauta"
                  name="pauta"
                  rows={3}
                  placeholder="assuntos da sessão — sai no convite e pré-preenche a Ata"
                  className="w-full rounded-md border bg-transparent p-2 text-sm"
                />
              </div>
            </ActionForm>
          </CardContent>
        </Card>
      )}

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Data</TableHead>
            <TableHead>Tipo</TableHead>
            <TableHead>Grau</TableHead>
            <TableHead>Presenças</TableHead>
            <TableHead>Ata</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {sessions.map((s) => (
            <TableRow key={s.id}>
              <TableCell>
                {s.date.toLocaleDateString("pt-BR")}
                {" às "}
                {s.date.toLocaleTimeString("pt-BR", {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </TableCell>
              <TableCell>{sessionTypeLabels[s.type] ?? s.type}</TableCell>
              <TableCell>{degreeLabels[s.degree] ?? s.degree}</TableCell>
              <TableCell>{s._count.attendances}</TableCell>
              <TableCell>
                {s.ata
                  ? `nº ${s.ata.number} (${ataStatusLabels[s.ata.status] ?? s.ata.status})`
                  : "—"}
              </TableCell>
              <TableCell>
                <Link className="text-sm font-medium text-primary hover:underline" href={`/secretaria/sessoes/${s.id}`}>
                  Abrir
                </Link>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
