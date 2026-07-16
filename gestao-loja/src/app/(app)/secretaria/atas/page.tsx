import { InfoDica } from "@/components/info-dica";
import { AJUDA } from "@/lib/ajuda";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { Badge } from "@/components/ui/badge";
import {
  ataStatusLabels,
  ataStatusTone,
  sessionTypeLabels,
} from "@/lib/labels";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export default async function AtasPage() {
  const user = await requireUser();
  const atas = await prisma.ata.findMany({
    where: { lodgeId: user.lodgeId },
    orderBy: { number: "desc" },
    include: { session: true },
  });

  return (
    <div className="space-y-4">
      <h1 className="flex items-center gap-1 text-2xl font-bold">Livro de Atas (Balaústres)<InfoDica titulo="Livro de Atas (Balaústres)" texto={AJUDA.atas} /></h1>
      <p className="text-sm text-muted-foreground">
        Para lavrar uma nova ata, abra a sessão correspondente em “Sessões e
        Presenças”.
      </p>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Nº</TableHead>
            <TableHead>Sessão</TableHead>
            <TableHead>Status</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {atas.map((a) => (
            <TableRow key={a.id}>
              <TableCell>{a.number}</TableCell>
              <TableCell>
                {a.session.date.toLocaleDateString("pt-BR")} —{" "}
                {sessionTypeLabels[a.session.type] ?? a.session.type}
              </TableCell>
              <TableCell>
                <Badge variant={ataStatusTone(a.status)}>
                  {ataStatusLabels[a.status] ?? a.status}
                </Badge>
              </TableCell>
              <TableCell>
                <Link className="text-sm underline" href={`/secretaria/atas/${a.id}`}>
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
