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

export type FamiliarItem = {
  id: string;
  name: string;
  parentesco: string;
  birthDate: Date;
};

export const parentescoLabels: Record<string, string> = {
  CONJUGE: "Cônjuge",
  FILHO: "Filho(a)",
};

// Cadastro de cônjuge e filhos com data de aniversário — usado tanto na
// ficha do membro (Secretário/VM) quanto no perfil do próprio irmão.
export function FamiliaresCard({
  familiares,
  addAction,
  removeAction,
}: {
  familiares: FamiliarItem[];
  addAction: (prev: ActionResult, formData: FormData) => Promise<ActionResult>;
  removeAction: (familiarId: string) => Promise<ActionResult>;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Família</CardTitle>
        <CardDescription>
          Cônjuge e filhos, com data de aniversário — alimentam os alertas de
          aniversariantes da Loja.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {familiares.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nenhum familiar cadastrado.
          </p>
        ) : (
          <ul className="space-y-2 text-sm">
            {familiares.map((f) => (
              <li
                key={f.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3"
              >
                <span className="min-w-0">
                  <strong>{f.name}</strong>{" "}
                  <span className="text-muted-foreground">
                    · {parentescoLabels[f.parentesco] ?? f.parentesco} · 🎂{" "}
                    {f.birthDate.toLocaleDateString("pt-BR", {
                      timeZone: "UTC",
                    })}
                  </span>
                </span>
                <ActionButton
                  action={removeAction.bind(null, f.id)}
                  label="Remover"
                  variant="outline"
                />
              </li>
            ))}
          </ul>
        )}

        <ActionForm action={addAction} submitLabel="Adicionar familiar">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1">
              <Label htmlFor="fam-name">Nome</Label>
              <Input id="fam-name" name="name" required />
            </div>
            <div className="space-y-1">
              <Label htmlFor="fam-parentesco">Parentesco</Label>
              <select
                id="fam-parentesco"
                name="parentesco"
                className="h-9 w-full rounded-md border bg-transparent px-2 text-sm"
              >
                <option value="CONJUGE">Cônjuge</option>
                <option value="FILHO">Filho(a)</option>
              </select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="fam-birthDate">Data de nascimento</Label>
              <Input
                id="fam-birthDate"
                name="birthDate"
                type="date"
                required
              />
            </div>
          </div>
        </ActionForm>
      </CardContent>
    </Card>
  );
}
