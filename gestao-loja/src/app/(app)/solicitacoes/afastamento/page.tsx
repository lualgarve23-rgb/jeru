import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { isGovbrConfigured } from "@/lib/govbr";
import {
  DIAS_MAX_AFASTAMENTO,
  etapasAfastamento,
  pendenteComAfastamento,
} from "@/lib/afastamento";
import {
  solicitarAfastamento,
  uploadRequerimentoAssinadoGovbr,
  cancelarAfastamento,
} from "./actions";
import { PortalIti } from "@/app/(app)/secretaria/processos/assinaturas-pendentes";
import { ActionForm, ActionButton } from "@/components/action-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { InfoDica } from "@/components/info-dica";
import { AJUDA } from "@/lib/ajuda";
import { LinhaDoTempo } from "@/components/linha-do-tempo";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

/*
 * Página do solicitante do Pedido de Afastamento (Form. 116). O irmão abre o
 * pedido, assina o requerimento com a PRÓPRIA conta gov.br e acompanha a
 * linha do tempo (deliberação → Secretário → VM → Guarda dos Selos). A
 * Secretaria trabalha na aba Processos.
 */

const govbrMsgs: Record<string, string> = {
  ok: "Requerimento assinado com a sua conta gov.br — o pedido seguiu à Secretaria.",
  "nao-configurado": "A assinatura gov.br não está configurada no servidor — use o portal assinador.iti.br abaixo.",
  negado: "Autorização cancelada no gov.br.",
  "cpf-divergente": "A conta gov.br usada não é a sua (CPF divergente do cadastro).",
  "ja-assinou": "Este requerimento já está assinado.",
  "nao-assinante": "Só o próprio irmão assina o requerimento.",
  falhou: "A assinatura gov.br falhou — tente novamente ou use o portal assinador.iti.br.",
};

export default async function AfastamentoPage({
  searchParams,
}: {
  searchParams: Promise<{ govbr?: string }>;
}) {
  const user = await requireUser();
  const sp = await searchParams;
  const govbrMsg = sp.govbr ? (govbrMsgs[sp.govbr] ?? govbrMsgs.falhou) : null;
  const govbrOk = isGovbrConfigured();
  const gestor = ["SECRETARIO", "VENERAVEL_MESTRE"].includes(user.role);

  const [meus, dbUser, pendentesLoja] = await Promise.all([
    prisma.pedidoAfastamento.findMany({
      where: { userId: user.id, lodgeId: user.lodgeId },
      orderBy: { createdAt: "desc" },
      take: 10,
      select: {
        id: true,
        status: true,
        dias: true,
        motivo: true,
        dataInicio: true,
        createdAt: true,
        updatedAt: true,
        requerimentoSignedAt: true,
        dataSessao: true,
        artigo: true,
        signedBySecAt: true,
        signedByMasterAt: true,
        enviadoAt: true,
        parecer: true,
      },
    }),
    prisma.user.findUniqueOrThrow({
      where: { id: user.id },
      select: { status: true },
    }),
    gestor
      ? prisma.pedidoAfastamento.count({
          where: {
            lodgeId: user.lodgeId,
            OR: [
              { status: { in: ["SOLICITADO", "EM_ASSINATURA"] } },
              { status: "ASSINADO", enviadoAt: null },
            ],
          },
        })
      : 0,
  ]);

  const emAndamento = meus.find((p) =>
    ["AGUARDANDO_OBREIRO", "SOLICITADO", "EM_ASSINATURA"].includes(p.status)
  );

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="flex items-center gap-1 text-2xl font-bold">
          Pedido de Afastamento (Form. 116)
          <InfoDica titulo="Pedido de Afastamento" texto={AJUDA.afastamento} />
        </h1>
        <p className="text-sm text-muted-foreground">
          Licença do quadro de obreiros por prazo determinado. Você assina o
          requerimento com a sua conta gov.br; a Loja delibera em sessão e o
          Form. 116 é assinado pelo Secretário e pelo Venerável Mestre e
          enviado à Guarda dos Selos.
        </p>
      </div>

      {govbrMsg && (
        <p
          className={`rounded-md border p-3 text-sm ${
            sp.govbr === "ok"
              ? "border-emerald-200 bg-emerald-50 text-emerald-800"
              : "border-amber-200 bg-amber-50 text-amber-800"
          }`}
        >
          {govbrMsg}
        </p>
      )}

      {gestor && (
        <p className="rounded-md border border-sky-200 bg-sky-50 p-3 text-sm text-sky-900">
          O registro da sessão, as assinaturas do Form. 116 e o envio à Guarda
          dos Selos ficam na aba{" "}
          <a href="/secretaria/processos" className="font-medium underline">
            Processos
          </a>
          {pendentesLoja > 0 && <> — {pendentesLoja} pedido(s) em andamento</>}.
        </p>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Meu pedido</CardTitle>
          <CardDescription>
            Informe o prazo e o motivo. O requerimento é gerado em PDF e
            precisa da sua assinatura gov.br para chegar à Secretaria.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {emAndamento ? (
            <p className="text-sm text-muted-foreground">
              Você tem um pedido em andamento — veja abaixo em que etapa está.
            </p>
          ) : dbUser.status !== "ATIVO" ? (
            <p className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
              Sua situação atual é {dbUser.status} — o pedido de afastamento é
              para membros com situação ATIVO.
              {dbUser.status === "LICENCIADO" &&
                " Para retornar às atividades, fale com a Secretaria."}
            </p>
          ) : (
            <ActionForm action={solicitarAfastamento} submitLabel="Gerar requerimento">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label htmlFor="dias">Prazo (dias)</Label>
                  <Input
                    id="dias"
                    name="dias"
                    type="number"
                    min={1}
                    max={DIAS_MAX_AFASTAMENTO}
                    required
                    placeholder="ex.: 90"
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="dataInicio">Início pretendido (opcional)</Label>
                  <Input id="dataInicio" name="dataInicio" type="date" />
                </div>
              </div>
              <div className="space-y-1">
                <Label htmlFor="motivo">Motivo</Label>
                <textarea
                  id="motivo"
                  name="motivo"
                  required
                  minLength={10}
                  rows={4}
                  className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  placeholder="Descreva o motivo do afastamento (constará no requerimento)."
                />
              </div>
              <p className="text-xs text-muted-foreground">
                A licença conta a partir da sessão que a conceder, como manda o
                Form. 116; a data acima é informativa.
              </p>
            </ActionForm>
          )}

          {meus.length > 0 && (
            <ul className="divide-y rounded-md border">
              {meus.map((p) => {
                const concluido = p.status === "ASSINADO" && !!p.enviadoAt;
                const indeferido = p.status === "INDEFERIDO";
                const etapas = etapasAfastamento(p);
                const base = `/solicitacoes/afastamento/${p.id}`;
                return (
                  <li key={p.id} className="space-y-2 p-3 text-sm">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span>
                        Pedido de {p.createdAt.toLocaleDateString("pt-BR")} · {p.dias} dias
                        {p.dataSessao && (
                          <span className="ml-2 text-xs text-muted-foreground">
                            concedida em sessão de {p.dataSessao.toLocaleDateString("pt-BR")} (Art. {p.artigo})
                          </span>
                        )}
                      </span>
                      <Badge
                        variant={concluido ? "default" : indeferido ? "destructive" : "secondary"}
                      >
                        {pendenteComAfastamento(p)}
                      </Badge>
                    </div>
                    {!indeferido && <LinhaDoTempo etapas={etapas} concluido={concluido} />}
                    {indeferido && p.parecer && (
                      <p className="rounded-md border border-red-200 bg-red-50 p-2 text-xs text-red-800">
                        Motivo do indeferimento: {p.parecer}
                      </p>
                    )}
                    <div className="flex flex-wrap items-center gap-2">
                      {p.status === "AGUARDANDO_OBREIRO" && govbrOk && (
                        <Button asChild size="sm">
                          <a href={`/api/govbr/authorize?afastamento=${p.id}`}>
                            Assinar requerimento com gov.br
                          </a>
                        </Button>
                      )}
                      <Button asChild size="sm" variant="ghost">
                        <a href={`${base}/requerimento`} target="_blank" rel="noreferrer">
                          {p.requerimentoSignedAt ? "Ver requerimento assinado" : "Ver requerimento"}
                        </a>
                      </Button>
                      {(p.signedBySecAt || p.signedByMasterAt) && (
                        <Button asChild size="sm" variant="outline">
                          <a href={`${base}/formulario?download=1`}>
                            {p.status === "ASSINADO" ? "Baixar Form. 116 assinado" : "Baixar Form. 116"}
                          </a>
                        </Button>
                      )}
                      {["AGUARDANDO_OBREIRO", "SOLICITADO"].includes(p.status) && (
                        <ActionButton
                          action={cancelarAfastamento.bind(null, p.id)}
                          label="Cancelar pedido"
                          variant="outline"
                          confirm="Cancelar este pedido de afastamento?"
                        />
                      )}
                    </div>
                    {p.status === "AGUARDANDO_OBREIRO" && (
                      <PortalIti
                        href={`${base}/requerimento?download=1`}
                        action={uploadRequerimentoAssinadoGovbr.bind(null, p.id)}
                        comAnteriores={false}
                      />
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
