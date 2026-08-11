import { prisma } from "@/lib/prisma";
import { degreeLabels, memberStatusLabels } from "@/lib/labels";
import { cn } from "@/lib/utils";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { PublicHero } from "@/components/public-shell";

// Verificação pública da carteirinha digital (QR Code). Mostra o mínimo
// necessário para conferir a regularidade: nome, CIM, Loja, grau e situação.
// O token é opaco e não expõe dados de contato (LGPD).
export default async function VerificarCarteirinhaPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const member = await prisma.user.findUnique({
    where: { cardToken: token },
    select: {
      name: true,
      cim: true,
      degree: true,
      status: true,
      photoUrl: true,
      lodge: {
        select: { name: true, number: true, potencia: true, oriente: true, logoUrl: true },
      },
    },
  });

  if (!member) {
    return (
      <main className="mx-auto max-w-md p-6">
        <Card>
          <CardHeader>
            <CardTitle>Carteirinha não encontrada</CardTitle>
            <CardDescription>
              Este código de verificação é inválido ou foi revogado.
            </CardDescription>
          </CardHeader>
        </Card>
      </main>
    );
  }

  const regular = member.status === "ATIVO";

  return (
    <main className="mx-auto max-w-md space-y-4 p-4 py-6">
      <PublicHero
        logoUrl={member.lodge.logoUrl}
        logoAlt={`Logo da Loja ${member.lodge.name}`}
        eyebrow="Verificação de carteirinha"
        title={`${member.lodge.name} nº ${member.lodge.number}`}
        subtitle={
          [member.lodge.potencia, member.lodge.oriente]
            .filter(Boolean)
            .join(" — ") || "Verificação de identificação maçônica"
        }
      />
      <Card>
        <CardContent className="space-y-4 pt-6">
          <div className="flex items-center gap-4">
            {member.photoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={`/api/verificar/foto/${token}`}
                alt={`Foto de ${member.name}`}
                className="h-20 w-20 rounded-full border object-cover"
              />
            ) : null}
            <div>
              <p className="font-bold">{member.name}</p>
              <p className="text-sm text-muted-foreground">
                CIM {member.cim} · {degreeLabels[member.degree] ?? member.degree}
              </p>
            </div>
          </div>
          <div
            className={cn(
              "rounded-xl p-3 text-sm font-semibold",
              regular
                ? "bg-success-soft text-success"
                : "bg-warning-soft text-warning"
            )}
          >
            {regular
              ? "✓ Membro regular desta Loja."
              : `Situação: ${memberStatusLabels[member.status] ?? member.status}.`}
          </div>
          <p className="text-xs text-muted-foreground">
            Verificação emitida pelo sistema Gestão NoPrumo. Consulta
            realizada em {new Date().toLocaleDateString("pt-BR")}.
          </p>
        </CardContent>
      </Card>
    </main>
  );
}
