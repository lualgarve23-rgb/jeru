import { notFound } from "next/navigation";
import QRCode from "qrcode";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { canWriteSecretaria } from "@/lib/permissions";
import {
  registerAttendance,
  createAta,
  atualizarPresencasAta,
  desmarcarPresenca,
  justificarAusencia,
  desfazerJustificativa,
  reenviarCertificadoVisita,
  dispararConvitesEmail,
  updateSessionPauta,
} from "../../actions";
import { CopyButton } from "@/components/copy-button";
import { ActionForm, ActionButton } from "@/components/action-form";
import { Label } from "@/components/ui/label";
import { sessionTypeLabels, degreeLabels } from "@/lib/labels";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { frequenciaAnual, MIN_SESSOES_PARA_ALERTA } from "@/lib/frequencia";
import { InfoDica } from "@/components/info-dica";
import { AJUDA } from "@/lib/ajuda";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import Link from "next/link";

export default async function SessaoPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireUser();
  const { id } = await params;
  const session = await prisma.lodgeSession.findUnique({
    where: { id, lodgeId: user.lodgeId },
    include: {
      attendances: { include: { user: true }, orderBy: { checkedInAt: "asc" } },
      ata: true,
    },
  });
  if (!session) notFound();

  const isWriter = canWriteSecretaria(user.role);
  const baseUrl = process.env.APP_URL ?? "http://localhost:3100";
  // Tokens de check-in/convite só para quem opera a sessão (não vazam no RSC)
  const checkinUrl = isWriter
    ? `${baseUrl}/checkin/${session.qrToken}`
    : null;
  const inviteUrl = isWriter
    ? `${baseUrl}/convite/${session.inviteToken}`
    : null;
  const qrDataUrl = checkinUrl
    ? await QRCode.toDataURL(checkinUrl, { width: 240 })
    : null;

  // RSVP pelo convite: confirmados (antes do dia) e total do Ágape
  const confirmados = session.attendances.filter((a) => a.rsvpAt);
  const agapeTotal = session.attendances.filter(
    (a) => a.agapeConfirmed
  ).length;

  const members = isWriter
    ? await prisma.user.findMany({
        where: {
          lodgeId: user.lodgeId,
          status: "ATIVO",
          id: {
            notIn: session.attendances.flatMap((a) =>
              a.userId && a.checkedIn ? [a.userId] : []
            ),
          },
        },
        orderBy: { name: "asc" },
      })
    : [];

  const attendanceAction = registerAttendance.bind(null, session.id);
  const createAtaAction = createAta.bind(null, session.id);
  const ataEditavel =
    !!session.ata &&
    session.ata.status !== "AGUARDANDO_ASSINATURAS" &&
    session.ata.status !== "ASSINADA" &&
    !session.ata.signedByMasterId &&
    !session.ata.signedBySecId &&
    !session.ata.govbrUploadedAt;

  // Tabela de presenças: irmãos do quadro que podiam assistir à sessão
  // (grau ≥ grau da sessão), com a frequência anual e alerta de mínimo legal
  const DEGREE_RANK: Record<string, number> = {
    APRENDIZ: 1,
    COMPANHEIRO: 2,
    MESTRE: 3,
  };
  const ano = session.date.getFullYear();
  const [quadro, freq, lodgeCfg] = await Promise.all([
    prisma.user.findMany({
      where: {
        lodgeId: user.lodgeId,
        status: { in: ["ATIVO", "IRREGULAR"] },
        currentRole: { not: "SUPER_ADMIN" },
      },
      orderBy: { name: "asc" },
      select: { id: true, name: true, cim: true, degree: true, cargoRito: true },
    }),
    frequenciaAnual(user.lodgeId, ano),
    prisma.lodge.findUniqueOrThrow({
      where: { id: user.lodgeId },
      select: { minFreqProgressao: true },
    }),
  ]);
  const freqPorMembro = new Map(freq.map((f) => [f.userId, f]));
  const presentes = new Set(
    session.attendances.flatMap((a) =>
      a.userId && a.checkedIn ? [a.userId] : []
    )
  );
  const linhas = quadro.filter(
    (m) => (DEGREE_RANK[m.degree] ?? 3) >= (DEGREE_RANK[session.degree] ?? 1)
  );
  const minFreq = lodgeCfg.minFreqProgressao;

  // Ausências justificadas: registro sem check-in marcado como justificado
  const justificadas = new Map(
    session.attendances
      .filter((a) => a.userId && a.justificado && !a.checkedIn)
      .map((a) => [a.userId!, a])
  );
  // Combo de justificativa: irmãos do quadro que ainda não estão presentes
  const podemJustificar = linhas.filter(
    (m) => !presentes.has(m.id) && !justificadas.has(m.id)
  );

  // Situação da frequência: alerta legal para Aprendizes e Companheiros
  function situacaoFreq(m: (typeof linhas)[number]) {
    const f = freqPorMembro.get(m.id);
    if (!f || f.percentual === null) return null;
    const texto = `${f.percentual}% (${f.presencas}/${f.sessoesComputadas})`;
    if (
      m.degree === "MESTRE" ||
      f.sessoesComputadas < MIN_SESSOES_PARA_ALERTA
    ) {
      return { texto, tone: null as string | null };
    }
    if (f.percentual < minFreq) return { texto, tone: "vermelho" };
    if (f.percentual < minFreq + 10) return { texto, tone: "amarelo" };
    return { texto, tone: "ok" };
  }
  const visitantes = session.attendances.filter((a) => !a.user && a.checkedIn);
  const visitantesConfirmados = session.attendances.filter(
    (a) => !a.user && !a.checkedIn
  );

  return (
    <div className="max-w-3xl space-y-6">
      <h1 className="text-2xl font-bold">
        Sessão {sessionTypeLabels[session.type] ?? session.type} —{" "}
        {session.date.toLocaleDateString("pt-BR")}{" "}
        <span className="text-base font-normal text-muted-foreground">
          (grau {degreeLabels[session.degree] ?? session.degree})
        </span>
      </h1>

      {isWriter && (
        <Card>
          <CardHeader>
            <CardTitle>Convite da Sessão (RSVP + Ágape)</CardTitle>
            <CardDescription>
              Compartilhe o link do convite para os irmãos e visitantes
              confirmarem presença — e o Ágape — antes da sessão.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <ActionForm action={updateSessionPauta.bind(null, session.id)} submitLabel="Salvar pauta">
              <div className="space-y-1">
                <Label htmlFor="pauta">Pauta do dia</Label>
                <textarea
                  id="pauta"
                  name="pauta"
                  rows={3}
                  defaultValue={session.pauta ?? ""}
                  placeholder="assuntos da sessão — sai no convite e pré-preenche a Ata"
                  className="w-full rounded-md border bg-transparent p-2 text-sm"
                />
              </div>
            </ActionForm>
            <div className="flex flex-wrap items-center gap-3">
              <CopyButton text={inviteUrl!} label="Copiar link do convite" />
              <ActionButton
                action={dispararConvitesEmail.bind(null, session.id)}
                label="Disparar convites por e-mail"
                variant="secondary"
              />
            </div>
            <p className="break-all text-xs text-muted-foreground">
              {inviteUrl}
            </p>
            <div className="flex gap-3 text-sm">
              <Badge variant="secondary">
                {confirmados.length} presença(s) confirmada(s)
              </Badge>
              <Badge className="border-amber-200 bg-amber-50 text-warning">
                {agapeTotal} para o Ágape
              </Badge>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        {isWriter && checkinUrl && qrDataUrl && (
        <Card>
          <CardHeader>
            <CardTitle>Check-in via QR Code</CardTitle>
            <CardDescription>
              Exiba este QR no salão — membros e visitantes escaneiam para
              registrar presença. O link não fica visível para obreiros comuns.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={qrDataUrl} alt="QR Code de check-in" />
            <p className="break-all text-xs text-muted-foreground">{checkinUrl}</p>
          </CardContent>
        </Card>
        )}

        {isWriter && (
          <Card>
            <CardHeader>
              <CardTitle>Registrar presença manual</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <ActionForm action={attendanceAction} submitLabel="Registrar">
                <div className="space-y-1">
                  <Label htmlFor="memberId">Membro</Label>
                  <select
                    id="memberId"
                    name="memberId"
                    className="h-9 w-full rounded-md border bg-transparent px-2 text-sm"
                  >
                    {members.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name} (CIM {m.cim})
                      </option>
                    ))}
                  </select>
                </div>
              </ActionForm>
              {!session.ata ? (
                <details className="rounded-md border">
                  <summary className="cursor-pointer px-4 py-3 text-sm font-medium">
                    Lavrar Ata desta sessão
                  </summary>
                  <form action={createAtaAction} className="space-y-3 border-t p-4">
                    <p className="text-xs text-muted-foreground">
                      Preencha os campos abaixo para gerar o rascunho já
                      completo. Campos em branco saem como ____ no texto, para
                      completar depois no editor.
                    </p>
                    {(
                      [
                        ["pautaDoDia", "Pauta do dia (lida pelo Secretário)"],
                        ["detalhamentos", "Detalhamentos da Sessão"],
                        [
                          "ausenciasJustificadas",
                          "Irmãos que justificaram ausência",
                        ],
                      ] as const
                    ).map(([name, label]) => (
                      <div key={name} className="space-y-1">
                        <Label htmlFor={name}>{label}</Label>
                        <textarea
                          id={name}
                          name={name}
                          rows={name === "detalhamentos" ? 6 : name === "pautaDoDia" ? 3 : 2}
                          defaultValue={
                            name === "pautaDoDia"
                              ? session.pauta ?? ""
                              : name === "ausenciasJustificadas"
                                ? [...justificadas.values()]
                                    .map((a) => a.user?.name)
                                    .filter(Boolean)
                                    .join(", ")
                                : ""
                          }
                          className="w-full rounded-md border bg-transparent p-2 text-sm"
                        />
                      </div>
                    ))}
                    <div className="space-y-1">
                      <Label htmlFor="horaEncerramento">
                        Horário de encerramento (por extenso)
                      </Label>
                      <input
                        id="horaEncerramento"
                        name="horaEncerramento"
                        placeholder="ex.: vinte e duas horas"
                        className="h-9 w-full rounded-md border bg-transparent px-2 text-sm"
                      />
                    </div>
                    <Button variant="secondary" type="submit">
                      Gerar rascunho da Ata
                    </Button>
                  </form>
                </details>
              ) : (
                <div className="space-y-2">
                  <div className="flex flex-wrap gap-3">
                    <Button asChild variant="secondary">
                      <Link href={`/secretaria/atas/${session.ata.id}`}>
                        Abrir Ata nº {session.ata.number}
                      </Link>
                    </Button>
                    {ataEditavel && (
                      <ActionButton
                        action={atualizarPresencasAta.bind(null, session.id)}
                        label="Atualizar rascunho com as presenças"
                        variant="outline"
                      />
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {ataEditavel
                      ? "Registrou presenças depois de gerar o rascunho? Atualize a ata sem perder o texto já editado."
                      : "Ata liberada para assinaturas — as presenças não podem mais ser alteradas."}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>

      {isWriter && (
        <Card>
          <CardHeader>
            <CardTitle>Justificar ausência</CardTitle>
            <CardDescription>
              Irmãos que avisaram que não poderiam comparecer. A ausência
              justificada aparece com a tag <strong>Justificado</strong> no
              livro, não conta como presença na frequência e entra no trecho
              da ata &quot;Os seguintes irmãos justificaram ausência&quot;.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {podemJustificar.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Todos os irmãos do quadro já estão presentes ou com ausência
                justificada.
              </p>
            ) : (
              <ActionForm
                action={justificarAusencia.bind(null, session.id)}
                submitLabel="Registrar justificativa"
              >
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1">
                    <Label htmlFor="memberIdJustifica">Irmão</Label>
                    <select
                      id="memberIdJustifica"
                      name="memberId"
                      required
                      className="h-9 w-full rounded-md border bg-transparent px-2 text-sm"
                    >
                      <option value="">Selecione...</option>
                      {podemJustificar.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.name} (CIM {m.cim})
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="justificativa">Motivo (opcional)</Label>
                    <input
                      id="justificativa"
                      name="justificativa"
                      maxLength={300}
                      placeholder="ex.: viagem de trabalho"
                      className="h-9 w-full rounded-md border bg-transparent px-2 text-sm"
                    />
                  </div>
                </div>
              </ActionForm>
            )}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-1">
            Livro de Presenças ({presentes.size} de {linhas.length} irmãos
            {justificadas.size > 0
              ? `, ${justificadas.size} justificada(s)`
              : ""}
            )
            <InfoDica titulo="Frequência" texto={AJUDA.frequencia} />
          </CardTitle>
          <CardDescription>
            Frequência acumulada em {ano} — mínimo da Loja para progressão:{" "}
            {minFreq}%. O alerta legal vale para Aprendizes e Companheiros.{" "}
            <Link
              href={`/secretaria/sessoes/export?ano=${ano}`}
              className="font-medium text-primary hover:underline"
            >
              Exportar frequência anual (CSV)
            </Link>
          </CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Irmão</TableHead>
                <TableHead>Grau</TableHead>
                <TableHead>Cargo</TableHead>
                <TableHead>Presença</TableHead>
                <TableHead>Frequência {ano}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {linhas.map((m) => {
                const att = session.attendances.find((a) => a.userId === m.id);
                const sf = situacaoFreq(m);
                return (
                  <TableRow key={m.id}>
                    <TableCell className="font-medium">
                      {m.name}
                      <span className="text-muted-foreground"> · CIM {m.cim}</span>
                    </TableCell>
                    <TableCell>{degreeLabels[m.degree] ?? m.degree}</TableCell>
                    <TableCell>{m.cargoRito ?? "—"}</TableCell>
                    <TableCell>
                      {att?.checkedIn ? (
                        <span className="inline-flex flex-wrap items-center gap-2">
                          <Badge variant="success">
                            Presente
                            {att.viaQrCode ? " · QR" : ""}
                            {" às "}
                            {att.checkedInAt.toLocaleTimeString("pt-BR", {
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                            {att.agapeConfirmed ? " · Ágape" : ""}
                          </Badge>
                          {isWriter && (!session.ata || ataEditavel) && (
                            <ActionButton
                              action={desmarcarPresenca.bind(null, att.id)}
                              label="Desfazer"
                              variant="outline"
                            />
                          )}
                        </span>
                      ) : att?.justificado ? (
                        <span className="inline-flex flex-wrap items-center gap-2">
                          <Badge className="border-violet-200 bg-violet-50 text-violet-700">
                            Justificado
                          </Badge>
                          {att.justificativa && (
                            <span className="text-xs text-muted-foreground">
                              {att.justificativa}
                            </span>
                          )}
                          {isWriter && (!session.ata || ataEditavel) && (
                            <ActionButton
                              action={desfazerJustificativa.bind(null, att.id)}
                              label="Desfazer"
                              variant="outline"
                            />
                          )}
                        </span>
                      ) : att ? (
                        <Badge className="border-blue-200 bg-blue-50 text-blue-700">
                          Confirmado{att.agapeConfirmed ? " · Ágape" : ""}
                        </Badge>
                      ) : (
                        <Badge variant="secondary">Ausente</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      {sf ? (
                        sf.tone === "vermelho" ? (
                          <Badge variant="warning">
                            {sf.texto} — abaixo do mínimo
                          </Badge>
                        ) : sf.tone === "amarelo" ? (
                          <Badge className="border-amber-200 bg-amber-50 text-warning">
                            {sf.texto} — perto do mínimo
                          </Badge>
                        ) : sf.tone === "ok" ? (
                          <Badge variant="success">{sf.texto}</Badge>
                        ) : (
                          <span className="text-sm">{sf.texto}</span>
                        )
                      ) : (
                        <span className="text-sm text-muted-foreground">—</span>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
              {linhas.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-muted-foreground">
                    Nenhum irmão do quadro pode ser computado nesta sessão.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {visitantesConfirmados.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>
              Visitantes confirmados pelo convite ({visitantesConfirmados.length})
            </CardTitle>
            <CardDescription>
              Ainda não fizeram o check-in do dia da sessão.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="space-y-1 text-sm">
              {visitantesConfirmados.map((a) => (
                <li key={a.id}>
                  {a.visitorName}
                  {a.visitorLodge ? ` · ${a.visitorLodge}` : ""}
                  {a.visitorPotencia ? ` / ${a.visitorPotencia}` : ""}
                  {a.agapeConfirmed && (
                    <Badge className="ml-2 border-amber-200 bg-amber-50 text-warning">
                      Ágape
                    </Badge>
                  )}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {visitantes.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Visitantes ({visitantes.length})</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-1 text-sm">
              {visitantes.map((a) => (
                <li key={a.id}>
                  {a.visitorName} — visitante
                  {a.visitorLodge ? ` · ${a.visitorLodge}` : ""}
                  {a.visitorPotencia ? ` / ${a.visitorPotencia}` : ""}
                  {a.viaQrCode ? " · via QR" : ""}
                  <span className="text-muted-foreground">
                    {" "}
                    às {a.checkedInAt.toLocaleTimeString("pt-BR")}
                  </span>
                  {a.visitorEmail && isWriter && (
                    <span className="ml-2 inline-flex align-middle">
                      <ActionButton
                        action={reenviarCertificadoVisita.bind(null, a.id)}
                        label="Enviar Certificado de Visita"
                        variant="outline"
                      />
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
