import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { updateLodgeLogo } from "../../admin/actions";
import { disconnectGoogle } from "./actions";
import { ActionForm, ActionButton } from "@/components/action-form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { isOAuthAppConfigured } from "@/lib/google-drive";

const erros: Record<string, string> = {
  "oauth-nao-configurado":
    "O app Google não está configurado no servidor (GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET).",
  "google-negado": "Conexão cancelada no Google.",
  "sem-refresh-token":
    "O Google não devolveu a autorização completa. Tente novamente.",
  "google-falhou": "Falha ao concluir a conexão com o Google.",
};

export default async function LojaConfigPage({
  searchParams,
}: {
  searchParams: Promise<{ erro?: string; ok?: string }>;
}) {
  const user = await requireRole("VENERAVEL_MESTRE", "SECRETARIO");
  const sp = await searchParams;
  const lodge = await prisma.lodge.findUniqueOrThrow({
    where: { id: user.lodgeId },
  });

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Configurações da Loja</h1>
        <p className="text-sm text-muted-foreground">
          {lodge.name} nº {lodge.number}
          {lodge.oriente ? ` — Or∴ ${lodge.oriente}` : ""}
        </p>
      </div>

      {sp.erro && erros[sp.erro] && (
        <p className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950/40">
          {erros[sp.erro]}
        </p>
      )}
      {sp.ok && (
        <p className="rounded-md border border-green-300 bg-green-50 p-3 text-sm text-green-700 dark:bg-green-950/40">
          Conta Google conectada com sucesso.
        </p>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Logo da loja</CardTitle>
          <CardDescription>
            Exibido no menu lateral e nas telas do sistema. Imagem de até 500
            KB.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {lodge.logoUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={lodge.logoUrl}
              alt={`Logo de ${lodge.name}`}
              className="h-24 w-24 rounded-full border object-cover"
            />
          )}
          <ActionForm action={updateLodgeLogo} submitLabel="Atualizar logo">
            <div className="space-y-1">
              <Label htmlFor="logo">Nova imagem</Label>
              <Input id="logo" name="logo" type="file" accept="image/*" required />
            </div>
          </ActionForm>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Google Drive da Loja</CardTitle>
          <CardDescription>
            Conecte a conta Google da loja para que atas, pranchas e documentos
            sejam arquivados automaticamente numa pasta do Drive.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {lodge.googleRefreshToken ? (
            <>
              <p className="text-sm">
                Conectado como{" "}
                <Badge variant="secondary">{lodge.googleEmail ?? "conta Google"}</Badge>
              </p>
              <ActionButton
                action={disconnectGoogle}
                label="Desconectar conta Google"
                variant="outline"
              />
            </>
          ) : (
            <>
              <p className="text-sm text-muted-foreground">
                Nenhuma conta conectada.
                {!isOAuthAppConfigured() &&
                  " (O administrador do sistema ainda precisa configurar as credenciais OAuth do Google no servidor.)"}
              </p>
              <Button asChild disabled={!isOAuthAppConfigured()}>
                <a href="/api/google/connect">Conectar Google Drive</a>
              </Button>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
