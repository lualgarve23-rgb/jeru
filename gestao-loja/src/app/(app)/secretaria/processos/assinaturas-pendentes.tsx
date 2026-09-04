import { prisma } from "@/lib/prisma";
import { isGovbrConfigured } from "@/lib/govbr";
import {
  ordemAssinaturaAtestado,
  bloqueioCargoAusenteAtestado,
  bloqueioFinanceiroAtestado,
} from "@/lib/atestado";
import {
  ordemAssinaturaQuitte,
  bloqueioAssinaturaQuitte,
  bloqueioCargoAusenteQuitte,
  cargoQuitteDosCargos,
  assinaturasQuitte,
} from "@/lib/quitte";
import {
  brlCents,
  contextoFinanceiroDoIrmao,
  type ContextoFinanceiro,
} from "@/lib/contexto-financeiro";
import { memberStatusLabels } from "@/lib/labels";
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
import {
  uploadAtestadoAssinadoGovbr,
  excluirAtestado,
  overrideFinanceiroAtestadoForm,
} from "../_actions/atestados";
import {
  uploadQuittePlacetAssinadoGovbr,
  excluirQuittePlacet,
  registrarSessaoQuittePlacet,
  confirmarNadaConstaQuitte,
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

// Cargos que veem o painel Tesouraria nos cards (VM, Secretário, Tesoureiro
// e Conselho de Contas); o link para a cobrança só para quem opera a
// Tesouraria (Conselho é somente leitura)
export const VE_PAINEL_TESOURARIA = ["VENERAVEL_MESTRE", "SECRETARIO", "TESOUREIRO", "CONSELHO_CONTAS"];
const ABRE_COBRANCA = ["VENERAVEL_MESTRE", "SECRETARIO", "TESOUREIRO"];

// Painel "Tesouraria" do card: situação sincronizada do cadastro, capitações
// em aberto (com o que já venceu) e as últimas pagas — para quem assina
// "regular com o recolhimento de metais" ou confirma o Nada Consta decidir
// vendo os números, e não um status possivelmente defasado.
export function PainelTesouraria({
  ctx,
  role,
  consultadaAt,
}: {
  ctx: ContextoFinanceiro;
  role: string;
  consultadaAt?: Date | null;
}) {
  if (!VE_PAINEL_TESOURARIA.includes(role)) return null;
  const linka = ABRE_COBRANCA.includes(role);
  const vencidas = ctx.emAberto.filter((i) => i.vencida);
  const statusTone =
    ctx.status === "ATIVO" ? "success" : ctx.status === "IRREGULAR" ? "danger" : "warning";
  return (
    <div className="space-y-2 rounded-md border bg-muted/20 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Tesouraria
        </span>
        <Badge variant={statusTone}>
          Situação: {memberStatusLabels[ctx.status] ?? ctx.status}
          {ctx.statusMotivo === "inadimplencia" ? " (inadimplência automática)" : ""}
        </Badge>
        {ctx.emAberto.length === 0 ? (
          <Badge variant="success">Nenhuma capitação em aberto</Badge>
        ) : (
          <Badge variant={vencidas.length > 0 ? "danger" : "warning"}>
            {ctx.emAberto.length} em aberto ({brlCents(ctx.totalEmAbertoCents)})
            {vencidas.length > 0
              ? ` · ${vencidas.length} vencida${vencidas.length > 1 ? "s" : ""} (${brlCents(ctx.totalVencidoCents)})`
              : ""}
          </Badge>
        )}
        {ctx.asaasAtivo && (
          <span className="text-xs text-muted-foreground" title="Baixas automáticas pelo gateway Asaas">
            Asaas ativo
          </span>
        )}
        {consultadaAt && (
          <span className="text-xs text-muted-foreground">
            consultado em {consultadaAt.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}
          </span>
        )}
      </div>
      {ctx.emAberto.length > 0 && (
        <ul className="space-y-1 text-xs">
          {ctx.emAberto.map((i) => (
            <li key={i.id} className="flex flex-wrap items-center gap-2">
              <span className="font-medium">Capitação {i.referencia}</span>
              <span>{brlCents(i.valorCents)}</span>
              <span className="text-muted-foreground">
                vence em {i.dueDate.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })}
              </span>
              {i.vencida ? (
                <Badge variant="danger">Vencida</Badge>
              ) : (
                <Badge variant="outline">No prazo</Badge>
              )}
              {linka && (
                <a
                  href={`/tesouraria/mensalidades/${i.id}`}
                  className="font-medium text-primary hover:underline"
                >
                  abrir cobrança
                </a>
              )}
            </li>
          ))}
        </ul>
      )}
      <p className="text-xs text-muted-foreground">
        Últimas pagas:{" "}
        {ctx.ultimasPagas.length === 0
          ? "nenhuma capitação paga registrada."
          : ctx.ultimasPagas
              .map(
                (p) =>
                  `${p.referencia} (${brlCents(p.valorCents)}${
                    p.paidAt ? `, em ${p.paidAt.toLocaleDateString("pt-BR")}` : ""
                  })`
              )
              .join(" · ")}
      </p>
    </div>
  );
}

export async function AtestadosParaAssinar({
  lodgeId,
  role,
}: {
  lodgeId: string;
  role: string;
}) {
  // Conselho de Contas entra só para conferir o painel Tesouraria (não assina)
  if (!["TESOUREIRO", "SECRETARIO", "VENERAVEL_MESTRE", "CONSELHO_CONTAS"].includes(role)) return null;
  const govbrOk = isGovbrConfigured();
  const podeAssinar = role !== "CONSELHO_CONTAS";
  const podeExcluir = canWriteSecretaria(role);
  const pendentes = await prisma.atestadoRegularidade.findMany({
    where: { lodgeId, status: "SOLICITADO" },
    include: { user: { select: { name: true, cim: true, status: true } } },
    orderBy: { solicitadoAt: "asc" },
  });
  // Item 7: próximo cargo da cadeia sem ocupante ATIVO → aviso no card
  const cargoAusente = new Map<string, string>();
  // Painel Tesouraria + trava financeira (qualquer capitação vencida bloqueia,
  // salvo override justificado do Tesoureiro)
  const contextos = new Map<string, ContextoFinanceiro>();
  for (const a of pendentes) {
    const msg = await bloqueioCargoAusenteAtestado(lodgeId, a);
    if (msg) cargoAusente.set(a.id, msg);
    contextos.set(a.id, await contextoFinanceiroDoIrmao(lodgeId, a.userId));
  }
  const tesoureirosOverride = await prisma.user.findMany({
    where: {
      lodgeId,
      id: { in: pendentes.map((a) => a.overrideTesoureiroId).filter((x): x is string => !!x) },
    },
    select: { id: true, name: true },
  });
  const nomeTesoureiro = new Map(tesoureirosOverride.map((u) => [u.id, u.name]));

  return (
    <Card>
      <CardHeader>
        <CardTitle>Atestados de Regularidade</CardTitle>
        <CardDescription>
          Tripla assinatura gov.br — Tesoureiro, depois Secretário e por último
          o Venerável Mestre. O irmão solicitante acompanha o andamento na
          página do Atestado e será avisado quando concluir.
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
              const ctx = contextos.get(a.id)!;
              const bloqueioFin = bloqueioFinanceiroAtestado(ctx, a);
              const minhaVez =
                podeAssinar &&
                !jaAssinei &&
                !ordem.aguardando &&
                a.user.status === "ATIVO" &&
                !bloqueioFin;
              const numAssinaturas = [
                a.signedByTesAt,
                a.signedBySecAt,
                a.signedByMasterAt,
              ].filter(Boolean).length;
              const pdf = `/secretaria/atestados/${a.id}/pdf`;
              return (
                <li key={a.id} id={`atestado-${a.id}`} className="space-y-2 p-3 text-sm">
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
                    {podeAssinar && jaAssinei && (
                      <span className="text-xs text-muted-foreground">
                        Você já assinou.
                      </span>
                    )}
                    {podeAssinar && !jaAssinei && ordem.aguardando && (
                      <span className="text-xs text-muted-foreground">
                        Aguardando a assinatura do {ordem.aguardando}.
                      </span>
                    )}
                    {a.overrideAt && (
                      <Badge variant="gold" title={a.overrideJustificativa ?? ""}>
                        Override do Tesoureiro em {a.overrideAt.toLocaleDateString("pt-BR")}
                      </Badge>
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
                  {cargoAusente.has(a.id) && (
                    <p className="rounded-md border border-amber-200 bg-amber-50 p-2 text-xs text-amber-800">
                      {cargoAusente.get(a.id)}
                    </p>
                  )}
                  <PainelTesouraria ctx={ctx} role={role} />
                  {bloqueioFin && (
                    <p className="rounded-md border border-red-200 bg-red-50 p-2 text-xs text-red-800">
                      Trava financeira: {bloqueioFin}
                      {role !== "TESOUREIRO" && " Só o Tesoureiro registra o override."}
                    </p>
                  )}
                  {a.overrideAt && a.overrideJustificativa && (
                    <p className="rounded-md border border-amber-200 bg-amber-50 p-2 text-xs text-amber-800">
                      Override financeiro registrado por{" "}
                      {nomeTesoureiro.get(a.overrideTesoureiroId ?? "") ?? "Tesoureiro"} em{" "}
                      {a.overrideAt.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}:{" "}
                      <em>{a.overrideJustificativa}</em>
                    </p>
                  )}
                  {role === "TESOUREIRO" && bloqueioFin && (
                    <details className="rounded-md border bg-muted/20 p-3">
                      <summary className="cursor-pointer text-sm font-medium">
                        Registrar override financeiro (liberar assinaturas)
                      </summary>
                      <p className="mt-2 text-xs text-muted-foreground">
                        Use quando houver acordo ou pagamento ainda não baixado. A
                        justificativa fica na auditoria e visível neste card.
                      </p>
                      <ActionForm
                        action={overrideFinanceiroAtestadoForm.bind(null, a.id)}
                        submitLabel="Registrar override"
                        className="mt-2"
                      >
                        <Label htmlFor={`override-${a.id}`}>Justificativa</Label>
                        <textarea
                          id={`override-${a.id}`}
                          name="justificativa"
                          required
                          minLength={10}
                          maxLength={1000}
                          rows={3}
                          className="w-full rounded-md border bg-background p-2 text-sm"
                        />
                      </ActionForm>
                    </details>
                  )}
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
  // Cadeia Secretário → Orador → VM; Orador entra pelo cargo do rito.
  // Tesoureiro (confirma o Nada Consta) e Conselho (confere) entram só para
  // ver o painel Tesouraria — não assinam.
  const naCadeia = !!cargoQuitteDosCargos(cargos);
  const soConfere = ["TESOUREIRO", "CONSELHO_CONTAS"].includes(role);
  if (!naCadeia && !soConfere) return null;
  const govbrOk = isGovbrConfigured();
  const podeExcluir = canWriteSecretaria(role);
  const podeConfirmarNadaConsta = ["TESOUREIRO", "VENERAVEL_MESTRE"].includes(role);
  const placets = await prisma.quittePlacet.findMany({
    where: { lodgeId, status: { in: ["PENDENTE", "EM_ANALISE"] } },
    orderBy: { dataSolicitacao: "asc" },
    select: {
      id: true,
      userId: true,
      status: true,
      dataSolicitacao: true,
      quitacaoFinanceira: true,
      quitacaoConsultadaAt: true,
      quitacaoConfirmadaAt: true,
      quitacaoConfirmadaPorId: true,
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
  // Item 7: próximo cargo da cadeia sem ocupante ATIVO → bloqueio no card
  const cargoAusente = new Map<string, string>();
  const contextos = new Map<string, ContextoFinanceiro>();
  for (const p of placets) {
    const msg = await bloqueioCargoAusenteQuitte(lodgeId, p);
    if (msg) cargoAusente.set(p.id, msg);
    if (VE_PAINEL_TESOURARIA.includes(role)) {
      contextos.set(p.id, await contextoFinanceiroDoIrmao(lodgeId, p.userId));
    }
  }
  const confirmadores = await prisma.user.findMany({
    where: {
      lodgeId,
      id: { in: placets.map((p) => p.quitacaoConfirmadaPorId).filter((x): x is string => !!x) },
    },
    select: { id: true, name: true },
  });
  const nomeConfirmador = new Map(confirmadores.map((u) => [u.id, u.name]));

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
              // Cargo da vez entre os do usuário (quem acumula dois cargos
              // assina por ambos, um de cada vez)
              const cargoQuitte = cargoQuitteDosCargos(cargos, p);
              const bloqueio =
                bloqueioAssinaturaQuitte({
                  status: p.status,
                  quitacaoFinanceira: p.quitacaoFinanceira,
                  quitacaoConfirmadaAt: p.quitacaoConfirmadaAt,
                  cartaNome: p.cartaNome,
                  dataSessaoComunicacao: p.dataSessaoComunicacao,
                  ataNome: p.ataNome,
                  formularioNome: p.formularioNome,
                  formularioMime: p.formularioMime,
                  govbrPdf: assinaturasQuitte(p) > 0 ? Buffer.alloc(1) : null,
                }) ?? cargoAusente.get(p.id) ?? null;
              const ordem = cargoQuitte
                ? ordemAssinaturaQuitte(cargoQuitte, p)
                : { jaAssinou: false, aguardando: null as string | null, ultimaAssinatura: false };
              const sessaoOk = !!p.dataSessaoComunicacao && !!p.ataNome;
              const minhaVez = !!cargoQuitte && !ordem.jaAssinou && !ordem.aguardando && !bloqueio;
              const ctx = contextos.get(p.id);
              const travaFinanceira = !p.quitacaoFinanceira && !p.quitacaoConfirmadaAt;
              const form = `/secretaria/quitte-placets/formulario/${p.id}`;
              return (
                <li key={p.id} id={`quitte-${p.id}`} className="space-y-2 p-3 text-sm">
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
                    {cargoQuitte && !ordem.jaAssinou && ordem.aguardando && (
                      <span className="text-xs text-muted-foreground">
                        Aguardando a assinatura do {ordem.aguardando}.
                      </span>
                    )}
                    {p.quitacaoConfirmadaAt ? (
                      <Badge variant="gold">
                        Nada Consta confirmado por{" "}
                        {nomeConfirmador.get(p.quitacaoConfirmadaPorId ?? "") ?? "Tesouraria"} em{" "}
                        {p.quitacaoConfirmadaAt.toLocaleDateString("pt-BR")}
                      </Badge>
                    ) : (
                      <Badge variant={p.quitacaoFinanceira ? "success" : "danger"}>
                        {p.quitacaoFinanceira ? "Nada Consta" : "Capitações vencidas"}
                      </Badge>
                    )}
                    {podeConfirmarNadaConsta && travaFinanceira && (
                      <ActionButton
                        action={confirmarNadaConstaQuitte.bind(null, p.id)}
                        label="Confirmar Nada Consta"
                        confirm={`Confirmar o Nada Consta de ${p.user.name} mesmo com capitações vencidas? A confirmação libera a trava financeira, fica na auditoria e o Secretário é avisado.`}
                      />
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
                  {ctx && (
                    <PainelTesouraria ctx={ctx} role={role} consultadaAt={p.quitacaoConsultadaAt} />
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
                <li key={p.id} id={`afastamento-${p.id}`} className="space-y-2 p-3 text-sm">
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
