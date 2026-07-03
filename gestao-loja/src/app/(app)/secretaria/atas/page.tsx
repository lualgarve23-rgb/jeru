import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const statusVariant = {
  RASCUNHO: "secondary",
  AGUARDANDO_ASSINATURAS: "outline",
  ASSINADA: "default",
} as const;

export default async function AtasPage() {
  const user = await requireUser();
  const atas = await prisma.ata.findMany({
    where: { lodgeId: user.lodgeId },
    orderBy: { number: "desc" },
    include: { session: true },
  });

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Livro de Atas (Balaústres)</h1>
      <p className="text-sm text-neutral-500">
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
                {a.session.date.toLocaleDateString("pt-BR")} — {a.session.type}
              </TableCell>
              <TableCell>
                <Badge variant={statusVariant[a.status]}>{a.status}</Badge>
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
