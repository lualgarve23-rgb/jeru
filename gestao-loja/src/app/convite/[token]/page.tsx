import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { rsvpMember, rsvpPublico } from "@/app/(app)/secretaria/actions";
import { ActionForm } from "@/components/action-form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { sessionTypeLabels, degreeLabels } from "@/lib/labels";
import { arteDoConvite, CONVITE_FRASE_PADRAO } from "@/lib/convite";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

function AgapeCheckbox() {
  return (
    <label className="flex items-center gap-2 rounded-md border bg-amber-50/50 p-3 text-sm">
      <input type="checkbox" name="agape" className="h-4 w-4" />
      Ficarei para o <strong>Ágape</strong> (jantar/refeição)
    </label>
  );
}

export default async function ConvitePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const session = await prisma.lodgeSession.findUnique({
    where: { inviteToken: token },
    include: { lodge: true },
  });
  if (!session) notFound();

  const arte = arteDoConvite(session.lodge.conviteTemplateHtml);
  const authSession = await auth();
  const memberAction = rsvpMember.bind(null, token);
  const publicoAction = rsvpPublico.bind(null, token);

  return (
    <main className="mx-auto max-w-md space-y-6 p-6">
      {arte ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={arte}
          alt={`Convite — ${session.lodge.name}`}
          className="w-full rounded-lg border shadow-sm"
        />
      ) : (
        <div className="space-y-1 text-center">
          <p className="text-xs uppercase tracking-widest text-muted-foreground">
            Convite
          </p>
          <h1 className="text-xl font-bold">{session.lodge.name}</h1>
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>
            Sessão {sessionTypeLabels[session.type] ?? session.type}
          </CardTitle>
          <CardDescription>
            {session.date.toLocaleDateString("pt-BR", {
              weekday: "long",
              day: "2-digit",
              month: "long",
              year: "numeric",
            })}
            {" às "}
            {session.date.toLocaleTimeString("pt-BR", {
              hour: "2-digit",
              minute: "2-digit",
            })}
            {" — grau "}
            {degreeLabels[session.degree] ?? session.degree}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <p className="text-sm leading-relaxed text-neutral-600">
            {session.lodge.conviteFrase?.trim() || CONVITE_FRASE_PADRAO}
          </p>
          {authSession?.user ? (
            <div className="space-y-3">
              <p className="text-sm">
                Logado como <strong>{authSession.user.name}</strong>.
              </p>
              <ActionForm action={memberAction} submitLabel="Confirmar presença">
                <AgapeCheckbox />
              </ActionForm>
            </div>
          ) : (
            <ActionForm action={publicoAction} submitLabel="Confirmar presença">
              <div className="space-y-1">
                <Label htmlFor="nome">Nome completo</Label>
                <Input id="nome" name="nome" required />
              </div>
              <div className="space-y-1">
                <Label htmlFor="cim">CIM</Label>
                <Input
                  id="cim"
                  name="cim"
                  placeholder="membro da Loja: informe o CIM"
                />
              </div>
              <p className="text-xs text-muted-foreground">
                Visitante de outra Loja? Preencha também os campos abaixo:
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label htmlFor="lojaOrigem">Loja de origem</Label>
                  <Input id="lojaOrigem" name="lojaOrigem" />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="potencia">Potência</Label>
                  <Input id="potencia" name="potencia" />
                </div>
              </div>
              <div className="space-y-1">
                <Label htmlFor="email">E-mail</Label>
                <Input id="email" name="email" type="email" />
              </div>
              <AgapeCheckbox />
            </ActionForm>
          )}
          <p className="text-center text-xs text-muted-foreground">
            A confirmação antecipada ajuda a Secretaria a organizar a sessão e o
            Ágape. TFA!
          </p>
        </CardContent>
      </Card>
    </main>
  );
}
