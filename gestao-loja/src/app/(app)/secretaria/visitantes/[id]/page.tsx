import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import {
  atualizarVisitante,
  excluirVisitante,
  mesclarVisitantes,
  reenviarCertificadoVisita,
} from "../../actions";
import { ActionForm, ActionButton } from "@/components/action-form";
import { WhatsAppCertificadoButton } from "@/components/whatsapp-certificado-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { sessionTypeLabels } from "@/lib/labels";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default async function VisitanteFichaPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireRole("SECRETARIO", "VENERAVEL_MESTRE");
  const { id } = await params;
  const [v, lodge] = await Promise.all([
    prisma.visitante.findUnique({
      where: { id, lodgeId: user.lodgeId },
      include: {
        presencas: {
          include: { session: { select: { id: true, date: true, type: true } } },
          orderBy: { session: { date: "desc" } },
        },
      },
    }),
    prisma.lodge.findUniqueOrThrow({
      where: { id: user.lodgeId },
      select: { name: true },
    }),
  ]);
  if (!v) notFound();
  const outros = await prisma.visitante.findMany({
    where: { lodgeId: user.lodgeId, id: { not: v.id } },
    orderBy: { nome: "asc" },
    select: { id: true, nome: true, lojaOrigem: true, cim: true },
  });
  const visitas = v.presencas.filter((p) => p.checkedIn);
  const confirmacoes = v.presencas.filter((p) => !p.checkedIn);

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <Link
          href="/secretaria/visitantes"
          className="text-sm text-muted-foreground underline-offset-2 hover:underline"
        >
          ← Visitantes
        </Link>
        <h1 className="text-2xl font-bold">{v.nome}</h1>
        <p className="text-sm text-muted-foreground">
          {[v.lojaOrigem, v.potencia, v.oriente].filter(Boolean).join(" · ") ||
            "Loja de origem não informada"}
          {" · "}
          {visitas.length} visita{visitas.length === 1 ? "" : "s"}
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Ficha do visitante</CardTitle>
          <CardDescription>
            Os dados do check-in entram automaticamente; complete o que faltar.
            As observações são internas da Secretaria.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ActionForm action={atualizarVisitante.bind(null, v.id)} submitLabel="Salvar ficha">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1 sm:col-span-2">
                <Label htmlFor="nome">Nome completo</Label>
                <Input id="nome" name="nome" required defaultValue={v.nome} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="cim">CIM</Label>
                <Input id="cim" name="cim" defaultValue={v.cim ?? ""} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="telefone">Telefone / WhatsApp</Label>
                <Input id="telefone" name="telefone" type="tel" defaultValue={v.telefone ?? ""} placeholder="(11) 99999-9999" />
              </div>
              <div className="space-y-1 sm:col-span-2">
                <Label htmlFor="email">E-mail</Label>
                <Input id="email" name="email" type="email" defaultValue={v.email ?? ""} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="lojaOrigem">Loja de origem</Label>
                <Input id="lojaOrigem" name="lojaOrigem" defaultValue={v.lojaOrigem ?? ""} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="potencia">Potência</Label>
                <Input id="potencia" name="potencia" defaultValue={v.potencia ?? ""} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="oriente">Oriente</Label>
                <Input id="oriente" name="oriente" defaultValue={v.oriente ?? ""} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="grau">Grau</Label>
                <Input id="grau" name="grau" defaultValue={v.grau ?? ""} placeholder="ex.: Mestre" />
              </div>
              <div className="space-y-1 sm:col-span-2">
                <Label htmlFor="cargo">Cargo na Loja de origem</Label>
                <Input id="cargo" name="cargo" defaultValue={v.cargo ?? ""} />
              </div>
              <div className="space-y-1 sm:col-span-2">
                <Label htmlFor="observacoes">Observações da Secretaria</Label>
                <textarea
                  id="observacoes"
                  name="observacoes"
                  rows={3}
                  defaultValue={v.observacoes ?? ""}
                  className="w-full rounded-md border bg-transparent px-3 py-2 text-sm"
                  placeholder="ex.: amigo do Ir∴ Fulano; costuma vir nas sessões magnas"
                />
              </div>
            </div>
          </ActionForm>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Histórico de visitas ({visitas.length})</CardTitle>
          <CardDescription>
            Presenças no Livro de Presenças. O Certificado de Visita pode ser
            reenviado por e-mail ou pelo WhatsApp do visitante.
          </CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Data</TableHead>
                <TableHead>Sessão</TableHead>
                <TableHead>Registro</TableHead>
                <TableHead>Certificado</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visitas.map((p) => {
                const tipo = sessionTypeLabels[p.session.type] ?? p.session.type;
                const dataSessao = p.session.date.toLocaleDateString("pt-BR");
                return (
                  <TableRow key={p.id}>
                    <TableCell>{dataSessao}</TableCell>
                    <TableCell>
                      <Link
                        href={`/secretaria/sessoes/${p.session.id}`}
                        className="underline-offset-2 hover:underline"
                      >
                        {tipo}
                      </Link>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {p.viaQrCode ? "QR Code" : "Secretaria"} às{" "}
                      {p.checkedInAt.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-2">
                        <WhatsAppCertificadoButton
                          telefone={p.visitorTelefone ?? v.telefone}
                          nome={v.nome}
                          loja={lodge.name}
                          tipo={tipo}
                          dataSessao={dataSessao}
                          attendanceId={p.id}
                        />
                        {(p.visitorEmail || v.email) && (
                          <ActionButton
                            action={reenviarCertificadoVisita.bind(null, p.id)}
                            label="Enviar por e-mail"
                            variant="outline"
                          />
                        )}
                        {!p.visitorEmail && !v.email && !(p.visitorTelefone ?? v.telefone) && (
                          <span className="text-xs text-muted-foreground">
                            sem e-mail nem telefone
                          </span>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
              {visitas.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="text-muted-foreground">
                    Nenhuma visita registrada ainda.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
          {confirmacoes.length > 0 && (
            <p className="mt-3 text-sm text-muted-foreground">
              Confirmou presença pelo convite, sem check-in:{" "}
              {confirmacoes.map((p) => (
                <Badge key={p.id} variant="outline" className="mr-1">
                  {p.session.date.toLocaleDateString("pt-BR")}
                </Badge>
              ))}
            </p>
          )}
        </CardContent>
      </Card>

      {outros.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Mesclar cadastro duplicado</CardTitle>
            <CardDescription>
              Se o mesmo irmão aparece duas vezes (nome escrito diferente, sem
              CIM), escolha o cadastro duplicado: as visitas dele passam para
              esta ficha e ele é excluído.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ActionForm action={mesclarVisitantes.bind(null, v.id)} submitLabel="Mesclar nesta ficha">
              <div className="space-y-1">
                <Label htmlFor="duplicadoId">Cadastro duplicado</Label>
                <select
                  id="duplicadoId"
                  name="duplicadoId"
                  required
                  className="h-9 w-full rounded-md border bg-transparent px-2 text-sm"
                  defaultValue=""
                >
                  <option value="" disabled>
                    Selecione…
                  </option>
                  {outros.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.nome}
                      {o.lojaOrigem ? ` · ${o.lojaOrigem}` : ""}
                      {o.cim ? ` · CIM ${o.cim}` : ""}
                    </option>
                  ))}
                </select>
              </div>
            </ActionForm>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Excluir ficha</CardTitle>
          <CardDescription>
            As presenças continuam no Livro de Presenças das sessões; só a ficha
            consolidada é removida.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ActionButton
            action={excluirVisitante.bind(null, v.id)}
            label="Excluir visitante"
            variant="destructive"
            confirm={`Excluir a ficha de ${v.nome}?`}
          />
        </CardContent>
      </Card>
    </div>
  );
}
