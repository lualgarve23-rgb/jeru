import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { canWriteSecretaria } from "@/lib/permissions";
import { createProcessoAdmissao } from "../actions";
import { ActionForm } from "@/components/action-form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AdmissaoKanban } from "./kanban-board";

export default async function AdmissoesPage() {
  const user = await requireRole(
    "SECRETARIO",
    "VENERAVEL_MESTRE",
    "CONSELHO_CONTAS"
  );
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
    },
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Pipeline de Admissão</h1>
        <p className="text-sm text-muted-foreground">
          Arraste os cards entre as etapas do processo de iniciação.
        </p>
      </div>

      {isWriter && (
        <Card className="max-w-xl">
          <CardHeader>
            <CardTitle>Novo candidato</CardTitle>
          </CardHeader>
          <CardContent>
            <ActionForm
              action={createProcessoAdmissao}
              submitLabel="Incluir no pipeline"
            >
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
              </div>
            </ActionForm>
          </CardContent>
        </Card>
      )}

      <AdmissaoKanban processos={processos} />
    </div>
  );
}
