import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { textoAtestado } from "@/lib/atestado";
import {
  solicitarAtestado,
  signAtestadoInline,
} from "../_actions/atestados";
import { ActionButton } from "@/components/action-form";
import { InlineSignDialog } from "@/components/inline-sign-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { InfoDica } from "@/components/info-dica";
import { AJUDA } from "@/lib/ajuda";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

const govbrMsgs: Record<string, string> = {
  ok: "Assinatura gov.br registrada no atestado.",
  "nao-configurado": "A assinatura gov.br não está configurada no servidor.",
  negado: "Autorização cancelada no gov.br.",
  "cpf-divergente":
    "A conta gov.br usada não é do próprio assinante (CPF divergente).",
  "ja-assinou": "Você já assinou este atestado.",
  "sessao-expirada": "Sessão do gov.br expirou — tente novamente.",
  falhou: "A assinatura gov.br falhou — tente novamente.",
};

export default async function AtestadosPage({
  searchParams,
}: {
  searchParams: Promise<{ govbr?: string }>;
}) {
  const user = await requireUser();
  const sp = await searchParams;
  const podeAssinar = ["VENERAVEL_MESTRE", "SECRETARIO"].includes(user.role);

  const [meus, pendentes, lodge, dbUser] = await Promise.all([
    prisma.atestadoRegularidade.findMany({
      where: { userId: user.id, lodgeId: user.lodgeId },
      orderBy: { solicitadoAt: "desc" },
      take: 10,
    }),
    podeAssinar
      ? prisma.atestadoRegularidade.findMany({
          where: { lodgeId: user.lodgeId, status: "SOLICITADO" },
          include: { user: { select: { name: true, cim: true, status: true } } },
          orderBy: { solicitadoAt: "asc" },
        })
      : [],
    prisma.lodge.findUniqueOrThrow({
      where: { id: user.lodgeId },
      select: { oriente: true },
    }),
    prisma.user.findUniqueOrThrow({
      where: { id: user.id },
      select: { status: true, name: true, cim: true },
    }),
  ]);

  const temPendente = meus.some((a) => a.status === "SOLICITADO");
  const govbrMsg = sp.govbr ? (govbrMsgs[sp.govbr] ?? govbrMsgs.falhou) : null;

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="flex items-center gap-1 text-2xl font-bold">
          Atestado de Regularidade
          <InfoDica
            titulo="Atestado de Regularidade"
            texto={AJUDA.atestado}
          />
        </h1>
        <p className="text-sm text-muted-foreground">
          Declaração de que o irmão é membro efetivo e está regular com os
          metais e demais deveres maçônicos, assinada pelo Venerável Mestre e
          pelo Secretário.
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

      <Card>
        <CardHeader>
          <CardTitle>Meu atestado</CardTitle>
          <CardDescription>
            Solicite aqui — o documento segue para as assinaturas do Secretário
            e do Venerável Mestre e fica disponível em PDF quando concluído.
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
              Sua solicitação está aguardando as assinaturas.
            </p>
          ) : (
            <ActionButton
              action={solicitarAtestado}
              label="Solicitar Atestado de Regularidade"
            />
          )}

          {meus.length > 0 && (
            <ul className="divide-y rounded-md border">
              {meus.map((a) => (
                <li
                  key={a.id}
                  className="flex flex-wrap items-center justify-between gap-2 p-3 text-sm"
                >
                  <span>
                    Solicitado em {a.solicitadoAt.toLocaleDateString("pt-BR")}
                  </span>
                  <span className="flex items-center gap-2">
                    <Badge
                      variant={a.status === "ASSINADO" ? "default" : "secondary"}
                    >
                      {a.status === "ASSINADO"
                        ? "Assinado"
                        : `Aguardando assinatura${!a.signedBySecAt && !a.signedByMasterAt ? "s" : ""} (${[!a.signedBySecAt && "Secretário", !a.signedByMasterAt && "Venerável"].filter(Boolean).join(" e ")})`}
                    </Badge>
                    {a.status === "ASSINADO" && (
                      <Button asChild size="sm" variant="outline">
                        <a
                          href={`/secretaria/atestados/${a.id}/pdf`}
                          target="_blank"
                          rel="noreferrer"
                        >
                          Baixar PDF
                        </a>
                      </Button>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {podeAssinar && (
        <Card>
          <CardHeader>
            <CardTitle>Assinaturas pendentes</CardTitle>
            <CardDescription>
              Atestados solicitados pelos irmãos aguardando a dupla assinatura.
              Assine com sua senha (a imagem da sua assinatura entra no PDF) ou
              pelo gov.br (assinatura digital ICP/ITI).
            </CardDescription>
          </CardHeader>
          <CardContent>
            {pendentes.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Nenhum atestado aguardando assinatura.
              </p>
            ) : (
              <ul className="divide-y rounded-md border">
                {pendentes.map((a) => {
                  const jaAssinei =
                    user.role === "VENERAVEL_MESTRE"
                      ? !!a.signedByMasterAt
                      : !!a.signedBySecAt;
                  return (
                    <li key={a.id} className="space-y-2 p-3 text-sm">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span>
                          <strong>{a.user.name}</strong> · CIM {a.user.cim}
                          <span className="ml-2 text-xs text-muted-foreground">
                            solicitado em{" "}
                            {a.solicitadoAt.toLocaleDateString("pt-BR")}
                          </span>
                        </span>
                        {a.user.status !== "ATIVO" && (
                          <Badge className="border-red-200 bg-red-50 text-red-700">
                            {a.user.status}
                          </Badge>
                        )}
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant={a.signedBySecAt ? "default" : "secondary"}>
                          Secretário {a.signedBySecAt ? "✓" : "pendente"}
                        </Badge>
                        <Badge
                          variant={a.signedByMasterAt ? "default" : "secondary"}
                        >
                          Venerável {a.signedByMasterAt ? "✓" : "pendente"}
                        </Badge>
                        <Button asChild size="sm" variant="ghost">
                          <a
                            href={`/secretaria/atestados/${a.id}/pdf`}
                            target="_blank"
                            rel="noreferrer"
                          >
                            Ver PDF
                          </a>
                        </Button>
                        {!jaAssinei && a.user.status === "ATIVO" && (
                          <>
                            <InlineSignDialog
                              title={`Assinar atestado de ${a.user.name}`}
                              description="A confirmação por senha é o ato formal de assinatura; a imagem da sua assinatura entra no PDF."
                              preview={textoAtestado({
                                nome: a.user.name,
                                cim: a.user.cim,
                                oriente: lodge.oriente,
                              })}
                              action={signAtestadoInline.bind(null, a.id)}
                            />
                            <Button asChild size="sm" variant="outline">
                              <a href={`/api/govbr/authorize?atestado=${a.id}`}>
                                Assinar com gov.br
                              </a>
                            </Button>
                          </>
                        )}
                        {jaAssinei && (
                          <span className="text-xs text-muted-foreground">
                            Você já assinou.
                          </span>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
