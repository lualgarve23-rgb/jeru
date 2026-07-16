import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/session";
import { lerMensagem } from "@/lib/gmail-inbox";
import { responderEmail } from "../actions";
import { ActionForm } from "@/components/action-form";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export const dynamic = "force-dynamic";

export default async function EmailPage({
  params,
}: {
  params: Promise<{ uid: string }>;
}) {
  await requireRole("SECRETARIO", "VENERAVEL_MESTRE");
  const { uid: uidRaw } = await params;
  const uid = Number(uidRaw);
  if (!Number.isInteger(uid) || uid <= 0) notFound();

  const msg = await lerMensagem(uid);
  if (!msg) notFound();

  const responder = responderEmail.bind(null, {
    uid,
    to: msg.fromAddress,
    subject: msg.subject,
    messageId: msg.messageId,
    references: msg.references,
  });

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <Link
          href="/secretaria/emails"
          className="text-sm text-primary hover:underline"
        >
          ← Voltar à caixa de entrada
        </Link>
        <h1 className="mt-1 text-2xl font-bold">{msg.subject}</h1>
        <p className="text-sm text-muted-foreground">
          De {msg.from} &lt;{msg.fromAddress}&gt; · para {msg.to}
          {msg.date && ` · ${msg.date.toLocaleString("pt-BR")}`}
        </p>
      </div>

      <Card>
        <CardContent className="pt-6">
          <div className="whitespace-pre-wrap break-words text-sm">
            {msg.text || "(mensagem sem texto)"}
          </div>
          {msg.attachments.length > 0 && (
            <div className="mt-4 space-y-1 border-t pt-3">
              <p className="text-sm font-medium">Anexos</p>
              {msg.attachments.map((a) => (
                <p key={a.index} className="text-sm">
                  <a
                    href={`/api/emails/anexo?uid=${uid}&idx=${a.index}`}
                    className="text-primary hover:underline"
                  >
                    {a.filename}
                  </a>{" "}
                  <Badge variant="outline">
                    {Math.max(1, Math.round(a.size / 1024))} KB
                  </Badge>
                </p>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Responder</CardTitle>
          <CardDescription>
            A resposta será enviada pelo Gmail da Loja para {msg.fromAddress},
            na mesma conversa.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ActionForm action={responder} submitLabel="Enviar resposta">
            <div className="space-y-1">
              <Label htmlFor="texto">Mensagem</Label>
              <textarea
                id="texto"
                name="texto"
                rows={6}
                required
                className="w-full rounded-md border bg-transparent p-2 text-sm"
              />
            </div>
          </ActionForm>
        </CardContent>
      </Card>
    </div>
  );
}
