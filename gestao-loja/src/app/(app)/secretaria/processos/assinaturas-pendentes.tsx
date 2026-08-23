import { prisma } from "@/lib/prisma";
import { isGovbrConfigured } from "@/lib/govbr";
import { ordemAssinaturaAtestado } from "@/lib/atestado";
import { ordemAssinaturaQuitte, bloqueioAssinaturaQuitte } from "@/lib/quitte";
import { uploadAtestadoAssinadoGovbr, excluirAtestado } from "../_actions/atestados";
import { uploadQuittePlacetAssinadoGovbr, excluirQuittePlacet } from "../_actions/quitte";
import { canWriteSecretaria } from "@/lib/permissions";
import { AutoDownload } from "@/components/auto-download";
import { ActionForm, ActionButton } from "@/components/action-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

type ActionResult = { error?: string; ok?: string } | undefined;

/*
 * Assinaturas de Atestado de Regularidade e de Quitte Placet na aba
 * Processos. O solicitante acompanha o andamento na página do documento;
 * quem assina (Tesoureiro/Secretário/VM) trabalha sempre aqui — é a caixa
 * de entrada única de assinaturas gov.br de todos os cargos.
 */

function PortalIti({
  href,
  action,
  comAnteriores,
  chave,
}: {
  href: string;
  action: (prev: ActionResult, fd: FormData) => Promise<ActionResult>;
  comAnteriores: boolean;
  chave?: string;
}) {
  return (
    <details className="rounded-md border bg-muted/20 p-3">
      <summary className="cursor-pointer text-sm font-medium">
        Assinar pelo gov.br (portal assinador.iti.br)
      </summary>
      <div className="mt-2 space-y-3">
        {comAnteriores && chave && <AutoDownload href={href} chave={chave} />}
        <ol className="list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
          <li>
            {comAnteriores
              ? "O PDF já com as assinaturas anteriores baixa automaticamente — se não baixar, "
              : "Baixe o PDF: "}
            <a href={href} className="font-medium text-primary hover:underline">
              clique aqui
            </a>
            .
          </li>
          <li>
            Assine o arquivo em{" "}
            <a
              href="https://assinador.iti.br"
              target="_blank"
              rel="noreferrer"
              className="font-medium text-primary hover:underline"
            >
              assinador.iti.br
            </a>{" "}
            com a sua conta gov.br (nível prata ou ouro).
          </li>
          <li>Envie aqui o PDF assinado.</li>
        </ol>
        <ActionForm action={action} submitLabel="Enviar PDF assinado">
          <input
            type="file"
            name="file"
            accept="application/pdf"
            required
            className="block w-full text-sm file:mr-3 file:rounded-md file:border-0 file:bg-secondary file:px-3 file:py-1.5 file:text-sm file:font-medium"
          />
        </ActionForm>
      </div>
    </details>
  );
}

export async function AtestadosParaAssinar({
  lodgeId,
  role,
}: {
  lodgeId: string;
  role: string;
}) {
  if (!["TESOUREIRO", "SECRETARIO", "VENERAVEL_MESTRE"].includes(role)) return null;
  const govbrOk = isGovbrConfigured();
  const podeExcluir = canWriteSecretaria(role);
  const pendentes = await prisma.atestadoRegularidade.findMany({
    where: { lodgeId, status: "SOLICITADO" },
    include: { user: { select: { name: true, cim: true, status: true } } },
    orderBy: { solicitadoAt: "asc" },
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Atestados de Regularidade</CardTitle>
        <CardDescription>
          Tripla assinatura gov.br — Tesoureiro, depois Secretário e por último
          o Venerável Mestre. O irmão solicitante acompanha o andamento na
          página do Atestado e recebe o PDF selado ao final.
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
              const ordem = ordemAssinaturaAtestado(role, a);
              const jaAssinei = ordem.jaAssinou;
              const minhaVez =
                !jaAssinei && !ordem.aguardando && a.user.status === "ATIVO";
              const numAssinaturas = [
                a.signedByTesAt,
                a.signedBySecAt,
                a.signedByMasterAt,
              ].filter(Boolean).length;
              const pdf = `/secretaria/atestados/${a.id}/pdf`;
              return (
                <li key={a.id} className="space-y-2 p-3 text-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span>
                      <strong>{a.user.name}</strong> · CIM {a.user.cim}
                      <span className="ml-2 text-xs text-muted-foreground">
                        solicitado em {a.solicitadoAt.toLocaleDateString("pt-BR")}
                      </span>
                    </span>
                    {a.user.status !== "ATIVO" && (
                      <Badge className="border-red-200 bg-red-50 text-red-700">
                        {a.user.status}
                      </Badge>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant={a.signedByTesAt ? "default" : "secondary"}>
                      Tesoureiro {a.signedByTesAt ? "✓" : "pendente"}
                    </Badge>
                    <Badge variant={a.signedBySecAt ? "default" : "secondary"}>
                      Secretário {a.signedBySecAt ? "✓" : "pendente"}
                    </Badge>
                    <Badge variant={a.signedByMasterAt ? "default" : "secondary"}>
                      Venerável {a.signedByMasterAt ? "✓" : "pendente"}
                    </Badge>
                    <Button asChild size="sm" variant="ghost">
                      <a href={pdf} target="_blank" rel="noreferrer">
                        Ver PDF
                      </a>
                    </Button>
                    {minhaVez && govbrOk && (
                      <Button asChild size="sm">
                        <a href={`/api/govbr/authorize?atestado=${a.id}`}>
                          Assinar com gov.br
                        </a>
                      </Button>
                    )}
                    {jaAssinei && (
                      <span className="text-xs text-muted-foreground">
                        Você já assinou.
                      </span>
                    )}
                    {!jaAssinei && ordem.aguardando && (
                      <span className="text-xs text-muted-foreground">
                        Aguardando a assinatura do {ordem.aguardando}.
                      </span>
                    )}
                    {podeExcluir && (
                      <ActionButton
                        action={excluirAtestado.bind(null, a.id)}
                        label="Excluir"
                        variant="destructive"
                        confirm={`Excluir o atestado de ${a.user.name}? Use para pedidos em duplicidade — as assinaturas já colhidas serão descartadas.`}
                      />
                    )}
                  </div>
                  {minhaVez && (
                    <PortalIti
                      href={`${pdf}?download=1`}
                      action={uploadAtestadoAssinadoGovbr.bind(null, a.id)}
                      comAnteriores={numAssinaturas > 0}
                      chave={`atestado:${a.id}:${numAssinaturas}`}
                    />
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

export async function QuittePlacetsParaAssinar({
  lodgeId,
  role,
}: {
  lodgeId: string;
  role: string;
}) {
  if (!["SECRETARIO", "VENERAVEL_MESTRE"].includes(role)) return null;
  const govbrOk = isGovbrConfigured();
  const podeExcluir = canWriteSecretaria(role);
  const placets = await prisma.quittePlacet.findMany({
    where: { lodgeId, status: { in: ["PENDENTE", "EM_ANALISE"] } },
    orderBy: { dataSolicitacao: "asc" },
    select: {
      id: true,
      status: true,
      dataSolicitacao: true,
      quitacaoFinanceira: true,
      signedByMasterAt: true,
      signedBySecAt: true,
      formularioNome: true,
      formularioMime: true,
      cartaNome: true,
      user: { select: { name: true, cim: true } },
    },
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Quitte Placets</CardTitle>
        <CardDescription>
          Form. 122 com as assinaturas gov.br do Secretário e, por último, do
          Venerável Mestre. A triagem (carta, Nada Consta, anexo do Form. 122)
          é feita na página do Quitte Placet; aqui só se assina.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {placets.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nenhum Quitte Placet aguardando assinatura.
          </p>
        ) : (
          <ul className="divide-y rounded-md border">
            {placets.map((p) => {
              const bloqueio = bloqueioAssinaturaQuitte({
                status: p.status,
                quitacaoFinanceira: p.quitacaoFinanceira,
                cartaNome: p.cartaNome,
                formularioNome: p.formularioNome,
                formularioMime: p.formularioMime,
                govbrPdf:
                  p.signedBySecAt || p.signedByMasterAt ? Buffer.alloc(1) : null,
              });
              const ordem = ordemAssinaturaQuitte(role, p);
              const minhaVez = !ordem.jaAssinou && !ordem.aguardando && !bloqueio;
              const form = `/secretaria/quitte-placets/formulario/${p.id}`;
              return (
                <li key={p.id} className="space-y-2 p-3 text-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span>
                      <strong>{p.user.name}</strong> · CIM {p.user.cim}
                      <span className="ml-2 text-xs text-muted-foreground">
                        solicitado em{" "}
                        {p.dataSolicitacao.toLocaleDateString("pt-BR")}
                      </span>
                    </span>
                    <a
                      href={`/secretaria/quitte-placets#form-placet-${p.id}`}
                      className="text-xs font-medium text-primary hover:underline"
                    >
                      Abrir triagem →
                    </a>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant={p.signedBySecAt ? "default" : "secondary"}>
                      Secretário {p.signedBySecAt ? "✓" : "pendente"}
                    </Badge>
                    <Badge variant={p.signedByMasterAt ? "default" : "secondary"}>
                      Venerável {p.signedByMasterAt ? "✓" : "pendente"}
                    </Badge>
                    {p.formularioNome && (
                      <Button asChild size="sm" variant="ghost">
                        <a href={form}>Baixar Form. 122</a>
                      </Button>
                    )}
                    {p.cartaNome && (
                      <Button asChild size="sm" variant="ghost">
                        <a href={`/secretaria/quitte-placets/carta/${p.id}`}>
                          Ver carta
                        </a>
                      </Button>
                    )}
                    {minhaVez && govbrOk && (
                      <Button asChild size="sm">
                        <a href={`/api/govbr/authorize?quitte=${p.id}`}>
                          Assinar com gov.br
                        </a>
                      </Button>
                    )}
                    {ordem.jaAssinou && (
                      <span className="text-xs text-muted-foreground">
                        Você já assinou.
                      </span>
                    )}
                    {!ordem.jaAssinou && ordem.aguardando && (
                      <span className="text-xs text-muted-foreground">
                        Aguardando a assinatura do {ordem.aguardando}.
                      </span>
                    )}
                    {podeExcluir && (
                      <ActionButton
                        action={excluirQuittePlacet.bind(null, p.id)}
                        label="Excluir"
                        variant="destructive"
                        confirm={`Excluir o Quitte Placet de ${p.user.name}? Use para pedidos em duplicidade — carta, formulário e assinaturas já colhidas serão descartados.`}
                      />
                    )}
                  </div>
                  {bloqueio && (
                    <p className="rounded-md border border-amber-200 bg-amber-50 p-2 text-xs text-amber-800">
                      {bloqueio}
                    </p>
                  )}
                  {minhaVez && (
                    <PortalIti
                      href={form}
                      action={uploadQuittePlacetAssinadoGovbr.bind(null, p.id)}
                      comAnteriores={!!(p.signedBySecAt || p.signedByMasterAt)}
                      chave={`quitte:${p.id}:${p.signedBySecAt ? 1 : 0}`}
                    />
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
