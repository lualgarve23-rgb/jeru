import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { canWriteSecretaria } from "@/lib/permissions";
import { updateAta, signAta, sendAtaToGSelos } from "../../actions";
import { ActionForm, ActionButton } from "@/components/action-form";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default async function AtaPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireUser();
  const { id } = await params;
  const ata = await prisma.ata.findUnique({
    where: { id, lodgeId: user.lodgeId },
    include: {
      session: true,
      signedByMaster: true,
      signedBySec: true,
    },
  });
  if (!ata) notFound();

  const editable =
    canWriteSecretaria(user.role) && !ata.signedByMasterId && !ata.signedBySecId;
  const canSign =
    (user.role === "VENERAVEL_MESTRE" && !ata.signedByMasterId) ||
    (user.role === "SECRETARIO" && !ata.signedBySecId);

  const updateAction = updateAta.bind(null, ata.id);
  const signAction = signAta.bind(null, ata.id);
  const sendAction = sendAtaToGSelos.bind(null, ata.id);

  return (
    <div className="max-w-3xl space-y-6">
      <div className="flex items-center gap-3">
        <h1 className="text-2xl font-bold">Ata nº {ata.number}</h1>
        <Badge>{ata.status}</Badge>
      </div>
      <p className="text-sm text-neutral-500">
        Sessão {ata.session.type} de{" "}
        {ata.session.date.toLocaleDateString("pt-BR")}
      </p>

      {editable ? (
        <ActionForm action={updateAction} submitLabel="Salvar rascunho">
          <textarea
            name="content"
            defaultValue={ata.content}
            rows={16}
            className="w-full rounded-md border bg-transparent p-3 text-sm"
            placeholder="Texto da ata (balaústre)..."
          />
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="submit" value="final" />
            Finalizar e liberar para assinaturas
          </label>
        </ActionForm>
      ) : (
        <Card>
          <CardContent className="whitespace-pre-wrap p-6 text-sm">
            {ata.content || "(sem conteúdo)"}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Assinaturas (trava de governança)</CardTitle>
          <CardDescription>
            A ata só é selada com a assinatura conjunta do Venerável Mestre e
            do Secretário. Após a primeira assinatura o texto fica imutável.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <p>
            Venerável Mestre:{" "}
            {ata.signedByMaster
              ? `✅ ${ata.signedByMaster.name} em ${ata.signedByMasterAt?.toLocaleString("pt-BR")}`
              : "⏳ pendente"}
          </p>
          <p>
            Secretário:{" "}
            {ata.signedBySec
              ? `✅ ${ata.signedBySec.name} em ${ata.signedBySecAt?.toLocaleString("pt-BR")}`
              : "⏳ pendente"}
          </p>
          <div className="flex gap-3">
            {canSign && ata.status !== "RASCUNHO" && (
              <ActionButton action={signAction} label="Assinar como meu cargo" />
            )}
            {ata.status === "ASSINADA" && canWriteSecretaria(user.role) && (
              <ActionButton
                action={sendAction}
                variant="outline"
                label="Enviar à Guarda dos Selos"
              />
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
