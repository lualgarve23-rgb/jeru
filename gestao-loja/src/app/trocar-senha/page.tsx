import { redirect } from "next/navigation";
import { KeyRound } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { ActionForm } from "@/components/action-form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AuthShell } from "@/components/public-shell";
import { forcePasswordChange } from "./actions";

export const metadata = { title: "Trocar senha" };

export default async function TrocarSenhaPage() {
  const user = await requireUser();
  const dbUser = await prisma.user.findUniqueOrThrow({
    where: { id: user.id },
    select: { mustChangePassword: true },
  });
  if (!dbUser.mustChangePassword) redirect("/dashboard");

  return (
    <AuthShell
      icon={KeyRound}
      title="Defina sua senha"
      subtitle={`Olá, ${user.name}. No primeiro acesso é obrigatório trocar a senha provisória antes de entrar no painel.`}
    >
      <ActionForm
        action={forcePasswordChange}
        submitLabel="Salvar e entrar"
        className="space-y-4"
      >
        <div className="space-y-1">
          <Label htmlFor="current">Senha provisória (seu CPF)</Label>
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
          <p className="text-xs text-muted-foreground">
            Mínimo de 8 caracteres, com ao menos uma letra e um número. Não use
            o seu CPF.
          </p>
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
    </AuthShell>
  );
}
