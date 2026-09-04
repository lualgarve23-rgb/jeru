import { InfoDica } from "@/components/info-dica";
import { AJUDA } from "@/lib/ajuda";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/session";
import { canWriteSecretaria } from "@/lib/permissions";
import { isGovbrConfigured } from "@/lib/govbr";
import { cargoLabel, estadoProcesso, cargosProcessoDoUsuario } from "@/lib/processos";
import { SelecaoCadeia } from "./cadeia-fields";
import {
  AtestadosParaAssinar,
  QuittePlacetsParaAssinar,
  AfastamentosParaAssinar,
} from "./assinaturas-pendentes";
import {
  criarProcessoDocumento,
  uploadProcessoAssinadoGovbr,
  excluirProcessoDocumento,
  enviarProcessoDocumento,
} from "../actions";
import { GUARDA_SELOS_EMAIL } from "@/lib/gmail";
import { ActionForm, ActionButton } from "@/components/action-form";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

const govbrMsgs: Record<string, string> = {
  ok: "Assinatura gov.br registrada no documento.",
  "nao-configurado": "A assinatura gov.br não está configurada no servidor.",
  negado: "Autorização cancelada no gov.br.",
  "cpf-divergente":
    "A conta gov.br usada não é do próprio assinante (CPF divergente).",
  "ja-assinou": "Você já assinou este documento.",
  "sessao-expirada": "Sessão do gov.br expirou — tente novamente.",
  ordem: "Ainda não é a sua vez — siga a ordem da cadeia de assinantes.",
  "nao-assinante": "O seu cargo não está na cadeia de assinantes deste documento.",
  bloqueado:
    "O documento ainda não está pronto para assinatura — no Quitte Placet, confira a carta, o Nada Consta, a sessão de comunicação com a ata e o Form. 122 em PDF; no Afastamento, registre a sessão para gerar o Form. 116.",
  falhou: "A assinatura gov.br falhou — tente novamente.",
};

export default async function ProcessosPage({
  searchParams,
}: {
  searchParams: Promise<{ govbr?: string }>;
}) {
  const user = await requireUser();
  // Cargos de gestão veem tudo; Orador e Vigilantes (cargo do rito, nível
  // Obreiro) entram só para assinar os processos em que figuram na cadeia
  const meusCargos = await cargosProcessoDoUsuario(user);
  const isGestor = ["SECRETARIO", "TESOUREIRO", "VENERAVEL_MESTRE", "CONSELHO_CONTAS"].includes(user.role);
  if (!isGestor && meusCargos.length < 2) redirect("/dashboard");
  const sp = await searchParams;
  const isWriter = canWriteSecretaria(user.role);
  const canSign = user.role !== "CONSELHO_CONTAS";
  const govbrOk = isGovbrConfigured();
  const govbrMsg = sp.govbr ? (govbrMsgs[sp.govbr] ?? govbrMsgs.falhou) : null;

  const [processos, membros] = await Promise.all([
    prisma.processoDocumento.findMany({
      where: {
        lodgeId: user.lodgeId,
        ...(isGestor ? {} : { assinantes: { some: { cargo: { in: meusCargos } } } }),
      },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        titulo: true,
        arquivoNome: true,
        status: true,
        createdAt: true,
        pranchaId: true,
        enviadoAt: true,
        enviadoPara: true,
        criadoPor: { select: { name: true } },
        assinantes: {
          orderBy: { ordem: "asc" },
          select: {
            id: true,
            ordem: true,
            cargo: true,
            signedAt: true,
            signedBy: { select: { name: true } },
          },
        },
      },
    }),
    isWriter
      ? prisma.user.findMany({
          where: { lodgeId: user.lodgeId, currentRole: { not: "SUPER_ADMIN" } },
          orderBy: { name: "asc" },
          select: { id: true, name: true, cim: true },
        })
      : [],
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-1 text-2xl font-bold">
          Processos
          <InfoDica titulo="Processos" texto={AJUDA.processos} />
        </h1>
        <p className="text-sm text-muted-foreground">
          Caixa de entrada de assinaturas gov.br de todos os cargos: atestados
          de regularidade, Quitte Placets, pedidos de afastamento (Form. 116) e documentos oficiais da Secretaria
          (anexos de pranchas, formulários GOB etc.) com cadeia ordenada — o
          Venerável Mestre assina sempre por último.
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

      {isWriter && (
        <Card className="max-w-xl">
          <CardHeader>
            <CardTitle>Novo processo de assinaturas</CardTitle>
            <CardDescription>
              Envie o documento em PDF (formulário GOB preenchido, ofício etc.)
              e defina a ordem dos cargos assinantes. Anexos de pranchas são
              encaminhados direto da página de Pranchas.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ActionForm action={criarProcessoDocumento} submitLabel="Abrir processo">
              <div className="space-y-1">
                <Label htmlFor="titulo">Título do documento</Label>
                <Input id="titulo" name="titulo" required />
              </div>
              <div className="space-y-1">
                <Label htmlFor="arquivo">Documento (PDF ou Word .docx — o Word é convertido para PDF)</Label>
                <Input
                  id="arquivo"
                  name="arquivo"
                  type="file"
                  accept=".pdf,.docx"
                  required
                />
              </div>
              <SelecaoCadeia />
            </ActionForm>
          </CardContent>
        </Card>
      )}

      {isGestor && <AtestadosParaAssinar lodgeId={user.lodgeId} role={user.role} />}
      {/* Quitte Placet: além da gestão, o Orador (cargo do rito) assina */}
      <QuittePlacetsParaAssinar lodgeId={user.lodgeId} role={user.role} cargos={meusCargos} />
      {isGestor && <AfastamentosParaAssinar lodgeId={user.lodgeId} role={user.role} />}

      <h2 className="text-lg font-semibold">Documentos da Secretaria</h2>
      <div className="space-y-4">
        {processos.length === 0 && (
          <p className="text-sm text-muted-foreground">
            Nenhum processo de assinaturas aberto.
          </p>
        )}
        {processos.map((doc) => {
          const estado = canSign ? estadoProcesso(meusCargos, doc.assinantes) : null;
          const minhaVez = !!estado?.minhaVez && doc.status !== "ASSINADO";
          const temAssinatura = doc.assinantes.some((a) => a.signedAt);
          return (
            <div key={doc.id} className="space-y-3 rounded-lg border p-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{doc.titulo}</span>
                <Badge
                  variant={doc.status === "ASSINADO" ? "success" : "secondary"}
                >
                  {doc.status === "ASSINADO"
                    ? "Assinado por toda a cadeia"
                    : `Em assinatura — vez do ${estadoProcesso("", doc.assinantes).proximoCargo}`}
                </Badge>
                {doc.pranchaId && <Badge variant="outline">Prancha</Badge>}
                {doc.enviadoAt && (
                  <Badge variant="success">
                    Enviado a {doc.enviadoPara} em{" "}
                    {doc.enviadoAt.toLocaleDateString("pt-BR")}
                  </Badge>
                )}
                <span className="text-xs text-muted-foreground">
                  aberto por {doc.criadoPor.name} em{" "}
                  {doc.createdAt.toLocaleDateString("pt-BR")}
                </span>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {doc.assinantes.map((a) => (
                  <Badge
                    key={a.id}
                    variant={a.signedAt ? "default" : "secondary"}
                    title={
                      a.signedAt
                        ? `Assinado por ${a.signedBy?.name} em ${a.signedAt.toLocaleDateString("pt-BR")}`
                        : "Aguardando assinatura"
                    }
                  >
                    {a.ordem}º {cargoLabel(a.cargo)} {a.signedAt ? "✓" : "…"}
                  </Badge>
                ))}
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <Button asChild size="sm" variant="outline">
                  <a href={`/secretaria/processos/arquivo/${doc.id}`}>
                    Baixar documento{temAssinatura ? " (com assinaturas)" : ""}
                  </a>
                </Button>
                {minhaVez && govbrOk && (
                  <Button asChild size="sm">
                    <a href={`/api/govbr/authorize?processo=${doc.id}`}>
                      Assinar com gov.br
                    </a>
                  </Button>
                )}
                {isWriter && !doc.enviadoAt && (
                  <ActionButton
                    action={excluirProcessoDocumento.bind(null, doc.id)}
                    label="Excluir"
                    variant="destructive"
                    confirm={
                      temAssinatura
                        ? `Excluir "${doc.titulo}"? Use para documentos em duplicidade — as assinaturas já colhidas serão descartadas.`
                        : `Excluir "${doc.titulo}"?`
                    }
                  />
                )}
              </div>

              {/* Envio após TODAS as assinaturas: a Guarda dos Selos fica em
                  destaque como destino padrão; o Secretário pode escolher
                  outro e-mail e copiar irmãos do quadro */}
              {isWriter && doc.status === "ASSINADO" && (
                <details
                  className="rounded-md border bg-muted/20 p-3"
                  open={!doc.enviadoAt}
                >
                  <summary className="cursor-pointer text-sm font-medium">
                    {doc.enviadoAt
                      ? "Reenviar documento assinado"
                      : "Enviar documento assinado"}
                  </summary>
                  <ActionForm
                    action={enviarProcessoDocumento.bind(null, doc.id)}
                    submitLabel={doc.enviadoAt ? "Reenviar" : "Enviar documento"}
                    className="mt-2 space-y-3"
                  >
                    <div className="space-y-2 text-sm">
                      <label className="flex items-center gap-2 rounded-md border border-primary bg-primary/5 p-2 font-medium">
                        <input
                          type="radio"
                          name="destino"
                          value="gselos"
                          defaultChecked
                        />
                        Guarda dos Selos ({GUARDA_SELOS_EMAIL})
                      </label>
                      <label className="flex flex-wrap items-center gap-2 rounded-md border p-2">
                        <input type="radio" name="destino" value="outro" />
                        Outro destinatário:
                        <Input
                          name="destinoEmail"
                          type="email"
                          placeholder="email@exemplo.com"
                          className="h-8 w-64"
                        />
                      </label>
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor={`cc-${doc.id}`}>
                        Copiar irmãos do quadro (opcional — segure Ctrl/Cmd para
                        escolher vários)
                      </Label>
                      <select
                        id={`cc-${doc.id}`}
                        name="cc"
                        multiple
                        size={4}
                        className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                      >
                        {membros.map((m) => (
                          <option key={m.id} value={m.id}>
                            {m.name} (CIM {m.cim})
                          </option>
                        ))}
                      </select>
                    </div>
                  </ActionForm>
                </details>
              )}

              {canSign && estado && doc.status !== "ASSINADO" && !minhaVez && (
                <p className="text-xs text-muted-foreground">
                  {estado.jaAssinou
                    ? "Você já assinou este documento."
                    : estado.souAssinante
                      ? `Aguardando a assinatura do ${estado.aguardando}.`
                      : "O seu cargo não está na cadeia deste documento."}
                </p>
              )}

              {/* Fluxo gov.br pelo portal, igual ao dos demais documentos:
                  baixar o PDF (já com as assinaturas anteriores), assinar no
                  assinador.iti.br e subir o arquivo. */}
              {minhaVez && (
                <details className="rounded-md border bg-muted/20 p-3">
                  <summary className="cursor-pointer text-sm font-medium">
                    Assinar pelo gov.br (portal assinador.iti.br)
                  </summary>
                  <div className="mt-2 space-y-3">
                    <ol className="list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
                      <li>
                        Baixe o documento{" "}
                        {temAssinatura ? "já com as assinaturas anteriores" : ""}
                        :{" "}
                        <a
                          href={`/secretaria/processos/arquivo/${doc.id}`}
                          className="font-medium text-primary hover:underline"
                        >
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
                    <ActionForm
                      action={uploadProcessoAssinadoGovbr.bind(null, doc.id)}
                      submitLabel="Enviar PDF assinado"
                    >
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
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
