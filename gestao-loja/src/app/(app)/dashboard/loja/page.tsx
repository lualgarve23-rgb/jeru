import { InfoDica } from "@/components/info-dica";
import { AJUDA } from "@/lib/ajuda";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { updateLodgeLogo } from "../../admin/actions";
import {
  disconnectGoogle,
  updateMinFreqProgressao,
  updateLimiteInadimplencia,
  updateCertTemplate,
  removeCertTemplate,
  updateInstrucoesNecessarias,
  updateAtaCabecalho,
} from "./actions";
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
  "sem-permissao-drive":
    "A permissão do Google Drive não foi marcada na tela do Google. Conecte novamente e marque a caixa de acesso ao Drive.",
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
        <h1 className="flex items-center gap-1 text-2xl font-bold">Configurações da Loja<InfoDica titulo="Configurações da Loja" texto={AJUDA.configloja} /></h1>
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
          <CardTitle>Cabeçalho das Atas</CardTitle>
          <CardDescription>
            Linhas institucionais exibidas no topo do PDF das atas, abaixo do
            nome da Loja e ao lado do símbolo (o logo acima), e a divisa que
            aparece no rodapé de cada página. O endereço da sede cadastrado já
            entra como última linha do cabeçalho.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ActionForm action={updateAtaCabecalho} submitLabel="Salvar cabeçalho">
            <div className="space-y-1">
              <Label htmlFor="cabecalho">Linhas do cabeçalho (uma por linha)</Label>
              <textarea
                id="cabecalho"
                name="cabecalho"
                rows={4}
                className="w-full rounded-md border bg-transparent p-3 text-sm"
                placeholder={
                  "LOJA BENFEITORA DA FAMÍLIA\nFundada em 15 de novembro de 1998 – Or∴ de São Paulo – Ritual de Emulação\nFederada ao G∴O∴B∴ Jurisdicionada ao G∴O∴B∴ de São Paulo"
                }
                defaultValue={lodge.ataCabecalho ?? ""}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="divisa">Divisa do rodapé</Label>
              <Input
                id="divisa"
                name="divisa"
                placeholder="...Ele continua a proteger nossa Ordem, cimentando-a e adornando-a com todas as virtudes morais e sociais"
                defaultValue={lodge.ataDivisa ?? ""}
              />
            </div>
          </ActionForm>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Instruções de Grau</CardTitle>
          <CardDescription>
            Nº de instruções que Aprendizes (com o 2º Vigilante) e Companheiros
            (com o 1º Vigilante) precisam receber antes da progressão de grau.
            Use 0 para não exigir.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ActionForm
            action={updateInstrucoesNecessarias}
            submitLabel="Salvar exigências"
          >
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label htmlFor="instrucoesAprendiz">
                  Instruções de Aprendiz
                </Label>
                <Input
                  id="instrucoesAprendiz"
                  name="instrucoesAprendiz"
                  type="number"
                  min={0}
                  max={99}
                  defaultValue={lodge.instrucoesAprendiz}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="instrucoesCompanheiro">
                  Instruções de Companheiro
                </Label>
                <Input
                  id="instrucoesCompanheiro"
                  name="instrucoesCompanheiro"
                  type="number"
                  min={0}
                  max={99}
                  defaultValue={lodge.instrucoesCompanheiro}
                />
              </div>
            </div>
          </ActionForm>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Certificado de Visita</CardTitle>
          <CardDescription>
            Template PPTX usado no certificado enviado aos visitantes. Os
            marcadores <code>&lt;&lt;NOME DO IRMÃO&gt;&gt;</code> e{" "}
            <code>&lt;&lt;SESSAO&gt;&gt;</code> são obrigatórios;{" "}
            <code>&lt;&lt;EMAIL&gt;&gt;</code> e{" "}
            <code>&lt;&lt;VENERAVEL&gt;&gt;</code> são opcionais.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <Badge variant={lodge.certFundoPdf ? "default" : "secondary"}>
              {lodge.certFundoPdf ? "Template personalizado" : "Template padrão"}
            </Badge>
            <Button asChild variant="outline" size="sm">
              <a
                href="/dashboard/loja/certificado-preview"
                target="_blank"
                rel="noreferrer"
              >
                Ver preview (PDF)
              </a>
            </Button>
            {lodge.certFundoPdf && (
              <ActionButton
                action={removeCertTemplate}
                label="Voltar ao padrão"
                variant="outline"
              />
            )}
          </div>
          <ActionForm action={updateCertTemplate} submitLabel="Enviar template">
            <div className="space-y-1">
              <Label htmlFor="template">Novo template (.pptx)</Label>
              <Input
                id="template"
                name="template"
                type="file"
                accept=".pptx"
                required
              />
            </div>
          </ActionForm>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Progressão de Graus</CardTitle>
          <CardDescription>
            Frequência mínima nas sessões, medida desde o início do processo,
            para o obreiro sair da coluna &quot;Instrução e Frequência&quot; do
            Kanban. Ajuste conforme o regulamento da sua potência.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ActionForm
            action={updateMinFreqProgressao}
            submitLabel="Salvar frequência mínima"
          >
            <div className="space-y-1">
              <Label htmlFor="minFreq">Frequência mínima (%)</Label>
              <Input
                id="minFreq"
                name="minFreq"
                type="number"
                min={0}
                max={100}
                step={1}
                defaultValue={lodge.minFreqProgressao}
                required
                className="max-w-32"
              />
            </div>
          </ActionForm>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Inadimplência</CardTitle>
          <CardDescription>
            Número de capitações vencidas a partir do qual o membro passa
            automaticamente a IRREGULAR. Ao quitar, ele volta a ATIVO sozinho.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ActionForm
            action={updateLimiteInadimplencia}
            submitLabel="Salvar limite"
          >
            <div className="space-y-1">
              <Label htmlFor="limite">Capitações vencidas</Label>
              <Input
                id="limite"
                name="limite"
                type="number"
                min={1}
                max={24}
                step={1}
                defaultValue={lodge.limiteInadimplencia}
                required
                className="max-w-32"
              />
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
