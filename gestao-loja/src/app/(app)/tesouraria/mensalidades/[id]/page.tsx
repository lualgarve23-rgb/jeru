import { notFound } from "next/navigation";
import QRCode from "qrcode";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { canWriteTesouraria } from "@/lib/permissions";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { CopyButton } from "@/components/copy-button";

export default async function CobrancaPixPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireUser();
  const { id } = await params;
  const invoice = await prisma.invoice.findUnique({
    where: { id, lodgeId: user.lodgeId },
    include: { user: true },
  });
  if (!invoice) notFound();
  // Obreiro comum só vê a própria cobrança
  if (
    !canWriteTesouraria(user.role) &&
    user.role !== "CONSELHO_CONTAS" &&
    invoice.userId !== user.id
  ) {
    notFound();
  }

  const qr = invoice.pixCopiaECola
    ? await QRCode.toDataURL(invoice.pixCopiaECola, { width: 260 })
    : null;

  return (
    <div className="max-w-md space-y-4">
      <h1 className="text-2xl font-bold">Cobrança Pix</h1>
      <Card>
        <CardHeader>
          <CardTitle>{invoice.description}</CardTitle>
          <CardDescription>
            {invoice.user.name} · vencimento{" "}
            {invoice.dueDate.toLocaleDateString("pt-BR")}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-3xl font-bold">
            {(invoice.amountCents / 100).toLocaleString("pt-BR", {
              style: "currency",
              currency: "BRL",
            })}
          </p>
          <Badge variant={invoice.status === "PAGA" ? "default" : "outline"}>
            {invoice.status}
          </Badge>
          {invoice.status !== "PAGA" && qr && (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={qr} alt="QR Code Pix" className="rounded border" />
              <div className="space-y-2">
                <p className="text-xs font-semibold">Pix Copia e Cola:</p>
                <p className="break-all rounded bg-neutral-100 p-2 text-xs dark:bg-neutral-900">
                  {invoice.pixCopiaECola}
                </p>
                <CopyButton text={invoice.pixCopiaECola!} />
              </div>
              <p className="text-xs text-neutral-500">
                txid: {invoice.pixTxid} — a baixa é automática via webhook após
                a confirmação do pagamento.
              </p>
            </>
          )}
          {invoice.status === "PAGA" && (
            <p className="text-sm text-green-700">
              Pago em {invoice.paidAt?.toLocaleString("pt-BR")} (
              {invoice.paidMethod}).
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
