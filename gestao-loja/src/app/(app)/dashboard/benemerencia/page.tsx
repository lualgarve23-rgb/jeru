import QRCode from "qrcode";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { buildPixPayload } from "@/lib/pix";
import { CopyButton } from "@/components/copy-button";
import { InfoDica } from "@/components/info-dica";
import { AJUDA } from "@/lib/ajuda";
import { HandCoins } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

/*
 * Bolsa de Benemerência: página de doação aberta a todos os irmãos. QR Code
 * Pix estático (sem valor — o doador escolhe no app do banco) da chave da
 * Benemerência; sem ela, vale a chave Pix das capitações. O cadastro da chave
 * é do Venerável Mestre, nas Configurações da Loja.
 */

export default async function BenemerenciaPage() {
  const user = await requireUser();
  const lodge = await prisma.lodge.findUniqueOrThrow({
    where: { id: user.lodgeId },
    select: {
      name: true,
      oriente: true,
      pixKey: true,
      pixKeyBenemerencia: true,
    },
  });

  const chave = lodge.pixKeyBenemerencia ?? lodge.pixKey;
  const payload = chave
    ? buildPixPayload({
        pixKey: chave,
        merchantName: lodge.name,
        merchantCity: lodge.oriente?.split("/")[0] ?? "SAO PAULO",
        txid: "***",
      })
    : null;
  const qr = payload
    ? await QRCode.toDataURL(payload, { width: 280, margin: 1 })
    : null;

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="flex items-center gap-1 text-2xl font-bold">
          Bolsa de Benemerência
          <InfoDica titulo="Bolsa de Benemerência" texto={AJUDA.benemerencia} />
        </h1>
      </div>

      <Card>
        <CardHeader className="text-center">
          <span className="mx-auto mb-1 flex h-12 w-12 items-center justify-center rounded-full bg-gold-soft">
            <HandCoins className="h-6 w-6 text-primary" />
          </span>
          <CardTitle>Bolsa de Benemerência da {lodge.name}</CardTitle>
          <CardDescription className="mx-auto max-w-md">
            Contribua com fraternidade. Sua ajuda transforma vidas e fortalece
            os laços da nossa ordem.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {!chave ? (
            <p className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
              A Loja ainda não cadastrou a chave Pix da Benemerência. O
              Venerável Mestre pode cadastrá-la nas Configurações da Loja.
            </p>
          ) : (
            <div className="flex flex-col items-center gap-4">
              {qr && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={qr}
                  alt="QR Code Pix da Bolsa de Benemerência"
                  className="h-56 w-56 rounded-md border bg-white p-2"
                />
              )}
              <p className="text-center text-sm text-muted-foreground">
                Aponte a câmera do seu banco para o QR Code, ou use o Pix Copia
                e Cola — o valor da doação é você quem escolhe no app.
              </p>
              {payload && <CopyButton text={payload} label="Copiar código Pix (Copia e Cola)" />}
              <p className="text-center text-xs text-muted-foreground">
                Chave Pix: <span className="font-medium">{chave}</span>
                {!lodge.pixKeyBenemerencia && " (chave das capitações da Loja)"}
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
