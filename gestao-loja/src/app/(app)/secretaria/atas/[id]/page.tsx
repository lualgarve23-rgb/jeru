import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { canWriteSecretaria } from "@/lib/permissions";
import { isGovbrConfigured } from "@/lib/govbr";
import {
  updateAta,
  signAta,
  sendAtaForReview,
  sendAtaToMembers,
  uploadAtaAssinadaGovbr,
  setAtaGovbr,
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

const govbrMensagens: Record<string, string> = {
  ok: "✅ Assinatura gov.br registrada com sucesso.",
  "nao-configurado":
    "A assinatura gov.br ainda não está habilitada no servidor (credenciamento ITI pendente).",
  "ata-nao-assinada":
    "A ata precisa ser liberada para assinaturas antes da assinatura gov.br.",
  "nao-assinante":
    "Apenas o Venerável Mestre e o Secretário assinam no gov.br.",
  "ja-assinou": "Você já assinou esta ata com o gov.br.",
  "nao-encaminhada": "Esta ata não foi encaminhada para assinatura gov.br.",
  ordem: "O Venerável Mestre assina primeiro no gov.br — aguarde a assinatura dele.",
  "cpf-divergente":
    "A conta gov.br usada não é do próprio assinante (CPF divergente).",
  "sessao-expirada": "Sessão de assinatura expirada — tente novamente.",
  negado: "Autorização negada no gov.br.",
  falhou: "Falha ao assinar com o gov.br — tente novamente.",
};

export default async function AtaPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ govbr?: string }>;
}) {
  const user = await requireUser();
  const { id } = await params;
  const { govbr } = await searchParams;
  const ata = await prisma.ata.findUnique({
    where: { id, lodgeId: user.lodgeId },
    include: {
      lodge: true,
      session: true,
      signedByMaster: true,
      signedBySec: true,
    },
  });
  if (!ata) notFound();

  const editable =
    canWriteSecretaria(user.role) &&
    !ata.signedByMasterId &&
    !ata.signedBySecId &&
    !ata.govbrUploadedAt;
  // Ordem de governança: VM assina primeiro; o Secretário, na sequência.
  // As formas são exclusivas — ata encaminhada ao gov.br não assina aqui.
  const canSign =
    !ata.govbrSolicitado &&
    ((user.role === "VENERAVEL_MESTRE" && !ata.signedByMasterId) ||
      (user.role === "SECRETARIO" &&
        !!ata.signedByMasterId &&
        !ata.signedBySecId));

  const govbrDisponivel = isGovbrConfigured();
  // Fluxo gov.br exclusivo: disponível assim que a ata é liberada.
  // Ordem de governança: VM assina primeiro; o Secretário, depois
  const govbrLiberada =
    ata.govbrSolicitado &&
    ata.status !== "RASCUNHO" &&
    ata.status !== "EM_VALIDACAO";
  const podeAssinarGovbr =
    govbrLiberada &&
    ((user.role === "VENERAVEL_MESTRE" && !ata.govbrMasterAt) ||
      (user.role === "SECRETARIO" &&
        !!ata.govbrMasterAt &&
        !ata.govbrSecAt));

  const govbrEtapaVm = !ata.govbrMasterAt && user.role === "VENERAVEL_MESTRE";
  const govbrEtapaSec =
    !!ata.govbrMasterAt && !ata.govbrSecAt && user.role === "SECRETARIO";
  const podeSubirGovbr = govbrLiberada && (govbrEtapaVm || govbrEtapaSec);

  const updateAction = updateAta.bind(null, ata.id);
  const uploadGovbrAction = uploadAtaAssinadaGovbr.bind(null, ata.id);
  const encaminharGovbrAction = setAtaGovbr.bind(null, ata.id, true);
  const cancelarGovbrAction = setAtaGovbr.bind(null, ata.id, false);
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
            <div className="space-y-2">
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="submit" value="final" />
                Validação concluída — liberar para assinaturas
              </label>
              <div className="space-y-1 pl-6 text-sm">
                <p className="text-xs text-muted-foreground">
                  Forma de assinatura (uma ou outra):
                </p>
                <label className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="assinatura"
                    value="normal"
                    defaultChecked={!ata.govbrSolicitado}
                  />
                  Assinatura normal (Venerável Mestre e Secretário assinam no
                  sistema)
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="assinatura"
                    value="govbr"
                    defaultChecked={ata.govbrSolicitado}
                  />
                  Assinatura gov.br (vai direto ao gov.br, sem assinatura no
                  sistema — VM assina primeiro; depois o Secretário)
                </label>
              </div>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">
              Antes das assinaturas, a minuta precisa ser enviada aos irmãos
              para validação (botão abaixo).
            </p>
          )}
        </ActionForm>
      )}

      {/* Validação pelos irmãos — etapa anterior às assinaturas */}
      {!ata.signedByMasterId &&
        !ata.signedBySecId &&
        !ata.govbrUploadedAt &&
        ata.status !== "ASSINADA" && (
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
            {/* Cabeçalho institucional — espelha o PDF (ata-pdf.ts) */}
            <div className="relative mb-4 border-b-4 border-red-900 pb-3">
              {ata.lodge.logoUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={ata.lodge.logoUrl}
                  alt={`Símbolo de ${ata.lodge.name}`}
                  className="absolute left-0 top-0 h-16 w-16 object-contain"
                />
              )}
              <div className="px-16 text-center">
                <p className="text-base font-bold">
                  {ata.lodge.name} nº {ata.lodge.number}
                </p>
                {(ata.lodge.ataCabecalho ?? "")
                  .split("\n")
                  .map((l) => l.trim())
                  .filter(Boolean)
                  .concat(ata.lodge.address ? [ata.lodge.address] : [])
                  .map((line) => (
                    <p key={line} className="text-xs leading-5">
                      {line}
                    </p>
                  ))}
              </div>
            </div>
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
            {/* Rodapé institucional — espelha o PDF */}
            <div className="mt-10 border-t border-neutral-800 pt-2 text-center">
              <p className="text-xs font-bold">
                {ata.lodge.name} – nº {ata.lodge.number}
              </p>
              {ata.lodge.ataDivisa && (
                <p className="text-[11px] italic text-neutral-500">
                  “{ata.lodge.ataDivisa.replace(/^[“"]|[”"]$/g, "")}”
                </p>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {!ata.govbrSolicitado && (
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
            {ata.driveFileId && (
              <a
                href={`https://drive.google.com/file/d/${ata.driveFileId}/view`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center text-sm underline underline-offset-2"
              >
                Abrir PDF assinado no Drive
              </a>
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
      )}

      {/* Troca para o gov.br — só antes de qualquer assinatura interna */}
      {ata.status === "AGUARDANDO_ASSINATURAS" &&
        !ata.govbrSolicitado &&
        !ata.signedByMasterId &&
        !ata.signedBySecId &&
        canWriteSecretaria(user.role) && (
          <Card>
            <CardHeader>
              <CardTitle>Assinatura digital gov.br</CardTitle>
              <CardDescription>
                Esta ata segue pela assinatura normal. Se preferir, mude para a
                assinatura gov.br — ela substitui a assinatura no sistema (o VM
                assina primeiro; depois o Secretário).
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ActionButton
                action={encaminharGovbrAction}
                variant="outline"
                label="Mudar para assinatura gov.br"
              />
            </CardContent>
          </Card>
        )}

      {/* Assinatura digital gov.br — fluxo exclusivo, direto após a liberação */}
      {govbrLiberada && (
        <Card>
          <CardHeader>
            <CardTitle>Assinatura digital gov.br</CardTitle>
            <CardDescription>
              Esta ata é assinada exclusivamente pelo gov.br: o Venerável
              Mestre e o Secretário assinam o PDF com a conta gov.br
              (assinatura eletrônica avançada, validável em
              validar.iti.gov.br) — pelo portal assinador.iti.br, subindo o
              arquivo assinado aqui em seguida.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {govbr && (
              <p
                className={
                  govbr === "ok"
                    ? "rounded-md bg-emerald-50 p-2 text-emerald-800"
                    : "rounded-md bg-amber-50 p-2 text-amber-800"
                }
              >
                {govbrMensagens[govbr] ?? govbrMensagens.falhou}
              </p>
            )}
            <p>
              Venerável Mestre:{" "}
              {ata.govbrMasterAt
                ? `✅ assinado via gov.br em ${ata.govbrMasterAt.toLocaleString("pt-BR")}`
                : "⏳ pendente (assina primeiro)"}
            </p>
            <p>
              Secretário:{" "}
              {ata.govbrSecAt
                ? `✅ assinado via gov.br em ${ata.govbrSecAt.toLocaleString("pt-BR")}`
                : ata.govbrMasterAt
                  ? "⏳ pendente"
                  : "⏳ aguardando a assinatura do Venerável Mestre"}
            </p>
            <div className="flex flex-wrap gap-3">
              {govbrDisponivel && podeAssinarGovbr && (
                <a
                  href={`/api/govbr/authorize?ata=${ata.id}`}
                  className="inline-flex h-9 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90"
                >
                  Assinar com gov.br
                </a>
              )}
              {ata.govbrMasterAt || ata.govbrSecAt || ata.govbrUploadedAt ? (
                <a
                  href={`/api/govbr/pdf?ata=${ata.id}`}
                  className="inline-flex items-center text-sm underline underline-offset-2"
                >
                  Baixar PDF assinado (gov.br)
                </a>
              ) : null}
              {ata.driveFileId && (
                <a
                  href={`https://drive.google.com/file/d/${ata.driveFileId}/view`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center text-sm underline underline-offset-2"
                >
                  Abrir PDF assinado no Drive
                </a>
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

            {/* Fluxo externo: assinar no assinador.iti.br e subir o PDF */}
            {podeSubirGovbr && (
              <div className="space-y-3 rounded-md border p-3">
                <p className="font-medium">
                  {govbrEtapaVm
                    ? "Sua vez de assinar (Venerável Mestre)"
                    : "Sua vez de assinar (Secretário)"}
                </p>
                <ol className="list-decimal space-y-1 pl-5 text-muted-foreground">
                  <li>
                    <a
                      href={`/api/atas/pdf?ata=${ata.id}`}
                      className="underline underline-offset-2"
                    >
                      {govbrEtapaVm
                        ? "Baixe o PDF final da ata"
                        : "Baixe o PDF já assinado pelo Venerável Mestre"}
                    </a>
                    .
                  </li>
                  <li>
                    Assine o arquivo em{" "}
                    <a
                      href="https://assinador.iti.br"
                      target="_blank"
                      rel="noreferrer"
                      className="underline underline-offset-2"
                    >
                      assinador.iti.br
                    </a>{" "}
                    com a sua conta gov.br (nível prata ou ouro).
                  </li>
                  <li>Envie aqui o PDF assinado.</li>
                </ol>
                <ActionForm
                  action={uploadGovbrAction}
                  submitLabel="Enviar PDF assinado"
                >
                  <input
                    type="file"
                    name="file"
                    accept="application/pdf"
                    required
                    className="block w-full text-sm file:mr-3 file:rounded-md file:border-0 file:bg-secondary file:px-3 file:py-1.5 file:text-sm file:font-medium"
                  />
                </ActionForm>
              </div>
            )}

            {/* O Secretário pode voltar ao fluxo normal antes da 1ª assinatura gov.br */}
            {canWriteSecretaria(user.role) &&
              !ata.govbrMasterAt &&
              !ata.govbrUploadedAt && (
                <ActionButton
                  action={cancelarGovbrAction}
                  variant="outline"
                  label="Voltar para a assinatura normal"
                />
              )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
