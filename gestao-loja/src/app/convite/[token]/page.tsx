import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import {
  rsvpMember,
  rsvpPublico,
  ausenciaMember,
  ausenciaPublico,
} from "@/app/(app)/secretaria/actions";
import { ActionForm } from "@/components/action-form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { sessionTypeLabels, degreeLabels } from "@/lib/labels";
import {
  renderConvite,
  corpoDoConvite,
  arteDoConvite,
  renderFrase,
  fraseCitaPauta,
} from "@/lib/convite";
import { arteComDados } from "@/lib/convite-arte";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { PublicHero } from "@/components/public-shell";

function CampoJustificativa() {
  return (
    <div className="space-y-1">
      <Label htmlFor="justificativa">Motivo da ausência</Label>
      <textarea
        id="justificativa"
        name="justificativa"
        rows={3}
        required
        maxLength={300}
        placeholder="Escreva o motivo — ele constará no Livro de Presenças como ausência justificada."
        className="w-full rounded-md border bg-background px-3 py-2 text-sm"
      />
    </div>
  );
}

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

  // Loja com template próprio (HTML ou arte): exibe o convite preenchido com
  // os dados da sessão, igual ao e-mail enviado; o {{LINK}} vira âncora para o
  // formulário de confirmação logo abaixo
  const arte = arteDoConvite(session.lodge.conviteTemplateHtml);
  const arteFinal = arte ? await arteComDados(arte, session) : null;
  const conviteHtml = session.lodge.conviteTemplateHtml
    ? corpoDoConvite(
        renderConvite(session.lodge, session, "#confirmar-presenca", arteFinal)
      )
        .replace(/<p[^>]*>\s*Se o botão não funcionar[\s\S]*?<\/p>/g, "")
        // O template de e-mail usa tabela de largura fixa (560px); na página,
        // vira fluida para não cortar o convite em telas de celular
        .replaceAll('width="560"', 'width="100%"')
    : null;
  const authSession = await auth();
  const memberAction = rsvpMember.bind(null, token);
  const publicoAction = rsvpPublico.bind(null, token);
  const ausenciaMemberAction = ausenciaMember.bind(null, token);
  const ausenciaPublicoAction = ausenciaPublico.bind(null, token);

  return (
    <main className="mx-auto max-w-md space-y-6 p-6">
      {conviteHtml ? (
        <div
          className="overflow-hidden rounded-lg border shadow-sm"
          dangerouslySetInnerHTML={{ __html: conviteHtml }}
        />
      ) : (
        <PublicHero
          logoUrl={session.lodge.logoUrl}
          logoAlt={`Logo da Loja ${session.lodge.name}`}
          eyebrow="Convite"
          title={session.lodge.name}
          subtitle={`Loja nº ${session.lodge.number}`}
        />
      )}

      <Card id="confirmar-presenca">
        {/* Com template da loja, os dados da sessão já estão dentro do convite */}
        {!conviteHtml && (
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
        )}
        <CardContent className="space-y-6">
          {!conviteHtml && (
            <p className="whitespace-pre-line text-sm leading-relaxed text-muted-foreground">
              {renderFrase(session.lodge, session)}
            </p>
          )}
          {!conviteHtml &&
            session.pauta &&
            !fraseCitaPauta(session.lodge.conviteFrase) && (
            <div className="rounded-md border bg-secondary p-3 text-sm">
              <p className="mb-1 font-semibold">Pauta do dia</p>
              <p className="whitespace-pre-line text-muted-foreground">
                {session.pauta}
              </p>
            </div>
          )}
          {authSession?.user ? (
            <div className="space-y-3">
              <p className="text-sm">
                Logado como <strong>{authSession.user.name}</strong>.
              </p>
              <ActionForm action={memberAction} submitLabel="Confirmar presença">
                <AgapeCheckbox />
              </ActionForm>
              <details className="rounded-md border p-3">
                <summary className="cursor-pointer text-sm font-medium">
                  Não poderei comparecer — justificar ausência
                </summary>
                <div className="mt-3">
                  <ActionForm
                    action={ausenciaMemberAction}
                    submitLabel="Justificar ausência"
                  >
                    <CampoJustificativa />
                  </ActionForm>
                </div>
              </details>
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
          {!authSession?.user && (
            <details className="rounded-md border p-3">
              <summary className="cursor-pointer text-sm font-medium">
                Não poderei comparecer — justificar ausência
              </summary>
              <div className="mt-3">
                <p className="mb-3 text-xs text-muted-foreground">
                  Para irmãos do quadro da Loja: informe o CIM e o motivo.
                </p>
                <ActionForm
                  action={ausenciaPublicoAction}
                  submitLabel="Justificar ausência"
                >
                  <div className="space-y-1">
                    <Label htmlFor="cim-ausencia">CIM</Label>
                    <Input id="cim-ausencia" name="cim" required />
                  </div>
                  <CampoJustificativa />
                </ActionForm>
              </div>
            </details>
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
