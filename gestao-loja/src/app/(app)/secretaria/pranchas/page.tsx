import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { canWriteSecretaria } from "@/lib/permissions";
import {
  createPrancha,
  sendPranchaToGSelos,
  uploadPranchaAssinadaGovbr,
} from "../actions";
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
import { existsSync } from "node:fs";
import { join } from "node:path";
import {
  FORMULARIOS_GOB,
  CATEGORIAS_FORMULARIOS,
} from "@/lib/formularios-gob";
import { Download, FileWarning } from "lucide-react";
import { entradasDoFormulario } from "@/lib/formularios-fill";
import { PreencherFormulario } from "./preencher-formulario";

export default async function PranchasPage() {
  const user = await requireRole(
    "SECRETARIO",
    "VENERAVEL_MESTRE",
    "CONSELHO_CONTAS"
  );
  const isWriter = canWriteSecretaria(user.role);
  const [pranchas, driveDocs, membros] = await Promise.all([
    prisma.prancha.findMany({
      where: { lodgeId: user.lodgeId },
      orderBy: [{ year: "desc" }, { number: "desc" }],
    }),
    prisma.document.findMany({
      where: { lodgeId: user.lodgeId },
      orderBy: { createdAt: "desc" },
      select: { id: true, title: true },
    }),
    prisma.user.findMany({
      where: { lodgeId: user.lodgeId, currentRole: { not: "SUPER_ADMIN" } },
      orderBy: { name: "asc" },
      select: { id: true, name: true, cim: true },
    }),
  ]);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Expedição de Pranchas</h1>

      <Card className="max-w-xl">
        <CardHeader>
          <CardTitle>Formulários obrigatórios do GOB-SP</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Baixe o formulário da categoria correspondente ou use{" "}
            <span className="font-medium">preencher</span> para baixá-lo já com
            os dados da Loja, do Oriente e dos cargos atuais. Complete o que
            faltar no Word e anexe-o à prancha no campo de anexo abaixo.
          </p>
          {CATEGORIAS_FORMULARIOS.map((cat) => (
            <div key={cat} className="space-y-1">
              <p className="text-sm font-medium">{cat}</p>
              <ul className="space-y-1">
                {FORMULARIOS_GOB.filter((f) => f.categoria === cat).map((f) => {
                  const disponivel = existsSync(
                    join(process.cwd(), "public", "formularios-gob", f.arquivo)
                  );
                  return (
                    <li key={f.arquivo} className="flex items-start gap-2 text-sm">
                      {disponivel ? (
                        <Download className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                      ) : (
                        <FileWarning className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                      )}
                      <span>
                        {disponivel ? (
                          <a
                            href={`/formularios-gob/${f.arquivo}`}
                            download
                            className="font-medium underline underline-offset-2"
                          >
                            {f.titulo}
                          </a>
                        ) : (
                          <span className="font-medium">{f.titulo}</span>
                        )}{" "}
                        <span className="text-muted-foreground">
                          — {f.descricao}
                          {!disponivel && " (arquivo indisponível)"}
                        </span>{" "}
                        {disponivel &&
                          isWriter &&
                          (() => {
                            const entradas = entradasDoFormulario(f.arquivo);
                            if (!entradas) return null;
                            return (
                              <PreencherFormulario
                                arquivo={f.arquivo}
                                titulo={f.titulo}
                                membros={membros}
                                {...entradas}
                              />
                            );
                          })()}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
          <p className="text-xs text-muted-foreground">
            Formulários oficiais obtidos no Conecta GOB-SP. Os arquivos Word
            (.doc/.docx) podem ser preenchidos no computador antes de anexar.
          </p>
        </CardContent>
      </Card>

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
                <p className="text-xs text-muted-foreground">
                  Se enviar um arquivo, ele tem prioridade sobre a seleção do
                  Drive. Pranchas com anexo precisam da assinatura gov.br
                  (assinador.iti.br) antes do envio à Guarda dos Selos — o
                  passo aparece na tabela abaixo após a expedição.
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
            <TableHead>Assinatura gov.br</TableHead>
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
                {p.driveFileId || p.govbrSignedAt ? (
                  <span className="flex flex-col gap-0.5 text-sm">
                    <a
                      href={`/api/pranchas/anexo?prancha=${p.id}`}
                      target="_blank"
                      rel="noreferrer"
                      className="underline"
                    >
                      Abrir no aplicativo
                    </a>
                    {p.driveFileId && (
                      <a
                        href={`https://drive.google.com/file/d/${p.driveFileId}/view`}
                        target="_blank"
                        rel="noreferrer"
                        className="text-muted-foreground underline"
                      >
                        Abrir no Drive
                      </a>
                    )}
                  </span>
                ) : (
                  <span className="text-sm text-muted-foreground">—</span>
                )}
              </TableCell>
              <TableCell>
                {p.govbrSignedAt ? (
                  <span className="text-sm text-emerald-700">
                    ✅ assinado em{" "}
                    {p.govbrSignedAt.toLocaleDateString("pt-BR")}
                  </span>
                ) : p.driveFileId ? (
                  isWriter ? (
                    <div className="space-y-1">
                      <p className="text-xs text-muted-foreground">
                        1.{" "}
                        <a
                          href={`/api/pranchas/anexo?prancha=${p.id}`}
                          className="underline"
                        >
                          Baixe o anexo
                        </a>{" "}
                        · 2. Assine em{" "}
                        <a
                          href="https://assinador.iti.br"
                          target="_blank"
                          rel="noreferrer"
                          className="underline"
                        >
                          assinador.iti.br
                        </a>{" "}
                        · 3. Suba o PDF assinado:
                      </p>
                      <ActionForm
                        action={uploadPranchaAssinadaGovbr.bind(null, p.id)}
                        submitLabel="Subir PDF assinado"
                        className="space-y-1"
                      >
                        <Input
                          name="file"
                          type="file"
                          accept="application/pdf"
                          required
                          className="h-8 text-xs"
                        />
                      </ActionForm>
                    </div>
                  ) : (
                    <span className="text-sm text-amber-700">⏳ pendente</span>
                  )
                ) : (
                  <span className="text-sm text-muted-foreground">
                    — sem anexo —
                  </span>
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
      <p className="text-xs text-muted-foreground">
        Envios são feitos pelo Gmail da Loja para {GUARDA_SELOS_EMAIL}.{" "}
        <Link href="/secretaria/emails" className="text-primary underline">
          Abrir a caixa de e-mails da Loja
        </Link>{" "}
        para conferir respostas.
      </p>
    </div>
  );
}
