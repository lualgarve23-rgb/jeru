import { InfoDica } from "@/components/info-dica";
import { AJUDA } from "@/lib/ajuda";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { canWriteSecretaria } from "@/lib/permissions";
import {
  requestQuittePlacet,
  refreshQuitacaoFinanceira,
  signQuittePlacet,
  negarQuittePlacet,
  anexarFormularioQuittePlacet,
  enviarQuittePlacetGSelos,
} from "../actions";
import { ActionForm, ActionButton } from "@/components/action-form";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { QuittePlacetKanban } from "./kanban-board";
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
import { statusPlacetLabels, statusPlacetTone } from "@/lib/labels";
import { GUARDA_SELOS_EMAIL } from "@/lib/gmail";

export default async function QuittePlacetsPage() {
  const user = await requireRole(
    "SECRETARIO",
    "VENERAVEL_MESTRE",
    "CONSELHO_CONTAS"
  );
  const isWriter = canWriteSecretaria(user.role);
  const canSign = user.role === "VENERAVEL_MESTRE" || user.role === "SECRETARIO";

  const [placets, members] = await Promise.all([
    // select explícito: o formulário anexado (Bytes) não vem para a listagem
    prisma.quittePlacet.findMany({
      where: { lodgeId: user.lodgeId },
      orderBy: { dataSolicitacao: "desc" },
      select: {
        id: true,
        status: true,
        motivo: true,
        dataSolicitacao: true,
        quitacaoFinanceira: true,
        signedByMasterId: true,
        signedBySecId: true,
        formularioNome: true,
        formularioEnviadoAt: true,
        userId: true,
        user: { select: { name: true, cim: true } },
      },
    }),
    prisma.user.findMany({
      where: { lodgeId: user.lodgeId },
      orderBy: { name: "asc" },
      select: { id: true, name: true, cim: true },
    }),
  ]);

  return (
    <div className="space-y-6">
      <h1 className="flex items-center gap-1 text-2xl font-bold">Quitte Placets<InfoDica titulo="Quitte Placets" texto={AJUDA.quitte} /></h1>

      {isWriter && (
        <Card className="max-w-xl">
          <CardHeader>
            <CardTitle>Nova solicitação</CardTitle>
          </CardHeader>
          <CardContent>
            <ActionForm action={requestQuittePlacet} submitLabel="Solicitar">
              <div className="space-y-1">
                <Label htmlFor="userId">Obreiro</Label>
                <select
                  id="userId"
                  name="userId"
                  required
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                >
                  <option value="">Selecione...</option>
                  {members.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name} (CIM {m.cim})
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <Label htmlFor="motivo">Motivo</Label>
                <textarea
                  id="motivo"
                  name="motivo"
                  rows={2}
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                />
              </div>
            </ActionForm>
          </CardContent>
        </Card>
      )}

      <div>
        <h2 className="mb-2 text-lg font-semibold">Andamento dos processos</h2>
        <p className="mb-3 text-sm text-muted-foreground">
          {isWriter
            ? "Arraste o card para “Em análise” ao iniciar o processo. A aprovação sai das duas assinaturas; “Negado” encerra o pedido."
            : "Acompanhamento das etapas — a movimentação é feita pela Secretaria."}
        </p>
        <QuittePlacetKanban
          readOnly={!isWriter}
          placets={placets.map((p) => ({
            id: p.id,
            status: p.status,
            memberName: p.user.name,
            memberCim: p.user.cim,
            quitacaoFinanceira: p.quitacaoFinanceira,
            assinaturas:
              (p.signedByMasterId ? 1 : 0) + (p.signedBySecId ? 1 : 0),
            temFormulario: Boolean(p.formularioNome),
            enviadoGSelos: Boolean(p.formularioEnviadoAt),
            dataSolicitacao: p.dataSolicitacao.toLocaleDateString("pt-BR"),
          }))}
        />
      </div>

      <Card>
        <CardContent className="pt-6">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Obreiro</TableHead>
                <TableHead>Nada Consta</TableHead>
                <TableHead>Assinaturas</TableHead>
                <TableHead>Status</TableHead>
                {(isWriter || canSign) && <TableHead>Ações</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {placets.map((p) => (
                <TableRow key={p.id}>
                  <TableCell>
                    {p.user.name}
                    <span className="block text-xs text-muted-foreground">
                      CIM {p.user.cim}
                    </span>
                  </TableCell>
                  <TableCell>
                    <Badge variant={p.quitacaoFinanceira ? "success" : "warning"}>
                      {p.quitacaoFinanceira ? "Nada Consta" : "Pendências"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-xs">
                    <span aria-hidden="true">
                      VM {p.signedByMasterId ? "✓" : "—"} · Sec{" "}
                      {p.signedBySecId ? "✓" : "—"}
                    </span>
                    <span className="sr-only">
                      Venerável Mestre{" "}
                      {p.signedByMasterId ? "assinou" : "não assinou"}; Secretário{" "}
                      {p.signedBySecId ? "assinou" : "não assinou"}
                    </span>
                  </TableCell>
                  <TableCell>
                    <Badge variant={statusPlacetTone(p.status)}>
                      {statusPlacetLabels[p.status]}
                    </Badge>
                  </TableCell>
                  {(isWriter || canSign) && (
                    <TableCell>
                      <div className="flex flex-wrap gap-2">
                      {isWriter && !p.quitacaoFinanceira && (
                        <ActionButton
                          action={refreshQuitacaoFinanceira.bind(null, p.id)}
                          label="Reconsultar Tesouraria"
                          variant="outline"
                        />
                      )}
                      {canSign &&
                        p.status !== "APROVADO" &&
                        p.status !== "NEGADO" && (
                          <ActionButton
                            action={signQuittePlacet.bind(null, p.id)}
                            label="Assinar"
                          />
                        )}
                      {isWriter &&
                        p.status !== "APROVADO" &&
                        p.status !== "NEGADO" && (
                          <ActionButton
                            action={negarQuittePlacet.bind(null, p.id)}
                            label="Negar"
                            variant="destructive"
                          />
                        )}
                      </div>
                    </TableCell>
                  )}
                </TableRow>
              ))}
              {placets.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground">
                    Nenhuma solicitação registrada.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {isWriter && placets.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Formulário oficial (Form. 122)</CardTitle>
            <CardDescription>
              Baixe o formulário já preenchido com os dados da Loja e do
              obreiro, colha as assinaturas, anexe o arquivo assinado e envie à
              Guarda dos Selos ({GUARDA_SELOS_EMAIL}). O envio exige as
              assinaturas do Venerável Mestre e do Secretário.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {placets
              .filter((p) => p.status !== "NEGADO")
              .map((p) => (
                <div key={p.id} className="space-y-3 rounded-lg border p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{p.user.name}</span>
                    <span className="text-xs text-muted-foreground">
                      CIM {p.user.cim}
                    </span>
                    <Badge variant={statusPlacetTone(p.status)}>
                      {statusPlacetLabels[p.status]}
                    </Badge>
                    {p.formularioEnviadoAt && (
                      <Badge variant="success">
                        Enviado à Guarda dos Selos em{" "}
                        {p.formularioEnviadoAt.toLocaleDateString("pt-BR")}
                      </Badge>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-3">
                    <Button asChild variant="outline">
                      <a
                        href={`/secretaria/formularios?arquivo=form-122-quite-placet.docx&obreiroId=${p.userId}`}
                      >
                        Baixar modelo preenchido
                      </a>
                    </Button>
                    {p.formularioNome && (
                      <Button asChild variant="outline">
                        <a href={`/secretaria/quitte-placets/formulario/${p.id}`}>
                          Baixar anexo ({p.formularioNome})
                        </a>
                      </Button>
                    )}
                    {p.formularioNome && p.status === "APROVADO" && (
                      <ActionButton
                        action={enviarQuittePlacetGSelos.bind(null, p.id)}
                        label={
                          p.formularioEnviadoAt
                            ? "Reenviar à Guarda dos Selos"
                            : "Enviar à Guarda dos Selos"
                        }
                        variant="secondary"
                      />
                    )}
                  </div>
                  <ActionForm
                    action={anexarFormularioQuittePlacet.bind(null, p.id)}
                    submitLabel={
                      p.formularioNome
                        ? "Substituir formulário"
                        : "Anexar formulário assinado"
                    }
                  >
                    <div className="space-y-1">
                      <Label htmlFor={`arquivo-${p.id}`}>
                        Formulário assinado (PDF, DOC/DOCX, JPG ou PNG)
                      </Label>
                      <Input
                        id={`arquivo-${p.id}`}
                        name="arquivo"
                        type="file"
                        accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
                        required
                      />
                    </div>
                  </ActionForm>
                </div>
              ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
