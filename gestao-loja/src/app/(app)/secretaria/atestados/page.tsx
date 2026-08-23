import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { solicitarAtestado } from "../_actions/atestados";
import { ActionButton } from "@/components/action-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { InfoDica } from "@/components/info-dica";
import { AJUDA } from "@/lib/ajuda";
import { LinhaDoTempo, type EtapaLinha } from "@/components/linha-do-tempo";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

/*
 * Página do solicitante. O irmão pede o atestado e acompanha, passo a passo,
 * com quem a assinatura está pendente — sem ver o fluxo interno. Quem assina
 * (Tesoureiro → Secretário → VM) trabalha na aba Processos.
 */

export default async function AtestadosPage() {
  const user = await requireUser();
  const podeAssinar = ["TESOUREIRO", "SECRETARIO", "VENERAVEL_MESTRE"].includes(
    user.role
  );

  const [meus, dbUser, pendentesLoja] = await Promise.all([
    prisma.atestadoRegularidade.findMany({
      where: { userId: user.id, lodgeId: user.lodgeId },
      orderBy: { solicitadoAt: "desc" },
      take: 10,
    }),
    prisma.user.findUniqueOrThrow({
      where: { id: user.id },
      select: { status: true },
    }),
    podeAssinar
      ? prisma.atestadoRegularidade.count({
          where: { lodgeId: user.lodgeId, status: "SOLICITADO" },
        })
      : 0,
  ]);

  const temPendente = meus.some((a) => a.status === "SOLICITADO");

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="flex items-center gap-1 text-2xl font-bold">
          Atestado de Regularidade
          <InfoDica titulo="Atestado de Regularidade" texto={AJUDA.atestado} />
        </h1>
        <p className="text-sm text-muted-foreground">
          Declaração de que o irmão é membro efetivo e está regular com os
          metais e demais deveres maçônicos, assinada pelo Tesoureiro, pelo
          Secretário e pelo Venerável Mestre — nesta ordem.
        </p>
      </div>

      {podeAssinar && (
        <p className="rounded-md border border-sky-200 bg-sky-50 p-3 text-sm text-sky-900">
          As assinaturas dos atestados dos irmãos ficam na aba{" "}
          <a href="/secretaria/processos" className="font-medium underline">
            Processos
          </a>
          {pendentesLoja > 0 && (
            <>
              {" "}
              — {pendentesLoja} aguardando assinatura
            </>
          )}
          .
        </p>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Meu atestado</CardTitle>
          <CardDescription>
            Solicite aqui e acompanhe com quem a assinatura está pendente. O
            PDF assinado fica disponível quando o Venerável Mestre concluir.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {dbUser.status !== "ATIVO" ? (
            <p className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
              Sua situação atual é {dbUser.status} — o atestado só pode ser
              emitido para membros com situação ATIVO. Procure a Tesouraria.
            </p>
          ) : temPendente ? (
            <p className="text-sm text-muted-foreground">
              Sua solicitação está em andamento — veja abaixo em que etapa está.
            </p>
          ) : (
            <ActionButton
              action={solicitarAtestado}
              label="Solicitar Atestado de Regularidade"
            />
          )}

          {meus.length > 0 && (
            <ul className="divide-y rounded-md border">
              {meus.map((a) => {
                const concluido = a.status === "ASSINADO";
                const etapas: EtapaLinha[] = [
                  { cargo: "Tesoureiro", at: a.signedByTesAt },
                  { cargo: "Secretário", at: a.signedBySecAt },
                  { cargo: "Venerável Mestre", at: a.signedByMasterAt },
                ];
                const pendenteCom = etapas.find((e) => !e.at)?.cargo;
                return (
                  <li key={a.id} className="space-y-2 p-3 text-sm">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span>
                        Solicitado em{" "}
                        {a.solicitadoAt.toLocaleDateString("pt-BR")}
                      </span>
                      <span className="flex items-center gap-2">
                        <Badge variant={concluido ? "default" : "secondary"}>
                          {concluido
                            ? "Documento pronto"
                            : `Pendente com: ${pendenteCom}`}
                        </Badge>
                        {concluido && (
                          <>
                            <Button asChild size="sm" variant="ghost">
                              <a
                                href={`/secretaria/atestados/${a.id}/pdf`}
                                target="_blank"
                                rel="noreferrer"
                              >
                                Ver PDF
                              </a>
                            </Button>
                            <Button asChild size="sm" variant="outline">
                              <a href={`/secretaria/atestados/${a.id}/pdf?download=1`}>
                                Baixar PDF
                              </a>
                            </Button>
                          </>
                        )}
                      </span>
                    </div>
                    <LinhaDoTempo etapas={etapas} concluido={concluido} />
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
