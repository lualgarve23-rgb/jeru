import { notFound } from "next/navigation";
import QRCode from "qrcode";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { canWriteSecretaria } from "@/lib/permissions";
import { registerAttendance, createAta } from "../../actions";
import { ActionForm } from "@/components/action-form";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
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

  return (
    <div className="max-w-3xl space-y-6">
      <h1 className="text-2xl font-bold">
        Sessão {session.type} — {session.date.toLocaleDateString("pt-BR")}{" "}
        <span className="text-base font-normal text-neutral-500">
          (grau {session.degree})
        </span>
      </h1>

      <div className="grid grid-cols-2 gap-6">
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
            <p className="break-all text-xs text-neutral-500">{checkinUrl}</p>
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
                <form action={createAtaAction}>
                  <Button variant="secondary" type="submit">
                    Lavrar Ata desta sessão
                  </Button>
                </form>
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
            Livro de Presenças ({session.attendances.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="space-y-1 text-sm">
            {session.attendances.map((a) => (
              <li key={a.id}>
                {a.user
                  ? `${a.user.name} (CIM ${a.user.cim})`
                  : `${a.visitorName} — visitante${a.visitorLodge ? ` · ${a.visitorLodge}` : ""}${a.visitorPotencia ? ` / ${a.visitorPotencia}` : ""}`}
                {a.viaQrCode ? " · via QR" : ""}
                <span className="text-neutral-400">
                  {" "}
                  às {a.checkedInAt.toLocaleTimeString("pt-BR")}
                </span>
              </li>
            ))}
            {session.attendances.length === 0 && (
              <li className="text-neutral-500">Nenhuma presença registrada.</li>
            )}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
