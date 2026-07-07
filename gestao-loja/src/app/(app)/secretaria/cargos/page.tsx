import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { canWriteSecretaria } from "@/lib/permissions";
import { createCargoRito } from "../actions";
import { ActionForm } from "@/components/action-form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DeleteCargoButton } from "./delete-cargo-button";

export default async function CargosRitoPage() {
  const user = await requireRole(
    "SECRETARIO",
    "VENERAVEL_MESTRE",
    "CONSELHO_CONTAS"
  );
  const isWriter = canWriteSecretaria(user.role);
  const cargos = await prisma.cargoRito.findMany({
    where: { lodgeId: user.lodgeId },
    orderBy: { nome: "asc" },
  });
  const emUso = await prisma.user.groupBy({
    by: ["cargoRito"],
    where: { lodgeId: user.lodgeId, cargoRito: { not: null } },
    _count: true,
  });
  const usoPorNome = new Map(emUso.map((u) => [u.cargoRito, u._count]));

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Cargos do Rito</h1>
        <p className="text-sm text-muted-foreground">
          Cadastre os cargos próprios do rito praticado pela Loja (ex.:
          Hospitaleiro, Mestre de Harmonia, Porta-Estandarte). Eles ficam
          disponíveis na nomeação de cargos dos membros, com o mesmo nível de
          acesso de um Obreiro.
        </p>
      </div>

      {isWriter && (
        <Card>
          <CardHeader>
            <CardTitle>Novo cargo</CardTitle>
          </CardHeader>
          <CardContent>
            <ActionForm action={createCargoRito} submitLabel="Cadastrar cargo">
              <div className="space-y-1">
                <Label htmlFor="nome">Nome do cargo</Label>
                <Input id="nome" name="nome" required />
              </div>
            </ActionForm>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Cargos cadastrados</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="divide-y text-sm">
            {cargos.map((c) => (
              <li
                key={c.id}
                className="flex flex-wrap items-center justify-between gap-2 py-2"
              >
                <span>
                  {c.nome}
                  {usoPorNome.get(c.nome) ? (
                    <span className="ml-2 text-xs text-muted-foreground">
                      {usoPorNome.get(c.nome)} membro(s)
                    </span>
                  ) : null}
                </span>
                {isWriter && <DeleteCargoButton cargoId={c.id} nome={c.nome} />}
              </li>
            ))}
            {cargos.length === 0 && (
              <li className="py-2 text-muted-foreground">
                Nenhum cargo do rito cadastrado.
              </li>
            )}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
