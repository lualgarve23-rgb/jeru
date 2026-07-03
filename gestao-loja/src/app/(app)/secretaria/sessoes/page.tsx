import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { canWriteSecretaria } from "@/lib/permissions";
import { createSession } from "../actions";
import { ActionForm } from "@/components/action-form";
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
    include: { _count: { select: { attendances: true } }, ata: true },
  });

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Sessões e Livro de Presenças</h1>

      {canWriteSecretaria(user.role) && (
        <Card className="max-w-lg">
          <CardHeader>
            <CardTitle>Convocar nova sessão</CardTitle>
          </CardHeader>
          <CardContent>
            <ActionForm action={createSession} submitLabel="Criar sessão">
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1">
                  <Label htmlFor="date">Data</Label>
                  <Input id="date" name="date" type="date" required />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="type">Tipo</Label>
                  <select
                    id="type"
                    name="type"
                    className="h-9 w-full rounded-md border bg-transparent px-2 text-sm"
                  >
                    <option value="ORDINARIA">Ordinária</option>
                    <option value="MAGNA">Magna</option>
                    <option value="ECONOMICA">Econômica</option>
                    <option value="BRANCA">Branca</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <Label htmlFor="degree">Grau</Label>
                  <select
                    id="degree"
                    name="degree"
                    className="h-9 w-full rounded-md border bg-transparent px-2 text-sm"
                  >
                    <option value="APRENDIZ">Aprendiz</option>
                    <option value="COMPANHEIRO">Companheiro</option>
                    <option value="MESTRE">Mestre</option>
                  </select>
                </div>
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
              <TableCell>{s.date.toLocaleDateString("pt-BR")}</TableCell>
              <TableCell>{s.type}</TableCell>
              <TableCell>{s.degree}</TableCell>
              <TableCell>{s._count.attendances}</TableCell>
              <TableCell>{s.ata ? `nº ${s.ata.number} (${s.ata.status})` : "—"}</TableCell>
              <TableCell>
                <Link className="text-sm underline" href={`/secretaria/sessoes/${s.id}`}>
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
