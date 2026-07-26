import { ActionForm, ActionButton } from "@/components/action-form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

type ActionResult = { error?: string; ok?: string } | undefined;
type FamiliarAction = (
  prev: ActionResult,
  formData: FormData
) => Promise<ActionResult>;

export type FamiliarItem = {
  id: string;
  name: string;
  parentesco: string;
  birthDate: Date | null;
};

export const parentescoLabels: Record<string, string> = {
  CONJUGE: "Cônjuge",
  FILHO: "Filho(a)",
  DEPENDENTE: "Dependente",
};

function CampoParentesco({
  id,
  defaultValue,
}: {
  id: string;
  defaultValue?: string;
}) {
  return (
    <select
      id={id}
      name="parentesco"
      defaultValue={defaultValue ?? "CONJUGE"}
      className="h-9 w-full rounded-md border bg-transparent px-2 text-sm"
    >
      <option value="CONJUGE">Cônjuge</option>
      <option value="FILHO">Filho(a)</option>
      <option value="DEPENDENTE">Dependente</option>
    </select>
  );
}

function FamiliarLinha({
  familiar,
  editAction,
  removeAction,
}: {
  familiar: FamiliarItem;
  editAction: FamiliarAction;
  removeAction: () => Promise<ActionResult>;
}) {
  const f = familiar;
  return (
    <li className="rounded-md border p-3">
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <span className="min-w-0">
          <strong>{f.name}</strong>{" "}
          <span className="text-muted-foreground">
            · {parentescoLabels[f.parentesco] ?? f.parentesco}
            {f.birthDate &&
              ` · 🎂 ${f.birthDate.toLocaleDateString("pt-BR", {
                timeZone: "UTC",
              })}`}
          </span>
        </span>
        <span className="flex items-center gap-2">
          <ActionButton action={removeAction} label="Remover" variant="outline" />
        </span>
      </div>
      <details className="mt-2">
        <summary className="cursor-pointer text-xs text-muted-foreground underline">
          Editar
        </summary>
        <div className="mt-2">
          <ActionForm action={editAction} submitLabel="Salvar familiar">
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="space-y-1">
                <Label htmlFor={`fam-name-${f.id}`}>Nome</Label>
                <Input id={`fam-name-${f.id}`} name="name" defaultValue={f.name} required />
              </div>
              <div className="space-y-1">
                <Label htmlFor={`fam-parentesco-${f.id}`}>Parentesco</Label>
                <CampoParentesco
                  id={`fam-parentesco-${f.id}`}
                  defaultValue={f.parentesco}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor={`fam-birthDate-${f.id}`}>Data de nascimento</Label>
                <Input
                  id={`fam-birthDate-${f.id}`}
                  name="birthDate"
                  type="date"
                  defaultValue={
                    f.birthDate ? f.birthDate.toISOString().slice(0, 10) : ""
                  }
                />
              </div>
            </div>
          </ActionForm>
        </div>
      </details>
    </li>
  );
}

// Cadastro de cônjuge, filhos e demais dependentes — usado tanto na ficha do
// membro (Secretário/VM) quanto no perfil do próprio irmão. Segmentado por
// parentesco, com edição em cada familiar.
export function FamiliaresCard({
  familiares,
  addAction,
  editAction,
  removeAction,
}: {
  familiares: FamiliarItem[];
  addAction: FamiliarAction;
  // Recebe o id do familiar já aplicado via .bind no chamador
  editAction: (familiarId: string) => FamiliarAction;
  removeAction: (familiarId: string) => Promise<ActionResult>;
}) {
  const grupos = [
    ["CONJUGE", "Cônjuge"],
    ["FILHO", "Filhos"],
    ["DEPENDENTE", "Demais dependentes"],
  ] as const;
  return (
    <Card>
      <CardHeader>
        <CardTitle>Família</CardTitle>
        <CardDescription>
          Cônjuge, filhos e demais dependentes — quem tem data de nascimento
          alimenta os alertas de aniversariantes da Loja. Use
          &quot;Editar&quot; para classificar os dependentes importados do
          Meta.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {familiares.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nenhum familiar cadastrado.
          </p>
        ) : (
          grupos.map(([tipo, rotulo]) => {
            const itens = familiares.filter((f) => f.parentesco === tipo);
            if (itens.length === 0) return null;
            return (
              <div key={tipo}>
                <h3 className="mb-2 text-sm font-medium">{rotulo}</h3>
                <ul className="space-y-2">
                  {itens.map((f) => (
                    <FamiliarLinha
                      key={f.id}
                      familiar={f}
                      editAction={editAction(f.id)}
                      removeAction={removeAction.bind(null, f.id)}
                    />
                  ))}
                </ul>
              </div>
            );
          })
        )}

        <ActionForm action={addAction} submitLabel="Adicionar familiar">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1">
              <Label htmlFor="fam-name">Nome</Label>
              <Input id="fam-name" name="name" required />
            </div>
            <div className="space-y-1">
              <Label htmlFor="fam-parentesco">Parentesco</Label>
              <CampoParentesco id="fam-parentesco" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="fam-birthDate">Data de nascimento</Label>
              <Input id="fam-birthDate" name="birthDate" type="date" />
              <p className="text-xs text-muted-foreground">
                Opcional — sem ela o familiar fica fora dos alertas de
                aniversário.
              </p>
            </div>
          </div>
        </ActionForm>
      </CardContent>
    </Card>
  );
}
