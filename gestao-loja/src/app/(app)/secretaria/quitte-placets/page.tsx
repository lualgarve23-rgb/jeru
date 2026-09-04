import { InfoDica } from "@/components/info-dica";
import { AJUDA } from "@/lib/ajuda";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { canWriteSecretaria } from "@/lib/permissions";
import { bloqueioAssinaturaQuitte, assinaturasQuitte } from "@/lib/quitte";
import { LinhaDoTempo } from "@/components/linha-do-tempo";
import {
  requestQuittePlacet,
  refreshQuitacaoFinanceira,
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

// Campo de anexo da carta de próprio punho — obrigatório em todo pedido
function CampoCarta({ id }: { id: string }) {
  return (
    <div className="space-y-1">
      <Label htmlFor={id}>Carta de próprio punho (foto ou PDF)</Label>
      <Input id={id} name="carta" type="file" accept=".pdf,.jpg,.jpeg,.png" required />
      <p className="text-xs text-muted-foreground">
        Foto da carta escrita a próprio punho e assinada pelo irmão — sem ela o
        pedido não é registrado e as assinaturas ficam bloqueadas.
      </p>
    </div>
  );
}

export default async function QuittePlacetsPage() {
  const user = await requireUser();
  const isWriter = canWriteSecretaria(user.role);
  const isFiscal = ["SECRETARIO", "VENERAVEL_MESTRE", "CONSELHO_CONTAS"].includes(
    user.role
  );
  const canSign = user.role === "VENERAVEL_MESTRE" || user.role === "SECRETARIO";

  const [placets, members] = await Promise.all([
    // select explícito: os anexos (Bytes) não vêm para a listagem — govbrPdf
    // entra só como flag de existência via _count? não há; usamos os campos-nome
    prisma.quittePlacet.findMany({
      // Fiscais veem todos os processos; o irmão comum, apenas os próprios
      where: {
        lodgeId: user.lodgeId,
        ...(isFiscal ? {} : { userId: user.id }),
      },
      orderBy: { dataSolicitacao: "desc" },
      select: {
        id: true,
        status: true,
        motivo: true,
        dataSolicitacao: true,
        quitacaoFinanceira: true,
        signedByMasterId: true,
        signedByMasterAt: true,
        signedBySecId: true,
        signedBySecAt: true,
        signedByOradorId: true,
        signedByOradorAt: true,
        dataSessaoComunicacao: true,
        ataNome: true,
        formularioNome: true,
        formularioMime: true,
        formularioEnviadoAt: true,
        cartaNome: true,
        userId: true,
        user: { select: { name: true, cim: true } },
      },
    }),
    isWriter
      ? prisma.user.findMany({
          where: { lodgeId: user.lodgeId },
          orderBy: { name: "asc" },
          select: { id: true, name: true, cim: true },
        })
      : [],
  ]);

  const meuAberto = placets.some(
    (p) =>
      p.userId === user.id &&
      (p.status === "PENDENTE" || p.status === "EM_ANALISE")
  );

  return (
    <div className="space-y-6">
      <h1 className="flex items-center gap-1 text-2xl font-bold">Quitte Placets<InfoDica titulo="Quitte Placets" texto={AJUDA.quitte} /></h1>

      {canSign && (
        <p className="rounded-md border border-sky-200 bg-sky-50 p-3 text-sm text-sky-900">
          A assinatura gov.br do Form. 122 é feita na aba{" "}
          <a href="/secretaria/processos" className="font-medium underline">
            Processos
          </a>
          . Aqui fica a triagem: carta, Nada Consta e anexo do formulário.
        </p>
      )}

      {isWriter ? (
        <Card className="max-w-xl">
          <CardHeader>
            <CardTitle>Nova solicitação</CardTitle>
            <CardDescription>
              A carta escrita a próprio punho e assinada pelo irmão é
              obrigatória no pedido.
            </CardDescription>
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
              <CampoCarta id="carta" />
            </ActionForm>
          </CardContent>
        </Card>
      ) : (
        <Card className="max-w-xl">
          <CardHeader>
            <CardTitle>Meu Quitte Placet</CardTitle>
            <CardDescription>
              Solicite aqui o seu Quitte Placet anexando a carta escrita a
              próprio punho e assinada. O pedido segue para a análise da
              Secretaria, o Nada Consta da Tesouraria e as assinaturas gov.br
              do Secretário, do Orador e do Venerável Mestre.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {meuAberto ? (
              <p className="text-sm text-muted-foreground">
                Você já tem um Quitte Placet em andamento — acompanhe o andamento
                abaixo.
              </p>
            ) : (
              <ActionForm action={requestQuittePlacet} submitLabel="Solicitar">
                <div className="space-y-1">
                  <Label htmlFor="motivo">Motivo</Label>
                  <textarea
                    id="motivo"
                    name="motivo"
                    rows={2}
                    className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                  />
                </div>
                <CampoCarta id="carta" />
              </ActionForm>
            )}
          </CardContent>
        </Card>
      )}

      {isFiscal && (
        <div>
          <h2 className="mb-2 text-lg font-semibold">Andamento dos processos</h2>
          <p className="mb-3 text-sm text-muted-foreground">
            {isWriter
              ? "Arraste o card para “Em análise” ao iniciar o processo. A aprovação sai das duas assinaturas gov.br (Secretário e, por último, Venerável Mestre); “Negado” encerra o pedido. Clique no card para abrir a documentação (Form. 122)."
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
              assinaturas: assinaturasQuitte(p),
              temFormulario: Boolean(p.formularioNome),
              enviadoGSelos: Boolean(p.formularioEnviadoAt),
              dataSolicitacao: p.dataSolicitacao.toLocaleDateString("pt-BR"),
            }))}
          />
        </div>
      )}

      {!isFiscal && (
        <Card className="max-w-xl">
          <CardHeader>
            <CardTitle>Andamento</CardTitle>
            <CardDescription>
              Acompanhe com quem o seu pedido está pendente. Quando o Venerável
              Mestre assinar, o documento é enviado à Guarda dos Selos.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {placets.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Nenhuma solicitação registrada.
              </p>
            ) : (
              <ul className="divide-y rounded-md border">
                {placets.map((p) => {
                  const negado = p.status === "NEGADO";
                  const concluido = p.status === "APROVADO";
                  const etapas = [
                    { cargo: "Carta entregue", at: null, feito: !!p.cartaNome },
                    { cargo: "Nada Consta (Tesouraria)", at: null, feito: p.quitacaoFinanceira },
                    { cargo: "Comunicação em sessão + ata (Secretaria)", at: null, feito: !!p.dataSessaoComunicacao && !!p.ataNome },
                    { cargo: "Form. 122 (Secretaria)", at: null, feito: !!p.formularioNome },
                    { cargo: "Secretário", at: p.signedBySecAt },
                    { cargo: "Orador", at: p.signedByOradorAt },
                    { cargo: "Venerável Mestre", at: p.signedByMasterAt },
                    { cargo: "Guarda dos Selos", at: p.formularioEnviadoAt },
                  ];
                  const pendenteCom = etapas.find((e) => !(e.feito ?? !!e.at))?.cargo;
                  return (
                    <li key={p.id} className="space-y-2 p-3 text-sm">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span>
                          Solicitado em{" "}
                          {p.dataSolicitacao.toLocaleDateString("pt-BR")}
                        </span>
                        <span className="flex items-center gap-2">
                          <Badge variant={statusPlacetTone(p.status)}>
                            {negado
                              ? statusPlacetLabels[p.status]
                              : p.formularioEnviadoAt
                                ? "Enviado à Guarda dos Selos"
                                : concluido
                                  ? "Assinado — aguardando envio"
                                  : `Pendente com: ${pendenteCom}`}
                          </Badge>
                          {concluido && p.formularioNome && (
                            <Button asChild size="sm" variant="outline">
                              <a href={`/secretaria/quitte-placets/formulario/${p.id}`}>
                                Baixar documento
                              </a>
                            </Button>
                          )}
                        </span>
                      </div>
                      {!negado && (
                        <LinhaDoTempo
                          etapas={etapas}
                          concluido={!!p.formularioEnviadoAt}
                        />
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>
      )}

      {isFiscal && (
        <Card>
          <CardContent className="pt-6">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Obreiro</TableHead>
                  <TableHead>Carta</TableHead>
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
                      {p.cartaNome ? (
                        <a
                          href={`/secretaria/quitte-placets/carta/${p.id}`}
                          className="text-xs font-medium text-primary hover:underline"
                        >
                          Ver carta
                        </a>
                      ) : (
                        <Badge variant="warning">Sem carta</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant={p.quitacaoFinanceira ? "success" : "warning"}>
                        {p.quitacaoFinanceira ? "Nada Consta" : "Pendências"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs">
                      <span aria-hidden="true">
                        Sec {p.signedBySecId ? "✓" : "—"} · Or{" "}
                        {p.signedByOradorId ? "✓" : "—"} · VM{" "}
                        {p.signedByMasterId ? "✓" : "—"}
                      </span>
                      <span className="sr-only">
                        Secretário {p.signedBySecId ? "assinou" : "não assinou"};
                        Orador {p.signedByOradorId ? "assinou" : "não assinou"};
                        Venerável Mestre{" "}
                        {p.signedByMasterId ? "assinou" : "não assinou"}
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
                    <TableCell colSpan={6} className="text-center text-muted-foreground">
                      Nenhuma solicitação registrada.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {isWriter && placets.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Formulário oficial (Form. 122)</CardTitle>
            <CardDescription>
              Baixe o formulário já preenchido com os dados da Loja e do
              obreiro e anexe-o em PDF. As assinaturas gov.br (Secretário e,
              por último, Venerável Mestre) são colhidas na aba Processos; só
              então o documento pode ser enviado à Guarda dos Selos ({GUARDA_SELOS_EMAIL}).
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {placets
              .filter((p) => p.status !== "NEGADO")
              .map((p) => {
                const bloqueio = bloqueioAssinaturaQuitte({
                  status: p.status,
                  quitacaoFinanceira: p.quitacaoFinanceira,
                  cartaNome: p.cartaNome,
                  dataSessaoComunicacao: p.dataSessaoComunicacao,
                  ataNome: p.ataNome,
                  formularioNome: p.formularioNome,
                  formularioMime: p.formularioMime,
                  // o PDF gov.br em si não vem à listagem; a existência de
                  // assinatura registrada implica a existência dele
                  govbrPdf: assinaturasQuitte(p) > 0 ? Buffer.alloc(1) : null,
                });
                return (
                <div
                  key={p.id}
                  id={`form-placet-${p.id}`}
                  className="scroll-mt-20 space-y-3 rounded-lg border p-4 target:ring-2 target:ring-primary"
                >
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
                          Baixar anexo
                        </a>
                      </Button>
                    )}
                    {p.cartaNome && (
                      <Button asChild variant="outline">
                        <a href={`/secretaria/quitte-placets/carta/${p.id}`}>
                          Ver carta do irmão
                        </a>
                      </Button>
                    )}
                    {isWriter && p.formularioNome && p.status === "APROVADO" && (
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

                  {bloqueio && p.status !== "APROVADO" && (
                    <p className="rounded-md border border-amber-200 bg-amber-50 p-2 text-xs text-amber-800">
                      {bloqueio}
                    </p>
                  )}
                  {!bloqueio && p.status !== "APROVADO" && (
                    <p className="text-xs text-muted-foreground">
                      Pronto para assinatura — Secretário e Venerável Mestre
                      assinam na aba{" "}
                      <a href="/secretaria/processos" className="font-medium text-primary hover:underline">
                        Processos
                      </a>
                      .
                    </p>
                  )}

                  {isWriter && p.status !== "APROVADO" && (
                    <ActionForm
                      action={anexarFormularioQuittePlacet.bind(null, p.id)}
                      submitLabel={
                        p.formularioNome
                          ? "Substituir formulário"
                          : "Anexar formulário (PDF)"
                      }
                    >
                      <div className="space-y-1">
                        <Label htmlFor={`arquivo-${p.id}`}>
                          Form. 122 preenchido — em PDF ou Word (.docx, convertido automaticamente), para receber as
                          assinaturas gov.br
                          {p.formularioNome &&
                            " (substituir invalida assinaturas já colhidas)"}
                        </Label>
                        <Input
                          id={`arquivo-${p.id}`}
                          name="arquivo"
                          type="file"
                          accept=".pdf,.docx"
                          required
                        />
                      </div>
                    </ActionForm>
                  )}
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
