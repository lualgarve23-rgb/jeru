import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { canWriteSecretaria } from "@/lib/permissions";
import { isDriveConfigured } from "@/lib/google-drive";
import { uploadDocument } from "../actions";
import { ActionForm } from "@/components/action-form";
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
  const docs = await prisma.document.findMany({
    where: { lodgeId: user.lodgeId },
    orderBy: { createdAt: "desc" },
    include: { uploadedBy: true },
  });

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Documentos — Google Drive da Loja</h1>

      {canWriteSecretaria(user.role) && (
        <Card className="max-w-xl">
          <CardHeader>
            <CardTitle>Upload para o Drive</CardTitle>
            <CardDescription>
              {isDriveConfigured()
                ? "O arquivo será salvo na pasta da Loja no Google Drive."
                : "⚠️ Google Drive não configurado — defina GOOGLE_SERVICE_ACCOUNT_EMAIL e GOOGLE_SERVICE_ACCOUNT_KEY no .env."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ActionForm action={uploadDocument} submitLabel="Enviar ao Drive">
              <div className="space-y-1">
                <Label htmlFor="title">Título</Label>
                <Input id="title" name="title" required />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label htmlFor="type">Tipo</Label>
                  <select
                    id="type"
                    name="type"
                    className="h-9 w-full rounded-md border bg-transparent px-2 text-sm"
                  >
                    <option value="ATA_ESCANEADA">Ata escaneada</option>
                    <option value="HISTORICO">Histórico</option>
                    <option value="REGULAMENTO">Regulamento</option>
                    <option value="FINANCEIRO">Financeiro</option>
                    <option value="OUTRO">Outro</option>
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
              <TableCell>{d.type}</TableCell>
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
