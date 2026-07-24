import QRCode from "qrcode";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { InfoDica } from "@/components/info-dica";
import { AJUDA } from "@/lib/ajuda";
import { degreeLabels, memberStatusLabels, roleLabels } from "@/lib/labels";
import { PrintButton } from "@/components/print-button";
import { cn } from "@/lib/utils";

export default async function CarteirinhaPage() {
  const user = await requireUser();
  const me = await prisma.user.findUniqueOrThrow({
    where: { id: user.id },
    select: {
      name: true,
      cim: true,
      degree: true,
      currentRole: true,
      cargoRito: true,
      status: true,
      photoUrl: true,
      initiationDate: true,
      cardToken: true,
      lodge: {
        select: {
          name: true,
          number: true,
          potencia: true,
          oriente: true,
          logoUrl: true,
        },
      },
    },
  });

  const baseUrl = process.env.APP_URL ?? "http://localhost:3100";
  const verifyUrl = `${baseUrl}/verificar/${me.cardToken}`;
  const qrDataUrl = await QRCode.toDataURL(verifyUrl, {
    width: 180,
    margin: 1,
  });
  const regular = me.status === "ATIVO";

  return (
    <div className="max-w-2xl space-y-6">
      <div className="flex items-center justify-between print:hidden">
        <h1 className="flex items-center gap-1 text-2xl font-bold">
          Carteirinha Digital
          <InfoDica titulo="Carteirinha Digital" texto={AJUDA.carteirinha} />
        </h1>
        <PrintButton />
      </div>

      {/* Carteirinha — proporção de cartão, imprimível */}
      <div className="mx-auto w-full max-w-md overflow-hidden rounded-2xl border bg-white shadow-md print:mx-0 print:max-w-sm print:shadow-none">
        <div className="flex items-center gap-3 bg-primary px-5 py-3 text-primary-foreground">
          {me.lodge.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={me.lodge.logoUrl}
              alt={`Logo da Loja ${me.lodge.name}`}
              className="h-10 w-10 rounded-full bg-white object-contain"
            />
          ) : null}
          <div className="min-w-0">
            <p className="truncate text-sm font-bold leading-tight">
              {me.lodge.name} nº {me.lodge.number}
            </p>
            <p className="truncate text-xs opacity-80">
              {[me.lodge.potencia, me.lodge.oriente]
                .filter(Boolean)
                .join(" — ") || "Identificação Maçônica"}
            </p>
          </div>
        </div>

        <div className="flex gap-4 p-5">
          {me.photoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={me.photoUrl}
              alt={`Foto de ${me.name}`}
              className="h-28 w-24 shrink-0 rounded-lg border object-cover"
            />
          ) : (
            <div className="flex h-28 w-24 shrink-0 items-center justify-center rounded-lg border bg-muted text-xs text-muted-foreground">
              Sem foto
            </div>
          )}
          <div className="min-w-0 flex-1 space-y-1.5">
            <p className="text-base font-bold leading-tight">{me.name}</p>
            <dl className="space-y-0.5 text-sm">
              <div className="flex gap-1">
                <dt className="text-muted-foreground">CIM:</dt>
                <dd className="font-medium">{me.cim}</dd>
              </div>
              <div className="flex gap-1">
                <dt className="text-muted-foreground">Grau:</dt>
                <dd className="font-medium">
                  {degreeLabels[me.degree] ?? me.degree}
                </dd>
              </div>
              <div className="flex gap-1">
                <dt className="text-muted-foreground">Cargo:</dt>
                <dd className="font-medium">
                  {me.cargoRito ??
                    roleLabels[me.currentRole] ??
                    me.currentRole}
                </dd>
              </div>
              {me.initiationDate && (
                <div className="flex gap-1">
                  <dt className="text-muted-foreground">Iniciação:</dt>
                  <dd className="font-medium">
                    {me.initiationDate.toLocaleDateString("pt-BR")}
                  </dd>
                </div>
              )}
            </dl>
            <span
              className={cn(
                "inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold",
                regular
                  ? "bg-green-100 text-green-800"
                  : "bg-amber-100 text-amber-800"
              )}
            >
              {memberStatusLabels[me.status] ?? me.status}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-4 border-t bg-muted/40 px-5 py-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={qrDataUrl}
            alt="QR Code de verificação da carteirinha"
            className="h-24 w-24 shrink-0 rounded-md border bg-white"
          />
          <p className="text-xs text-muted-foreground">
            Escaneie o QR Code para verificar a autenticidade desta
            identificação. A consulta mostra apenas nome, CIM, Loja, grau e
            situação — sem dados pessoais.
          </p>
        </div>
      </div>
    </div>
  );
}
