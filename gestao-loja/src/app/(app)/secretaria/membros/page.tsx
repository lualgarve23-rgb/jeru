import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { canWriteSecretaria } from "@/lib/permissions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  degreeLabels,
  roleLabels,
  memberStatusLabels,
  memberStatusTone,
} from "@/lib/labels";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export default async function MembrosPage() {
  const user = await requireUser();
  const isSecretaria = canWriteSecretaria(user.role);
  const members = await prisma.user.findMany({
    where: { lodgeId: user.lodgeId },
    orderBy: { name: "asc" },
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Quadro de Obreiros</h1>
        {isSecretaria && (
          <Button asChild>
            <Link href="/secretaria/membros/novo">Novo membro</Link>
          </Button>
        )}
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Nome</TableHead>
            <TableHead>CIM</TableHead>
            <TableHead>Grau</TableHead>
            <TableHead>Cargo</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Contato</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {members.map((m) => {
            // LGPD: Secretaria/VM veem tudo; demais membros só o que o
            // próprio obreiro liberou no Painel de Privacidade.
            const canSeeContact =
              isSecretaria || m.id === user.id || m.isDataPublic;
            return (
              <TableRow key={m.id}>
                <TableCell className="font-medium">
                  <span className="flex items-center gap-2">
                    {m.photoUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={m.photoUrl}
                        alt=""
                        className="h-8 w-8 shrink-0 rounded-full border object-cover"
                      />
                    ) : (
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border bg-muted text-xs text-muted-foreground">
                        {m.name.charAt(0)}
                      </span>
                    )}
                    {m.name}
                  </span>
                </TableCell>
                <TableCell>{m.cim}</TableCell>
                <TableCell>{degreeLabels[m.degree] ?? m.degree}</TableCell>
                <TableCell>
                  {m.cargoRito ?? roleLabels[m.currentRole] ?? m.currentRole}
                </TableCell>
                <TableCell>
                  <Badge variant={memberStatusTone(m.status)}>
                    {memberStatusLabels[m.status] ?? m.status}
                  </Badge>
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {canSeeContact ? (
                    <>
                      {(isSecretaria || m.id === user.id || m.showEmail) && m.email}
                      {(isSecretaria || m.id === user.id || m.showPhone) && m.phone
                        ? ` · ${m.phone}`
                        : ""}
                    </>
                  ) : (
                    <span title="Oculto pelo Painel de Privacidade (LGPD)">
                      🔒 privado
                    </span>
                  )}
                </TableCell>
                <TableCell>
                  {isSecretaria && (
                    <Link
                      className="text-sm underline"
                      href={`/secretaria/membros/${m.id}`}
                    >
                      Gerenciar
                    </Link>
                  )}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
