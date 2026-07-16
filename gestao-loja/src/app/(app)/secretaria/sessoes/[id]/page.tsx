import { notFound } from "next/navigation";
import QRCode from "qrcode";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { canWriteSecretaria } from "@/lib/permissions";
import {
  registerAttendance,
  createAta,
  reenviarCertificadoVisita,
} from "../../actions";
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
  const checkinUrl = `${baseUrl}/checkin/${session.qrToken}`;
  const qrDataUrl = await QRCode.toDataURL(checkinUrl, { width: 240 });

  const members = isWriter
    ? await prisma.user.findMany({
        where: {
          lodgeId: user.lodgeId,
          status: "ATIVO",
          id: { notIn: session.attendances.flatMap((a) => a.userId ?? []) },
        },
        orderBy: { name: "asc" },
      })
    : [];

  const attendanceAction = registerAttendance.bind(null, session.id);
  const createAtaAction = createAta.bind(null, session.id);

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
    session.attendances.flatMap((a) => (a.userId ? [a.userId] : []))
  );
  const linhas = quadro.filter(
    (m) => (DEGREE_RANK[m.degree] ?? 3) >= (DEGREE_RANK[session.degree] ?? 1)
  );
  const minFreq = lodgeCfg.minFreqProgressao;

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
  const visitantes = session.attendances.filter((a) => !a.user);

  return (
    <div className="max-w-3xl space-y-6">
      <h1 className="text-2xl font-bold">
        Sessão {sessionTypeLabels[session.type] ?? session.type} —{" "}
        {session.date.toLocaleDateString("pt-BR")}{" "}
        <span className="text-base font-normal text-muted-foreground">
          (grau {degreeLabels[session.degree] ?? session.degree})
        </span>
      </h1>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Check-in via QR Code</CardTitle>
            <CardDescription>
              Membros e visitantes escaneiam para registrar presença.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={qrDataUrl} alt="QR Code de check-in" />
            <p className="break-all text-xs text-muted-foreground">{checkinUrl}</p>
          </CardContent>
        </Card>

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
                        ["primeiroLevantamento", "Primeiro levantamento"],
                        ["segundoLevantamento", "Segundo levantamento"],
                        [
                          "terceiroLevantamento",
                          "Terceiro levantamento (manifestações dos irmãos)",
                        ],
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
                          rows={name === "pautaDoDia" ? 3 : 2}
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
                <Button asChild variant="secondary">
                  <Link href={`/secretaria/atas/${session.ata.id}`}>
                    Abrir Ata nº {session.ata.number}
                  </Link>
                </Button>
              )}
            </CardContent>
          </Card>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>
            Livro de Presenças ({presentes.size} de {linhas.length} irmãos)
          </CardTitle>
          <CardDescription>
            Frequência acumulada em {ano} — mínimo da Loja para progressão:{" "}
            {minFreq}%. O alerta legal vale para Aprendizes e Companheiros.{" "}
            <Link
              href={`/secretaria/sessoes/export?ano=${ano}`}
              className="underline"
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
                      {att ? (
                        <Badge variant="success">
                          Presente
                          {att.viaQrCode ? " · QR" : ""}
                          {" às "}
                          {att.checkedInAt.toLocaleTimeString("pt-BR", {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
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
                          <Badge className="border-amber-200 bg-amber-50 text-amber-700">
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
