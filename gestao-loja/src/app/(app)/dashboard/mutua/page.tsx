import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import {
  enviarMutua,
  marcarEntregaAnterior,
  desmarcarEntregaAnterior,
} from "./actions";
import { ActionForm, ActionButton } from "@/components/action-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { InfoDica } from "@/components/info-dica";
import { AJUDA } from "@/lib/ajuda";
import { ExternalLink } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

/*
 * Mútua (CABM): o irmão vê se já entregou a Declaração de Beneficiários
 * (Form. 108); se não, baixa o formulário pré-preenchido e anexa o documento
 * assinado para a Secretaria. Secretário, VM, Tesoureiro e Esmoler enxergam
 * as entregas de todo o quadro. Filiados entregam na loja-mãe (só consulta).
 */

const CARGOS_MUTUA = ["SECRETARIO", "VENERAVEL_MESTRE", "TESOUREIRO", "ESMOLER"];

const CONSULTA_GOBSP =
  "https://gobsp.org.br/conecta/sistema/cabm/relatorio-entrega/";

export default async function MutuaPage() {
  const user = await requireUser();
  const veTodas = CARGOS_MUTUA.includes(user.role);
  // Secretário e VM podem marcar entregas feitas antes da implantação do sistema
  const podeMarcar = ["SECRETARIO", "VENERAVEL_MESTRE"].includes(user.role);

  const [dbUser, minha, entregas, semEntrega] = await Promise.all([
    prisma.user.findUniqueOrThrow({
      where: { id: user.id },
      select: { filiado: true },
    }),
    prisma.mutuaEntrega.findUnique({
      where: { userId: user.id },
      select: { id: true, nome: true, entregueAntes: true, enviadaAt: true },
    }),
    veTodas
      ? prisma.mutuaEntrega.findMany({
          where: { lodgeId: user.lodgeId },
          orderBy: { enviadaAt: "desc" },
          select: {
            id: true,
            nome: true,
            entregueAntes: true,
            marcadaPor: true,
            enviadaAt: true,
            user: { select: { name: true, cim: true } },
          },
        })
      : [],
    veTodas
      ? prisma.user.findMany({
          where: {
            lodgeId: user.lodgeId,
            status: { not: "EX_MEMBRO" },
            filiado: false,
            currentRole: { not: "SUPER_ADMIN" },
            mutuaEntrega: null,
          },
          orderBy: { name: "asc" },
          select: { id: true, name: true, cim: true },
        })
      : [],
  ]);

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="flex items-center gap-1 text-2xl font-bold">
          Mútua (CABM)
          <InfoDica titulo="Mútua (CABM)" texto={AJUDA.mutua} />
        </h1>
        <p className="text-sm text-muted-foreground">
          Declaração de Beneficiários (Form. 108) da Caixa de Assistência e
          Beneficência Maçônica — o documento que garante o amparo da sua
          família.
        </p>
      </div>

      {dbUser.filiado ? (
        <p className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          Como obreiro filiado, você recolhe a Mútua e entrega a Declaração de
          Beneficiários na sua loja-mãe. Use a consulta abaixo para conferir a
          sua situação no GOB-SP.
        </p>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Minha entrega</CardTitle>
            <CardDescription>
              Situação da sua Declaração de Beneficiários nesta Loja.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {minha ? (
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3 text-sm">
                <span>
                  {minha.entregueAntes && !minha.nome
                    ? "Entrega em papel registrada pela Secretaria (anterior ao sistema). Se quiser, anexe abaixo uma cópia digital."
                    : `Entregue em ${minha.enviadaAt.toLocaleDateString("pt-BR")}`}
                </span>
                <span className="flex items-center gap-2">
                  <Badge>Entregue</Badge>
                  {minha.nome && (
                    <Button asChild size="sm" variant="outline">
                      <a href={`/dashboard/mutua/arquivo/${minha.id}`}>
                        Baixar meu formulário
                      </a>
                    </Button>
                  )}
                </span>
              </div>
            ) : (
              <>
                <p className="flex items-center gap-2 text-sm">
                  <Badge variant="secondary">Não entregue</Badge>
                  Você ainda não entregou a Declaração de Beneficiários.
                </p>
                <ol className="list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
                  <li>
                    Baixe o Form. 108 pré-preenchido com os seus dados e os da
                    Loja.
                  </li>
                  <li>
                    Complete a tabela de beneficiários: nome completo, grau de
                    parentesco, RG e percentual de cada um (a soma deve fechar
                    em 100%).
                  </li>
                  <li>
                    Assine e reconheça a firma em cartório, para eventual prova
                    perante terceiros no mundo profano.
                  </li>
                  <li>
                    Digitalize (PDF ou foto legível) e anexe abaixo para enviar
                    à Secretaria.
                  </li>
                </ol>
                <Button asChild variant="outline">
                  <a href="/dashboard/mutua/formulario">
                    Baixar formulário pré-preenchido
                  </a>
                </Button>
              </>
            )}

            <ActionForm
              action={enviarMutua}
              submitLabel={
                minha ? "Reenviar (substitui a anterior)" : "Anexar e enviar à Secretaria"
              }
            >
              <div className="space-y-1.5">
                <Label htmlFor="arquivo">
                  {minha
                    ? "Enviar nova versão do formulário assinado"
                    : "Formulário preenchido e assinado"}
                </Label>
                <Input
                  id="arquivo"
                  name="arquivo"
                  type="file"
                  accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
                  required
                />
              </div>
            </ActionForm>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Consulta oficial no GOB-SP</CardTitle>
          <CardDescription>
            Relatório de entrega da Declaração de Beneficiários no Conecta
            GOB-SP (login do portal).
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild variant="outline">
            <a href={CONSULTA_GOBSP} target="_blank" rel="noreferrer">
              <ExternalLink className="mr-2 h-4 w-4" />
              Consultar entregas no Conecta GOB-SP
            </a>
          </Button>
        </CardContent>
      </Card>

      {veTodas && (
        <Card>
          <CardHeader>
            <CardTitle>Entregas do quadro</CardTitle>
            <CardDescription>
              Visível ao Secretário, Venerável Mestre, Tesoureiro e Esmoler.
              Filiados não entram na lista — entregam na loja-mãe.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {entregas.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Nenhuma entrega recebida até agora.
              </p>
            ) : (
              <ul className="divide-y rounded-md border">
                {entregas.map((e) => (
                  <li
                    key={e.id}
                    className="flex flex-wrap items-center justify-between gap-2 p-3 text-sm"
                  >
                    <span>
                      {e.user.name}{" "}
                      <span className="text-muted-foreground">
                        · CIM {e.user.cim} ·{" "}
                        {e.enviadaAt.toLocaleDateString("pt-BR")}
                      </span>
                    </span>
                    {e.nome ? (
                      <Button asChild size="sm" variant="ghost">
                        <a href={`/dashboard/mutua/arquivo/${e.id}`}>Baixar</a>
                      </Button>
                    ) : (
                      <span className="flex items-center gap-2">
                        <Badge variant="secondary">
                          Anterior ao sistema
                          {e.marcadaPor ? ` · por ${e.marcadaPor}` : ""}
                        </Badge>
                        {podeMarcar && (
                          <ActionButton
                            action={desmarcarEntregaAnterior.bind(null, e.id)}
                            label="Desfazer"
                            variant="outline"
                            confirm="Desfazer a marcação de entrega anterior deste irmão?"
                          />
                        )}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            )}

            {semEntrega.length > 0 && (
              <div>
                <p className="mb-1 text-sm font-medium">
                  Ainda sem entrega ({semEntrega.length})
                </p>
                {podeMarcar ? (
                  <>
                    <p className="mb-2 text-sm text-muted-foreground">
                      Quem já entregou em papel, antes da implantação do
                      sistema, pode ser marcado aqui como entregue.
                    </p>
                    <ul className="divide-y rounded-md border">
                      {semEntrega.map((m) => (
                        <li
                          key={m.id}
                          className="flex flex-wrap items-center justify-between gap-2 p-3 text-sm"
                        >
                          <span>
                            {m.name}{" "}
                            <span className="text-muted-foreground">
                              · CIM {m.cim}
                            </span>
                          </span>
                          <ActionButton
                            action={marcarEntregaAnterior.bind(null, m.id)}
                            label="Já entregou antes do sistema"
                            variant="outline"
                          />
                        </li>
                      ))}
                    </ul>
                  </>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    {semEntrega
                      .map((m) => `${m.name} (CIM ${m.cim})`)
                      .join(", ")}
                  </p>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
