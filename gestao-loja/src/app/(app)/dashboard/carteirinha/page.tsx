import { mediaSrc } from "@/lib/media-url";
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

      {/* Carteirinha premium — estilo cartão de banco, imprimível */}
      <div className="bg-card-premium shadow-glow-gold animate-rise relative mx-auto w-full max-w-md overflow-hidden rounded-3xl text-white print:mx-0 print:max-w-sm print:rounded-2xl print:shadow-none">
        {/* Marca-d'água decorativa (esquadro estilizado) */}
        <svg
          aria-hidden
          viewBox="0 0 100 100"
          className="pointer-events-none absolute -right-6 -top-6 h-44 w-44 text-white/[0.06]"
          fill="currentColor"
        >
          <path d="M50 5 92 60H8L50 5zm0 14L27 50h46L50 19z" />
          <circle cx="50" cy="76" r="14" className="text-gold-bright/20" fill="currentColor" />
        </svg>

        <div className="relative flex items-center gap-3 px-6 pb-3 pt-5">
          {me.lodge.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={me.lodge.logoUrl}
              alt={`Logo da Loja ${me.lodge.name}`}
              className="h-11 w-11 rounded-full bg-white object-contain ring-2 ring-gold-bright/70"
            />
          ) : null}
          <div className="min-w-0">
            <p className="truncate text-sm font-bold leading-tight">
              {me.lodge.name} nº {me.lodge.number}
            </p>
            <p className="truncate text-[11px] uppercase tracking-widest text-gold-bright">
              {[me.lodge.potencia, me.lodge.oriente]
                .filter(Boolean)
                .join(" — ") || "Identificação Maçônica"}
            </p>
          </div>
        </div>

        <div className="gold-line mx-6 h-px" />

        <div className="relative flex gap-4 px-6 py-5">
          {me.photoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={mediaSrc(me.photoUrl)!}
              alt={`Foto de ${me.name}`}
              className="h-28 w-24 shrink-0 rounded-xl object-cover ring-2 ring-gold-bright/60"
            />
          ) : (
            <div className="flex h-28 w-24 shrink-0 items-center justify-center rounded-xl bg-white/10 text-xs text-white/60 ring-1 ring-white/20">
              Sem foto
            </div>
          )}
          <div className="min-w-0 flex-1 space-y-2">
            <p className="text-lg font-bold leading-tight">{me.name}</p>
            <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-sm">
              <div>
                <dt className="text-[10px] uppercase tracking-wider text-white/55">CIM</dt>
                <dd className="font-semibold tabular-nums">{me.cim}</dd>
              </div>
              <div>
                <dt className="text-[10px] uppercase tracking-wider text-white/55">Grau</dt>
                <dd className="font-semibold">{degreeLabels[me.degree] ?? me.degree}</dd>
              </div>
              <div className="col-span-2">
                <dt className="text-[10px] uppercase tracking-wider text-white/55">Cargo</dt>
                <dd className="font-semibold">
                  {me.cargoRito ?? roleLabels[me.currentRole] ?? me.currentRole}
                </dd>
              </div>
              {me.initiationDate && (
                <div>
                  <dt className="text-[10px] uppercase tracking-wider text-white/55">
                    Iniciação
                  </dt>
                  <dd className="font-semibold tabular-nums">
                    {me.initiationDate.toLocaleDateString("pt-BR")}
                  </dd>
                </div>
              )}
            </dl>
            <span
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ring-1 backdrop-blur",
                regular
                  ? "bg-emerald-400/15 text-emerald-200 ring-emerald-300/40"
                  : "bg-amber-400/15 text-amber-200 ring-amber-300/40"
              )}
            >
              <span
                className={cn(
                  "h-1.5 w-1.5 rounded-full",
                  regular ? "bg-emerald-300" : "bg-amber-300"
                )}
              />
              {memberStatusLabels[me.status] ?? me.status}
            </span>
          </div>
        </div>

        <div className="relative mx-4 mb-4 flex items-center gap-4 rounded-2xl bg-white px-4 py-3.5 text-foreground">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={qrDataUrl}
            alt="QR Code de verificação da carteirinha"
            className="h-24 w-24 shrink-0 rounded-lg"
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
