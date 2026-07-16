import { InfoDica } from "@/components/info-dica";
import { AJUDA } from "@/lib/ajuda";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { canWriteSecretaria } from "@/lib/permissions";
import { isDriveAvailable } from "@/lib/google-drive";
import { uploadDocument } from "../actions";
import { ActionForm } from "@/components/action-form";
import { documentTypeLabels } from "@/lib/labels";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
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

export default async function DocumentosPage() {
  const user = await requireRole(
    "SECRETARIO",
    "VENERAVEL_MESTRE",
    "CONSELHO_CONTAS"
  );
  const driveOk = await isDriveAvailable(user.lodgeId);
  const docs = await prisma.document.findMany({
    where: { lodgeId: user.lodgeId },
    orderBy: { createdAt: "desc" },
    include: { uploadedBy: true },
  });

  return (
    <div className="space-y-6">
      <h1 className="flex items-center gap-1 text-2xl font-bold">Documentos — Google Drive da Loja<InfoDica titulo="Documentos — Google Drive da Loja" texto={AJUDA.documentos} /></h1>

      {canWriteSecretaria(user.role) && (
        <Card className="max-w-xl">
          <CardHeader>
            <CardTitle>Upload para o Drive</CardTitle>
            <CardDescription>
              {driveOk
                ? "O arquivo será salvo na pasta da Loja no Google Drive."
                : "⚠️ Google Drive não conectado — conecte a conta Google da Loja em Configurações da Loja."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ActionForm action={uploadDocument} submitLabel="Enviar ao Drive">
              <div className="space-y-1">
                <Label htmlFor="title">Título</Label>
                <Input id="title" name="title" required />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label htmlFor="type">Tipo</Label>
                  <select
                    id="type"
                    name="type"
                    className="h-9 w-full rounded-md border bg-transparent px-2 text-sm"
                  >
                    {Object.entries(documentTypeLabels).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1">
                  <Label htmlFor="file">Arquivo</Label>
                  <Input id="file" name="file" type="file" required />
                </div>
              </div>
            </ActionForm>
          </CardContent>
        </Card>
      )}

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Título</TableHead>
            <TableHead>Tipo</TableHead>
            <TableHead>Enviado por</TableHead>
            <TableHead>Data</TableHead>
            <TableHead>Drive</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {docs.map((d) => (
            <TableRow key={d.id}>
              <TableCell>{d.title}</TableCell>
              <TableCell>{documentTypeLabels[d.type] ?? d.type}</TableCell>
              <TableCell>{d.uploadedBy.name}</TableCell>
              <TableCell>{d.createdAt.toLocaleDateString("pt-BR")}</TableCell>
              <TableCell>
                <a
                  className="text-sm underline"
                  href={`https://drive.google.com/file/d/${d.driveFileId}/view`}
                  target="_blank"
                >
                  Abrir no Drive
                </a>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
