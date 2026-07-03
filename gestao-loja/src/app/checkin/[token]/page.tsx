import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { qrCheckinMember, qrCheckinVisitor } from "@/app/(app)/secretaria/actions";
import { ActionForm, ActionButton } from "@/components/action-form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default async function CheckinPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const session = await prisma.lodgeSession.findUnique({
    where: { qrToken: token },
    include: { lodge: true },
  });
  if (!session) notFound();

  const authSession = await auth();
  const memberAction = qrCheckinMember.bind(null, token);
  const visitorAction = qrCheckinVisitor.bind(null, token);

  return (
    <main className="mx-auto max-w-md space-y-6 p-6">
      <Card>
        <CardHeader>
          <CardTitle>{session.lodge.name}</CardTitle>
          <CardDescription>
            Check-in — Sessão {session.type} de{" "}
            {session.date.toLocaleDateString("pt-BR")}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {authSession?.user ? (
            <div className="space-y-2">
              <p className="text-sm">
                Logado como <strong>{authSession.user.name}</strong>.
              </p>
              <ActionButton action={memberAction} label="Confirmar minha presença" />
            </div>
          ) : (
            <p className="text-sm text-neutral-500">
              É membro desta Loja? Faça login para registrar sua presença, ou
              preencha abaixo como visitante.
            </p>
          )}

          <div>
            <p className="mb-2 font-semibold">Sou visitante</p>
            <ActionForm action={visitorAction} submitLabel="Registrar presença">
              <div className="space-y-1">
                <Label htmlFor="visitorName">Nome completo</Label>
                <Input id="visitorName" name="visitorName" required />
              </div>
              <div className="space-y-1">
                <Label htmlFor="visitorCim">CIM</Label>
                <Input id="visitorCim" name="visitorCim" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label htmlFor="visitorLodge">Loja de origem</Label>
                  <Input id="visitorLodge" name="visitorLodge" />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="visitorPotencia">Potência</Label>
                  <Input id="visitorPotencia" name="visitorPotencia" />
                </div>
              </div>
            </ActionForm>
          </div>
        </CardContent>
      </Card>
    </main>
  );
}
