import { InfoDica } from "@/components/info-dica";
import { AJUDA } from "@/lib/ajuda";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { canWriteSecretaria } from "@/lib/permissions";
import { indicarCandidato } from "../actions";
import { ActionForm } from "@/components/action-form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AdmissaoKanban } from "./kanban-board";
import { CandidatosLista } from "./candidatos-lista";

export default async function AdmissoesPage() {
  // Todos os irmãos veem os candidatos e podem apadrinhar uma indicação;
  // mover o pipeline e validar certidões continua com a Secretaria/VM.
  const user = await requireUser();
  const isWriter = canWriteSecretaria(user.role);
  const processos = await prisma.processoAdmissao.findMany({
    where: { lodgeId: user.lodgeId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      nomeCandidato: true,
      status: true,
      certidoesValidas: true,
      cpf: true,
      email: true,
      phone: true,
      fotoUrl: true,
      token: true,
      createdAt: true,
      observacoes: true,
      padrinhoId: true,
      padrinho: { select: { name: true } },
      anexos: {
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          nome: true,
          sizeBytes: true,
          enviadoPor: true,
          createdAt: true,
        },
      },
    },
  });
  const baseUrl = process.env.APP_URL ?? "http://localhost:3100";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-1 text-2xl font-bold">
          Candidatos e Admissões
          <InfoDica titulo="Pipeline de Admissão" texto={AJUDA.admissoes} />
        </h1>
        <p className="text-sm text-muted-foreground">
          Qualquer irmão pode indicar (apadrinhar) um candidato. O pipeline é
          conduzido pela Secretaria.
        </p>
      </div>

      <Card className="max-w-xl">
        <CardHeader>
          <CardTitle>Indicar candidato</CardTitle>
          <CardDescription>
            Abra o cadastro inicial do seu indicado. Em seguida o sistema gera
            um link para ele baixar os formulários de indicação e devolvê-los
            preenchidos — enviado por e-mail, se você informar o endereço.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ActionForm action={indicarCandidato} submitLabel="Cadastrar candidato">
            <div className="space-y-1">
              <Label htmlFor="nomeCandidato">Nome do candidato</Label>
              <Input id="nomeCandidato" name="nomeCandidato" required />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label htmlFor="cpf">CPF</Label>
                <Input id="cpf" name="cpf" />
              </div>
              <div className="space-y-1">
                <Label htmlFor="phone">Telefone</Label>
                <Input id="phone" name="phone" />
              </div>
            </div>
            <div className="space-y-1">
              <Label htmlFor="email">E-mail</Label>
              <Input id="email" name="email" type="email" />
              <p className="text-xs text-muted-foreground">
                Informando o e-mail, o link dos formulários é enviado
                automaticamente ao candidato.
              </p>
            </div>
            <div className="space-y-1">
              <Label htmlFor="observacoes">Observações do padrinho</Label>
              <textarea
                id="observacoes"
                name="observacoes"
                rows={2}
                className="w-full rounded-md border bg-transparent p-2 text-sm"
                placeholder="como conhece o candidato, tempo de convivência, etc."
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="foto">Foto do candidato</Label>
              <Input id="foto" name="foto" type="file" accept="image/*" />
              <p className="text-xs text-muted-foreground">
                Opcional — imagem de até 500 KB, exibida no card do pipeline.
              </p>
            </div>
          </ActionForm>
        </CardContent>
      </Card>

      <CandidatosLista
        processos={processos.map((p) => ({
          ...p,
          padrinhoNome: p.padrinho?.name ?? null,
          linkCandidato: `${baseUrl}/candidato/${p.token}`,
          souPadrinho: p.padrinhoId === user.id,
        }))}
        isWriter={isWriter}
      />

      <div>
        <h2 className="mb-2 text-lg font-semibold">Pipeline de Admissão</h2>
        <p className="mb-3 text-sm text-muted-foreground">
          {isWriter
            ? "Arraste os cards entre as etapas do processo de iniciação."
            : "Acompanhamento das etapas — a movimentação é feita pela Secretaria."}
        </p>
        <AdmissaoKanban processos={processos} readOnly={!isWriter} />
      </div>
    </div>
  );
}
