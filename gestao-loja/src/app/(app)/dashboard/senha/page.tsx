import { requireUser } from "@/lib/session";
import { ActionForm } from "@/components/action-form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { changePassword } from "./actions";

export default async function SenhaPage() {
  await requireUser();

  return (
    <div className="max-w-md space-y-6">
      <h1 className="text-2xl font-bold">Alterar senha</h1>

      <Card>
        <CardHeader>
          <CardTitle>Nova senha de acesso</CardTitle>
          <CardDescription>
            Mínimo de 8 caracteres. Não use o seu CPF como senha.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ActionForm action={changePassword} submitLabel="Alterar senha">
            <div className="space-y-1">
              <Label htmlFor="current">Senha atual</Label>
              <Input
                id="current"
                name="current"
                type="password"
                autoComplete="current-password"
                required
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="next">Nova senha</Label>
              <Input
                id="next"
                name="next"
                type="password"
                autoComplete="new-password"
                minLength={8}
                required
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="confirm">Confirmar nova senha</Label>
              <Input
                id="confirm"
                name="confirm"
                type="password"
                autoComplete="new-password"
                minLength={8}
                required
              />
            </div>
          </ActionForm>
        </CardContent>
      </Card>
    </div>
  );
}
