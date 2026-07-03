import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { canWriteSecretaria } from "@/lib/permissions";
import { createPrancha, sendPranchaToGSelos } from "../actions";
import { ActionForm, ActionButton } from "@/components/action-form";
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
import { GUARDA_SELOS_EMAIL } from "@/lib/gmail";

export default async function PranchasPage() {
  const user = await requireRole(
    "SECRETARIO",
    "VENERAVEL_MESTRE",
    "CONSELHO_CONTAS"
  );
  const isWriter = canWriteSecretaria(user.role);
  const [pranchas, driveDocs] = await Promise.all([
    prisma.prancha.findMany({
      where: { lodgeId: user.lodgeId },
      orderBy: [{ year: "desc" }, { number: "desc" }],
    }),
    prisma.document.findMany({
      where: { lodgeId: user.lodgeId },
      orderBy: { createdAt: "desc" },
      select: { id: true, title: true },
    }),
  ]);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Expedição de Pranchas</h1>

      {isWriter && (
        <Card className="max-w-xl">
          <CardHeader>
            <CardTitle>Nova prancha</CardTitle>
          </CardHeader>
          <CardContent>
            <ActionForm action={createPrancha} submitLabel="Expedir (nº automático)">
              <div className="space-y-1">
                <Label htmlFor="recipient">Destinatário</Label>
                <Input id="recipient" name="recipient" required />
              </div>
              <div className="space-y-1">
                <Label htmlFor="subject">Assunto</Label>
                <Input id="subject" name="subject" required />
              </div>
              <div className="space-y-1">
                <Label htmlFor="content">Conteúdo</Label>
                <textarea
                  id="content"
                  name="content"
                  rows={6}
                  className="w-full rounded-md border bg-transparent p-3 text-sm"
                  required
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="file">Anexo — enviar arquivo do computador</Label>
                <Input id="file" name="file" type="file" />
              </div>
              <div className="space-y-1">
                <Label htmlFor="documentId">
                  Ou anexar documento já no Drive da Loja
                </Label>
                <select
                  id="documentId"
                  name="documentId"
                  defaultValue=""
                  className="h-9 w-full rounded-md border bg-transparent px-2 text-sm"
                >
                  <option value="">— nenhum —</option>
                  {driveDocs.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.title}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-neutral-500">
                  Se enviar um arquivo, ele tem prioridade sobre a seleção do
                  Drive.
                </p>
              </div>
            </ActionForm>
          </CardContent>
        </Card>
      )}

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Nº</TableHead>
            <TableHead>Destinatário</TableHead>
            <TableHead>Assunto</TableHead>
            <TableHead>Anexo</TableHead>
            <TableHead>Data</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {pranchas.map((p) => (
            <TableRow key={p.id}>
              <TableCell>
                {p.number}/{p.year}
              </TableCell>
              <TableCell>{p.recipient}</TableCell>
              <TableCell>{p.subject}</TableCell>
              <TableCell>
                {p.driveFileId ? (
                  <a
                    href={`https://drive.google.com/file/d/${p.driveFileId}/view`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-sm underline"
                  >
                    Abrir no Drive
                  </a>
                ) : (
                  <span className="text-sm text-neutral-400">—</span>
                )}
              </TableCell>
              <TableCell>{p.createdAt.toLocaleDateString("pt-BR")}</TableCell>
              <TableCell>
                {isWriter && (
                  <ActionButton
                    action={sendPranchaToGSelos.bind(null, p.id)}
                    variant="outline"
                    label={`Enviar à Guarda dos Selos`}
                  />
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <p className="text-xs text-neutral-500">
        Envios são feitos pelo Gmail da Loja para {GUARDA_SELOS_EMAIL}.
      </p>
    </div>
  );
}
