import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import {
  rsvpMember,
  rsvpPublico,
  rsvpReconhecido,
  ausenciaMember,
  ausenciaPublico,
  ausenciaReconhecida,
} from "@/app/(app)/secretaria/actions";
import { usuarioReconhecido } from "@/lib/reconhecimento";
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
import { arteComDados, isConviteArteLayout } from "@/lib/convite-arte";
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

// Formulário público (visitante ou membro identificando-se pelo CIM) — usado
// quando ninguém é reconhecido e como saída "não sou eu" do reconhecimento
function FormPublico({
  action,
  isEvento,
}: {
  action: (
    prev: { error?: string; ok?: string } | undefined,
    formData: FormData
  ) => Promise<{ error?: string; ok?: string } | undefined>;
  isEvento: boolean;
}) {
  return (
    <ActionForm action={action} submitLabel="Confirmar presença">
      <div className="space-y-1">
        <Label htmlFor="nome">Nome completo</Label>
        <Input id="nome" name="nome" required />
      </div>
      <div className="space-y-1">
        <Label htmlFor="cim">CIM</Label>
        <Input id="cim" name="cim" placeholder="membro da Loja: informe o CIM" />
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
      {!isEvento && <AgapeCheckbox />}
    </ActionForm>
  );
}

// Preview do link no WhatsApp: a arte do convite como og:image, para que a
// imagem apareça primeiro e a confirmação/recusa fique logo abaixo, na página
export async function generateMetadata({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const session = await prisma.lodgeSession.findUnique({
    where: { inviteToken: token },
    include: { lodge: true },
  });
  if (!session) return { title: "Convite" };

  const tipo = sessionTypeLabels[session.type] ?? session.type;
  const data = session.date.toLocaleDateString("pt-BR");
  const hora = session.date.toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  });
  const baseUrl = process.env.APP_URL ?? "http://localhost:3100";
  const arte = arteDoConvite(session.lodge.conviteTemplateHtml);
  const title = `Convite — ${session.lodge.name}`;
  const description = `${session.type === "EVENTO" ? "Evento" : `Sessão ${tipo}`} em ${data}, às ${hora}. Toque para confirmar presença ou justificar ausência.`;

  // Dimensões declaradas ajudam WhatsApp/Telegram a exibir o cartão grande
  // com a imagem, em vez da miniatura ou de link sem preview
  let imagem: { url: string; width?: number; height?: number; type: string } | null = null;
  if (arte) {
    imagem = { url: `${baseUrl}/convite/${token}/imagem`, type: "image/jpeg" };
    try {
      const sharp = (await import("sharp")).default;
      const meta = await sharp(
        Buffer.from(arte.split(",")[1], "base64")
      ).metadata();
      if (meta.width && meta.height) {
        imagem.width = meta.width;
        imagem.height = meta.height;
      }
    } catch {
      // sem dimensões o preview ainda funciona
    }
  }
  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: "website",
      url: `${baseUrl}/convite/${token}`,
      ...(imagem ? { images: [imagem] } : {}),
    },
    ...(imagem
      ? { twitter: { card: "summary_large_image" as const, images: [imagem.url] } }
      : {}),
  };
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
  const isEvento = session.type === "EVENTO";

  // Loja com template próprio (HTML ou arte): exibe o convite preenchido com
  // os dados da sessão, igual ao e-mail enviado; o {{LINK}} vira âncora para o
  // formulário de confirmação logo abaixo
  const arte = arteDoConvite(session.lodge.conviteTemplateHtml);
  const arteFinal = arte
    ? await arteComDados(
        arte,
        session,
        isConviteArteLayout(session.lodge.conviteArteLayout)
          ? session.lodge.conviteArteLayout
          : null
      )
    : null;
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
  // Sem sessão ativa (expira em 8h), o irmão que já logou neste aparelho é
  // reconhecido pelo cookie de longa duração (lib/reconhecimento.ts) — assim
  // o clique no convite do WhatsApp/e-mail não cai no formulário de visitante
  const reconhecido = authSession?.user
    ? null
    : await usuarioReconhecido(session.lodgeId);
  const memberAction = rsvpMember.bind(null, token);
  const publicoAction = rsvpPublico.bind(null, token);
  const reconhecidoAction = rsvpReconhecido.bind(null, token);
  const ausenciaMemberAction = ausenciaMember.bind(null, token);
  const ausenciaPublicoAction = ausenciaPublico.bind(null, token);
  const ausenciaReconhecidaAction = ausenciaReconhecida.bind(null, token);

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
              {isEvento
                ? "Evento"
                : `Sessão ${sessionTypeLabels[session.type] ?? session.type}`}
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
              {session.degree !== "NA" && (
                <>
                  {" — grau "}
                  {degreeLabels[session.degree] ?? session.degree}
                </>
              )}
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
              <p className="mb-1 font-semibold">{isEvento ? "Descrição" : "Pauta do dia"}</p>
              <p className="whitespace-pre-line text-muted-foreground">
                {session.pauta}
              </p>
            </div>
          )}
          {!authSession?.user && reconhecido ? (
            <div className="space-y-3">
              <p className="text-sm">
                Que bom te ver de novo, Irmão{" "}
                <strong>{reconhecido.name}</strong>!
              </p>
              <ActionForm
                action={reconhecidoAction}
                submitLabel="Confirmar presença"
              >
                {!isEvento && <AgapeCheckbox />}
              </ActionForm>
              <details className="rounded-md border p-3">
                <summary className="cursor-pointer text-sm font-medium">
                  Não poderei comparecer — justificar ausência
                </summary>
                <div className="mt-3">
                  <ActionForm
                    action={ausenciaReconhecidaAction}
                    submitLabel="Justificar ausência"
                  >
                    <CampoJustificativa />
                  </ActionForm>
                </div>
              </details>
              <details className="rounded-md border p-3">
                <summary className="cursor-pointer text-sm font-medium">
                  Não sou {reconhecido.name} — confirmar com outro nome
                </summary>
                <div className="mt-3">
                  <FormPublico
                    action={publicoAction}
                    isEvento={isEvento}
                  />
                </div>
              </details>
            </div>
          ) : authSession?.user ? (
            <div className="space-y-3">
              <p className="text-sm">
                Logado como <strong>{authSession.user.name}</strong>.
              </p>
              <ActionForm action={memberAction} submitLabel="Confirmar presença">
                {!isEvento && <AgapeCheckbox />}
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
            <FormPublico action={publicoAction} isEvento={isEvento} />
          )}
          {!authSession?.user && !reconhecido && (
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
            {isEvento
              ? "A confirmação antecipada ajuda a Secretaria a organizar o evento. TFA!"
              : "A confirmação antecipada ajuda a Secretaria a organizar a sessão e o Ágape. TFA!"}
          </p>
        </CardContent>
      </Card>
    </main>
  );
}
