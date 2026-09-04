import { prisma } from "@/lib/prisma";
import { isGovbrConfigured } from "@/lib/govbr";
import { ordemAssinaturaAtestado } from "@/lib/atestado";
import {
  ordemAssinaturaQuitte,
  bloqueioAssinaturaQuitte,
  cargoQuitteDosCargos,
  assinaturasQuitte,
} from "@/lib/quitte";
import {
  ARTIGOS_AFASTAMENTO,
  ordemAssinaturaAfastamento,
  bloqueioAssinaturaAfastamento,
  statusAfastamentoLabel,
} from "@/lib/afastamento";
import {
  registrarSessaoAfastamento,
  uploadForm116AssinadoGovbr,
  enviarAfastamentoGSelos,
  indeferirAfastamento,
  excluirAfastamento,
} from "../_actions/afastamentos";
import { GUARDA_SELOS_EMAIL } from "@/lib/gmail";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { uploadAtestadoAssinadoGovbr, excluirAtestado } from "../_actions/atestados";
import {
  uploadQuittePlacetAssinadoGovbr,
  excluirQuittePlacet,
  registrarSessaoQuittePlacet,
} from "../_actions/quitte";
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

export function PortalIti({
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
  cargos,
}: {
  lodgeId: string;
  role: string;
  cargos: string[]; // cargosProcesso(): nível de acesso + cargo do rito
}) {
  // Cadeia Secretário → Orador → VM; Orador entra pelo cargo do rito
  const cargoQuitte = cargoQuitteDosCargos(cargos);
  if (!cargoQuitte) return null;
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
      signedByOradorAt: true,
      formularioNome: true,
      formularioMime: true,
      cartaNome: true,
      dataSessaoComunicacao: true,
      ataNome: true,
      user: { select: { name: true, cim: true } },
    },
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Quitte Placets</CardTitle>
        <CardDescription>
          Form. 122 com as assinaturas gov.br do Secretário, do Orador e, por
          último, do Venerável Mestre. A triagem (carta, Nada Consta, anexo do Form. 122)
          é feita na página do Quitte Placet; aqui a Secretaria registra a
          sessão em que o pedido foi comunicado à Loja (com a ata) e os cargos
          assinam.
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
                dataSessaoComunicacao: p.dataSessaoComunicacao,
                ataNome: p.ataNome,
                formularioNome: p.formularioNome,
                formularioMime: p.formularioMime,
                govbrPdf: assinaturasQuitte(p) > 0 ? Buffer.alloc(1) : null,
              });
              const ordem = ordemAssinaturaQuitte(cargoQuitte, p);
              const sessaoOk = !!p.dataSessaoComunicacao && !!p.ataNome;
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
                    {podeExcluir && (
                      <a
                        href={`/secretaria/quitte-placets#form-placet-${p.id}`}
                        className="text-xs font-medium text-primary hover:underline"
                      >
                        Abrir triagem →
                      </a>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant={p.signedBySecAt ? "default" : "secondary"}>
                      Secretário {p.signedBySecAt ? "✓" : "pendente"}
                    </Badge>
                    <Badge variant={p.signedByOradorAt ? "default" : "secondary"}>
                      Orador {p.signedByOradorAt ? "✓" : "pendente"}
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
                    <Badge variant={sessaoOk ? "default" : "secondary"}>
                      {p.dataSessaoComunicacao
                        ? `Comunicado em sessão de ${p.dataSessaoComunicacao.toLocaleDateString("pt-BR")}`
                        : "Sessão de comunicação pendente"}
                    </Badge>
                    {p.ataNome && (
                      <Button asChild size="sm" variant="ghost">
                        <a href={`/secretaria/quitte-placets/ata/${p.id}`}>
                          Ver ata da sessão
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
                  {podeExcluir && (
                    <details
                      className="rounded-md border bg-muted/20 p-3"
                      open={!sessaoOk}
                    >
                      <summary className="cursor-pointer text-sm font-medium">
                        {sessaoOk
                          ? "Sessão de comunicação (alterar)"
                          : "Registrar a sessão em que o pedido foi comunicado"}
                      </summary>
                      <p className="mt-2 text-xs text-muted-foreground">
                        Informe a data da sessão em que o pedido de Quitte Placet
                        foi comunicado à Loja e anexe a ata dessa sessão (PDF ou
                        imagem). As assinaturas gov.br só liberam depois disso.
                      </p>
                      <div className="mt-2">
                        <ActionForm
                          action={registrarSessaoQuittePlacet.bind(null, p.id)}
                          submitLabel={sessaoOk ? "Atualizar" : "Registrar sessão"}
                        >
                          <div className="grid gap-3 sm:grid-cols-2">
                            <div className="space-y-1">
                              <Label htmlFor={`sessao-${p.id}`}>Data da sessão</Label>
                              <Input
                                id={`sessao-${p.id}`}
                                name="dataSessao"
                                type="date"
                                required
                                defaultValue={
                                  p.dataSessaoComunicacao
                                    ? p.dataSessaoComunicacao.toISOString().slice(0, 10)
                                    : ""
                                }
                              />
                            </div>
                            <div className="space-y-1">
                              <Label htmlFor={`ata-${p.id}`}>
                                Ata da sessão {p.ataNome ? "(substituir)" : ""}
                              </Label>
                              <Input
                                id={`ata-${p.id}`}
                                name="ata"
                                type="file"
                                accept="application/pdf,image/*"
                                required={!p.ataNome}
                              />
                            </div>
                          </div>
                        </ActionForm>
                      </div>
                    </details>
                  )}
                  {minhaVez && (
                    <PortalIti
                      href={form}
                      action={uploadQuittePlacetAssinadoGovbr.bind(null, p.id)}
                      comAnteriores={assinaturasQuitte(p) > 0}
                      chave={`quitte:${p.id}:${assinaturasQuitte(p)}`}
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

// Pedidos de Afastamento (Form. 116): triagem (registro da sessão que
// deliberou + artigo → gera o Form. 116), assinaturas gov.br Secretário → VM
// e envio à Guarda dos Selos (que torna o irmão LICENCIADO).
export async function AfastamentosParaAssinar({
  lodgeId,
  role,
}: {
  lodgeId: string;
  role: string;
}) {
  if (!["SECRETARIO", "VENERAVEL_MESTRE", "CONSELHO_CONTAS", "TESOUREIRO"].includes(role)) return null;
  const govbrOk = isGovbrConfigured();
  const isWriter = canWriteSecretaria(role);
  const assina = ["SECRETARIO", "VENERAVEL_MESTRE"].includes(role);
  const pedidos = await prisma.pedidoAfastamento.findMany({
    where: {
      lodgeId,
      OR: [
        { status: { in: ["AGUARDANDO_OBREIRO", "SOLICITADO", "EM_ASSINATURA"] } },
        { status: "ASSINADO", enviadoAt: null },
      ],
    },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      status: true,
      dias: true,
      motivo: true,
      dataInicio: true,
      createdAt: true,
      requerimentoSignedAt: true,
      dataSessao: true,
      artigo: true,
      signedBySecAt: true,
      signedByMasterAt: true,
      user: { select: { name: true, cim: true } },
    },
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Pedidos de Afastamento (Form. 116)</CardTitle>
        <CardDescription>
          O irmão assina o requerimento com a conta gov.br dele. Após a
          deliberação em sessão, registre aqui a data e o artigo — o sistema
          gera o Form. 116, que recebe as assinaturas gov.br do Secretário e,
          por último, do Venerável Mestre, e segue à Guarda dos Selos.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {pedidos.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nenhum pedido de afastamento em andamento.
          </p>
        ) : (
          <ul className="divide-y rounded-md border">
            {pedidos.map((p) => {
              const bloqueio = bloqueioAssinaturaAfastamento({
                status: p.status,
                formularioPdf: p.status === "EM_ASSINATURA" ? Buffer.alloc(1) : null,
              });
              const ordem = ordemAssinaturaAfastamento(role, p);
              const minhaVez = assina && !bloqueio && !ordem.jaAssinou && !ordem.aguardando;
              const base = `/solicitacoes/afastamento/${p.id}`;
              const podeRegistrar =
                isWriter &&
                (p.status === "SOLICITADO" ||
                  (p.status === "EM_ASSINATURA" && !p.signedBySecAt && !p.signedByMasterAt));
              const dataSessaoInput = p.dataSessao
                ? `${p.dataSessao.getFullYear()}-${String(p.dataSessao.getMonth() + 1).padStart(2, "0")}-${String(p.dataSessao.getDate()).padStart(2, "0")}`
                : "";
              return (
                <li key={p.id} className="space-y-2 p-3 text-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span>
                      <strong>{p.user.name}</strong> · CIM {p.user.cim}
                      <span className="ml-2 text-xs text-muted-foreground">
                        pedido em {p.createdAt.toLocaleDateString("pt-BR")} · {p.dias} dias
                        {p.dataInicio && ` · a partir de ${p.dataInicio.toLocaleDateString("pt-BR")}`}
                      </span>
                    </span>
                    <Badge variant={p.status === "ASSINADO" ? "default" : "secondary"}>
                      {statusAfastamentoLabel(p.status)}
                    </Badge>
                  </div>
                  <p className="whitespace-pre-line rounded-md bg-muted/40 p-2 text-xs text-muted-foreground">
                    <span className="font-medium text-foreground">Motivo: </span>
                    {p.motivo}
                  </p>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant={p.requerimentoSignedAt ? "default" : "secondary"}>
                      Requerimento (irmão) {p.requerimentoSignedAt ? "✓ gov.br" : "pendente"}
                    </Badge>
                    <Badge variant={p.dataSessao ? "default" : "secondary"}>
                      Sessão {p.dataSessao ? `${p.dataSessao.toLocaleDateString("pt-BR")} · Art. ${p.artigo}` : "pendente"}
                    </Badge>
                    <Badge variant={p.signedBySecAt ? "default" : "secondary"}>
                      Secretário {p.signedBySecAt ? "✓" : "pendente"}
                    </Badge>
                    <Badge variant={p.signedByMasterAt ? "default" : "secondary"}>
                      Venerável {p.signedByMasterAt ? "✓" : "pendente"}
                    </Badge>
                    {p.requerimentoSignedAt && (
                      <Button asChild size="sm" variant="ghost">
                        <a href={`${base}/requerimento`} target="_blank" rel="noreferrer">
                          Ver requerimento
                        </a>
                      </Button>
                    )}
                    {p.dataSessao && p.status !== "SOLICITADO" && (
                      <Button asChild size="sm" variant="ghost">
                        <a href={`${base}/formulario`} target="_blank" rel="noreferrer">
                          Ver Form. 116
                        </a>
                      </Button>
                    )}
                    {minhaVez && govbrOk && (
                      <Button asChild size="sm">
                        <a href={`/api/govbr/authorize?afastamento=${p.id}`}>
                          Assinar com gov.br
                        </a>
                      </Button>
                    )}
                    {assina && ordem.jaAssinou && p.status === "EM_ASSINATURA" && (
                      <span className="text-xs text-muted-foreground">Você já assinou.</span>
                    )}
                    {assina && p.status === "EM_ASSINATURA" && !ordem.jaAssinou && ordem.aguardando && (
                      <span className="text-xs text-muted-foreground">
                        Aguardando a assinatura do {ordem.aguardando}.
                      </span>
                    )}
                    {isWriter && p.status === "ASSINADO" && (
                      <ActionButton
                        action={enviarAfastamentoGSelos.bind(null, p.id)}
                        label="Enviar à Guarda dos Selos"
                        confirm={`Enviar o Form. 116 e o requerimento de ${p.user.name} para ${GUARDA_SELOS_EMAIL}? A situação do irmão passará a LICENCIADO.`}
                      />
                    )}
                    {isWriter && p.status !== "ASSINADO" && (
                      <ActionButton
                        action={excluirAfastamento.bind(null, p.id)}
                        label="Excluir"
                        variant="destructive"
                        confirm={`Excluir o pedido de afastamento de ${p.user.name}? Use para pedidos em duplicidade.`}
                      />
                    )}
                  </div>
                  {p.status === "AGUARDANDO_OBREIRO" && (
                    <p className="rounded-md border border-amber-200 bg-amber-50 p-2 text-xs text-amber-800">
                      O irmão ainda não assinou o requerimento com a conta gov.br dele — nada a fazer por enquanto.
                    </p>
                  )}
                  {podeRegistrar && (
                    <details
                      className="rounded-md border bg-muted/20 p-3"
                      open={p.status === "SOLICITADO"}
                    >
                      <summary className="cursor-pointer text-sm font-medium">
                        {p.status === "SOLICITADO"
                          ? "Registrar a sessão que deliberou a licença (gera o Form. 116)"
                          : "Corrigir sessão/artigo (regenera o Form. 116)"}
                      </summary>
                      <ActionForm
                        action={registrarSessaoAfastamento.bind(null, p.id)}
                        submitLabel={p.status === "SOLICITADO" ? "Gerar Form. 116" : "Regenerar Form. 116"}
                        className="mt-2 space-y-3"
                      >
                        <div className="grid gap-3 sm:grid-cols-2">
                          <div className="space-y-1">
                            <Label htmlFor={`sessao-${p.id}`}>Data da sessão</Label>
                            <Input
                              id={`sessao-${p.id}`}
                              name="dataSessao"
                              type="date"
                              required
                              defaultValue={dataSessaoInput}
                            />
                          </div>
                          <div className="space-y-1">
                            <Label htmlFor={`artigo-${p.id}`}>Art. do Regulamento Geral</Label>
                            <select
                              id={`artigo-${p.id}`}
                              name="artigo"
                              required
                              defaultValue={p.artigo ?? ""}
                              className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm"
                            >
                              <option value="">Selecione</option>
                              {ARTIGOS_AFASTAMENTO.map((a) => (
                                <option key={a} value={a}>
                                  Art. {a}
                                </option>
                              ))}
                            </select>
                          </div>
                        </div>
                      </ActionForm>
                    </details>
                  )}
                  {isWriter && ["SOLICITADO", "EM_ASSINATURA"].includes(p.status) && (
                    <details className="rounded-md border border-red-100 bg-red-50/40 p-3">
                      <summary className="cursor-pointer text-sm font-medium text-red-800">
                        Indeferir o pedido
                      </summary>
                      <ActionForm
                        action={indeferirAfastamento.bind(null, p.id)}
                        submitLabel="Indeferir"
                        className="mt-2 space-y-3"
                      >
                        <div className="space-y-1">
                          <Label htmlFor={`parecer-${p.id}`}>Motivo (o irmão verá este texto)</Label>
                          <Input id={`parecer-${p.id}`} name="parecer" required />
                        </div>
                      </ActionForm>
                    </details>
                  )}
                  {bloqueio && p.status === "EM_ASSINATURA" && (
                    <p className="rounded-md border border-amber-200 bg-amber-50 p-2 text-xs text-amber-800">
                      {bloqueio}
                    </p>
                  )}
                  {minhaVez && (
                    <PortalIti
                      href={`${base}/formulario?download=1`}
                      action={uploadForm116AssinadoGovbr.bind(null, p.id)}
                      comAnteriores={!!p.signedBySecAt}
                      chave={`afastamento:${p.id}:${p.signedBySecAt ? 1 : 0}`}
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
