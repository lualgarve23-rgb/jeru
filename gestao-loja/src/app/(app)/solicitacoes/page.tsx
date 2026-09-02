import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { InfoDica } from "@/components/info-dica";
import { AJUDA } from "@/lib/ajuda";
import { Badge } from "@/components/ui/badge";
import { pendenteComAfastamento } from "@/lib/afastamento";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

/*
 * Solicitações à Secretaria — porta de entrada única, para todos os irmãos do
 * quadro, dos pedidos que o obreiro faz à Loja: Atestado de Regularidade,
 * Quitte Placet e Pedido de Afastamento (Form. 116). Cada card mostra o
 * andamento do pedido em curso e leva à página do pedido.
 */

export default async function SolicitacoesPage() {
  const user = await requireUser();
  const [atestado, quitte, afastamento, dbUser] = await Promise.all([
    prisma.atestadoRegularidade.findFirst({
      where: { lodgeId: user.lodgeId, userId: user.id },
      orderBy: { solicitadoAt: "desc" },
      select: {
        status: true,
        solicitadoAt: true,
        signedByTesAt: true,
        signedBySecAt: true,
        signedByMasterAt: true,
      },
    }),
    prisma.quittePlacet.findFirst({
      where: { lodgeId: user.lodgeId, userId: user.id },
      orderBy: { dataSolicitacao: "desc" },
      select: {
        status: true,
        dataSolicitacao: true,
        quitacaoFinanceira: true,
        signedBySecAt: true,
        signedByMasterAt: true,
        formularioEnviadoAt: true,
      },
    }),
    prisma.pedidoAfastamento.findFirst({
      where: { lodgeId: user.lodgeId, userId: user.id },
      orderBy: { createdAt: "desc" },
      select: {
        status: true,
        createdAt: true,
        dias: true,
        signedBySecAt: true,
        enviadoAt: true,
      },
    }),
    prisma.user.findUniqueOrThrow({
      where: { id: user.id },
      select: { status: true },
    }),
  ]);

  const atestadoEstado = !atestado
    ? null
    : atestado.status === "ASSINADO"
      ? { texto: "Documento pronto", ativo: false }
      : {
          texto: `Pendente com: ${
            !atestado.signedByTesAt
              ? "Tesoureiro"
              : !atestado.signedBySecAt
                ? "Secretário"
                : "Venerável Mestre"
          }`,
          ativo: true,
        };

  const quitteEstado = !quitte
    ? null
    : quitte.status === "APROVADO"
      ? {
          texto: quitte.formularioEnviadoAt
            ? "Emitido e enviado à Guarda dos Selos"
            : "Assinado — aguardando envio",
          ativo: !quitte.formularioEnviadoAt,
        }
      : quitte.status === "NEGADO"
        ? { texto: "Negado", ativo: false }
        : {
            texto: !quitte.quitacaoFinanceira
              ? "Pendente com: Tesouraria (Nada Consta)"
              : `Pendente com: ${quitte.signedBySecAt ? "Venerável Mestre" : "Secretário"}`,
            ativo: true,
          };

  const afastamentoEstado = !afastamento
    ? null
    : {
        texto: pendenteComAfastamento(afastamento),
        ativo: !["INDEFERIDO"].includes(afastamento.status) && !afastamento.enviadoAt,
      };

  const cards = [
    {
      href: "/secretaria/atestados",
      titulo: "Atestado de Regularidade",
      descricao:
        "Declaração de que você é membro efetivo e está regular com os metais e deveres maçônicos. Assinaturas gov.br do Tesoureiro, Secretário e Venerável Mestre.",
      estado: atestadoEstado,
      data: atestado?.solicitadoAt ?? null,
    },
    {
      href: "/secretaria/quitte-placets",
      titulo: "Quitte Placet",
      descricao:
        "Desligamento ou transferência do quadro. Exige a carta escrita a próprio punho, o Nada Consta da Tesouraria e as assinaturas gov.br do Secretário e do Venerável Mestre (Form. 122).",
      estado: quitteEstado,
      data: quitte?.dataSolicitacao ?? null,
    },
    {
      href: "/solicitacoes/afastamento",
      titulo: "Pedido de Afastamento (Form. 116)",
      descricao:
        "Licença do quadro de obreiros por prazo determinado. Você assina o requerimento com a sua conta gov.br; após a deliberação em sessão, a Loja emite o Form. 116 e comunica a Guarda dos Selos.",
      estado: afastamentoEstado,
      data: afastamento?.createdAt ?? null,
    },
  ];

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="flex items-center gap-1 text-2xl font-bold">
          Solicitações à Secretaria
          <InfoDica titulo="Solicitações à Secretaria" texto={AJUDA.solicitacoes} />
        </h1>
        <p className="text-sm text-muted-foreground">
          Pedidos que qualquer irmão do quadro faz à Loja. Abra o pedido na
          página dele e acompanhe aqui com quem está pendente — todas as
          assinaturas são pelo gov.br.
        </p>
      </div>

      {dbUser.status !== "ATIVO" && (
        <p className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          Sua situação atual é {dbUser.status} — novos pedidos exigem situação
          ATIVO. Você ainda pode acompanhar os pedidos já feitos.
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-1">
        {cards.map((c) => (
          <Link key={c.href} href={c.href} className="block">
            <Card className="transition hover:border-primary/50 hover:shadow-sm">
              <CardHeader>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <CardTitle>{c.titulo}</CardTitle>
                  {c.estado ? (
                    <Badge variant={c.estado.ativo ? "secondary" : "default"}>
                      {c.estado.texto}
                    </Badge>
                  ) : (
                    <Badge variant="outline">Nenhum pedido</Badge>
                  )}
                </div>
                <CardDescription>{c.descricao}</CardDescription>
              </CardHeader>
              <CardContent className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">
                  {c.data
                    ? `Último pedido em ${c.data.toLocaleDateString("pt-BR")}`
                    : "Você ainda não fez este pedido."}
                </span>
                <span className="font-medium text-primary">Abrir →</span>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
