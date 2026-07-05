import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { canWriteSecretaria } from "@/lib/permissions";
import {
  updateAta,
  signAta,
  sendAtaForReview,
  sendAtaToMembers,
} from "../../actions";
import { ActionForm, ActionButton } from "@/components/action-form";
import { Badge } from "@/components/ui/badge";
import {
  ataStatusLabels,
  ataStatusTone,
  sessionTypeLabels,
} from "@/lib/labels";
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
  // Ordem de governança: VM assina primeiro; o Secretário, na sequência
  const canSign =
    (user.role === "VENERAVEL_MESTRE" && !ata.signedByMasterId) ||
    (user.role === "SECRETARIO" &&
      !!ata.signedByMasterId &&
      !ata.signedBySecId);

  const updateAction = updateAta.bind(null, ata.id);
  const signAction = signAta.bind(null, ata.id);
  const sendAction = sendAtaToMembers.bind(null, ata.id);
  const reviewAction = sendAtaForReview.bind(null, ata.id);

  return (
    <div className="max-w-3xl space-y-6">
      <div className="flex items-center gap-3">
        <h1 className="text-2xl font-bold">Ata nº {ata.number}</h1>
        <Badge variant={ataStatusTone(ata.status)}>
          {ataStatusLabels[ata.status] ?? ata.status}
        </Badge>
      </div>
      <p className="text-sm text-muted-foreground">
        Sessão {sessionTypeLabels[ata.session.type] ?? ata.session.type} de{" "}
        {ata.session.date.toLocaleDateString("pt-BR")}
      </p>

      {editable && (
        <ActionForm action={updateAction} submitLabel="Salvar rascunho">
          <textarea
            name="content"
            defaultValue={ata.content}
            rows={16}
            className="w-full rounded-md border bg-transparent p-3 text-sm"
            placeholder="Texto da ata (balaústre)..."
          />
          <div className="space-y-1">
            <label className="text-sm font-medium" htmlFor="ajustes">
              Ajustes solicitados na validação
            </label>
            <textarea
              id="ajustes"
              name="ajustes"
              defaultValue={ata.ajustes ?? ""}
              rows={3}
              className="w-full rounded-md border bg-transparent p-3 text-sm"
              placeholder="Registre aqui os ajustes pedidos pelos irmãos na reunião de validação (e aplique-os no texto acima)..."
            />
          </div>
          {ata.sentForReviewAt ? (
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="submit" value="final" />
              Validação concluída — liberar para assinaturas
            </label>
          ) : (
            <p className="text-xs text-muted-foreground">
              Antes das assinaturas, a minuta precisa ser enviada aos irmãos
              para validação (botão abaixo).
            </p>
          )}
        </ActionForm>
      )}

      {/* Validação pelos irmãos — etapa anterior às assinaturas */}
      {!ata.signedByMasterId && !ata.signedBySecId && (
        <Card>
          <CardHeader>
            <CardTitle>Validação pelos irmãos</CardTitle>
            <CardDescription>
              A minuta é enviada por e-mail a todos os irmãos do quadro.
              Pedidos de alteração são apresentados na reunião e registrados no
              campo de ajustes; depois a ata é liberada para assinaturas.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <p>
              {ata.sentForReviewAt
                ? `📧 Enviada para validação em ${ata.sentForReviewAt.toLocaleString("pt-BR")}`
                : "⏳ Ainda não enviada aos irmãos."}
            </p>
            {canWriteSecretaria(user.role) && (
              <ActionButton
                action={reviewAction}
                variant="outline"
                label={
                  ata.sentForReviewAt
                    ? "Reenviar para validação"
                    : "Enviar aos irmãos para validação"
                }
              />
            )}
          </CardContent>
        </Card>
      )}

      {ata.ajustes && !editable && (
        <Card>
          <CardHeader>
            <CardTitle>Ajustes registrados na validação</CardTitle>
          </CardHeader>
          <CardContent className="whitespace-pre-wrap text-sm">
            {ata.ajustes}
          </CardContent>
        </Card>
      )}

      {/* Preview da ata em formato de documento */}
      <Card>
        <CardHeader>
          <CardTitle>Pré-visualização do documento</CardTitle>
          {editable && (
            <CardDescription>
              Reflete o último texto salvo — salve o rascunho para atualizar.
            </CardDescription>
          )}
        </CardHeader>
        <CardContent>
          <div className="rounded-md border bg-white p-6 font-serif text-[15px] leading-7 text-neutral-900 shadow-sm sm:p-10">
            <p className="whitespace-pre-wrap text-justify">
              {ata.content || "(sem conteúdo)"}
            </p>
            {(ata.signedByMaster || ata.signedBySec) && (
              <div className="mt-10 grid gap-8 text-center sm:grid-cols-2">
                {[
                  {
                    signer: ata.signedByMaster,
                    at: ata.signedByMasterAt,
                    cargo: "Venerável Mestre",
                  },
                  {
                    signer: ata.signedBySec,
                    at: ata.signedBySecAt,
                    cargo: "Secretário",
                  },
                ].map(
                  ({ signer, at, cargo }) =>
                    signer && (
                      <div key={cargo} className="space-y-1">
                        {signer.signatureUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={signer.signatureUrl}
                            alt={`Assinatura de ${signer.name}`}
                            className="mx-auto h-16 object-contain"
                          />
                        ) : (
                          <div className="mx-auto h-16" />
                        )}
                        <p className="border-t border-neutral-400 pt-1 text-sm font-semibold">
                          {signer.name}
                        </p>
                        <p className="text-xs text-neutral-600">
                          {cargo}
                          {at && ` — ${at.toLocaleDateString("pt-BR")}`}
                        </p>
                      </div>
                    )
                )}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Assinaturas (trava de governança)</CardTitle>
          <CardDescription>
            Primeiro assina o Venerável Mestre e depois o Secretário. Após a
            primeira assinatura o texto fica imutável; com as duas, a ata pode
            ser enviada por e-mail aos irmãos do quadro.
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
              : ata.signedByMasterId
                ? "⏳ pendente"
                : "⏳ aguardando a assinatura do Venerável Mestre"}
          </p>
          {ata.sentToMembersAt && (
            <p>
              📧 Enviada aos irmãos em{" "}
              {ata.sentToMembersAt.toLocaleString("pt-BR")}
            </p>
          )}
          <div className="flex gap-3">
            {canSign && ata.status !== "RASCUNHO" && (
              <ActionButton action={signAction} label="Assinar como meu cargo" />
            )}
            {ata.status === "ASSINADA" && canWriteSecretaria(user.role) && (
              <ActionButton
                action={sendAction}
                variant="outline"
                label={
                  ata.sentToMembersAt
                    ? "Reenviar aos irmãos"
                    : "Enviar aos irmãos do quadro"
                }
              />
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
