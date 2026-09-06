import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { dispararConvitesVisitantesEmail } from "../../actions";
import { ActionButton } from "@/components/action-form";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { telefoneWhatsApp } from "@/lib/certificado";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

// Convite da sessão aos irmãos visitantes já cadastrados (base de
// Visitantes): disparo por e-mail em massa (fila) e link de WhatsApp
// individual, com a saudação pelo nome, para quem tem telefone.
export async function ConvitesVisitantesCard({
  lodgeId,
  sessionId,
  conviteTexto,
  isEvento,
}: {
  lodgeId: string;
  sessionId: string;
  conviteTexto: string;
  isEvento: boolean;
}) {
  const visitantes = await prisma.visitante.findMany({
    where: { lodgeId },
    orderBy: { nome: "asc" },
    select: {
      id: true,
      nome: true,
      email: true,
      telefone: true,
      lojaOrigem: true,
      presencas: {
        where: { sessionId },
        select: { checkedIn: true, rsvpAt: true },
      },
    },
  });
  if (visitantes.length === 0) return null;

  const comEmail = visitantes.filter((v) => v.email?.includes("@")).length;
  const comZap = visitantes.filter((v) => telefoneWhatsApp(v.telefone)).length;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Convidar visitantes cadastrados ({visitantes.length})</CardTitle>
        <CardDescription>
          Irmãos de outras Oficinas da base de{" "}
          <Link href="/secretaria/visitantes" className="underline underline-offset-2">
            Visitantes
          </Link>
          . O convite usa o mesmo link de confirmação {isEvento ? "do evento" : "da sessão"}.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <ActionButton
            action={dispararConvitesVisitantesEmail.bind(null, sessionId)}
            label={`Disparar convite por e-mail (${comEmail})`}
            variant="secondary"
          />
          <span className="text-xs text-muted-foreground">
            {comZap} com WhatsApp · {visitantes.length - comEmail} sem e-mail
          </span>
        </div>
        <ul className="divide-y text-sm">
          {visitantes.map((v) => {
            const tel = telefoneWhatsApp(v.telefone);
            const p = v.presencas[0];
            const msg = `Prezado Ir∴ ${v.nome},\n${conviteTexto}`;
            return (
              <li key={v.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <div>
                  <Link
                    href={`/secretaria/visitantes/${v.id}`}
                    className="font-medium underline-offset-2 hover:underline"
                  >
                    {v.nome}
                  </Link>
                  {v.lojaOrigem && (
                    <span className="text-muted-foreground"> · {v.lojaOrigem}</span>
                  )}
                  <div className="text-xs text-muted-foreground">
                    {[v.email, v.telefone].filter(Boolean).join(" · ") || "sem contato"}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {p?.checkedIn ? (
                    <Badge variant="secondary">presente</Badge>
                  ) : p?.rsvpAt ? (
                    <Badge variant="secondary">confirmou</Badge>
                  ) : null}
                  {tel && (
                    <Button
                      asChild
                      size="sm"
                      className="bg-[#25d366] text-white hover:bg-[#1faa52]"
                    >
                      <a
                        href={`https://wa.me/${tel}?text=${encodeURIComponent(msg)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        Convidar no WhatsApp
                      </a>
                    </Button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
}
