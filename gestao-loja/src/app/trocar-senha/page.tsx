import { redirect } from "next/navigation";
import { KeyRound } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { ActionForm } from "@/components/action-form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
    <main className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-950 via-slate-900 to-slate-800 p-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <span className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full border border-amber-400/40 bg-gradient-to-br from-amber-400/25 to-amber-600/10">
            <KeyRound className="h-8 w-8 text-amber-400" />
          </span>
          <h1 className="text-2xl font-bold text-white">Defina sua senha</h1>
          <p className="mt-1 text-sm text-slate-400">
            Olá, {user.name}. No primeiro acesso é obrigatório trocar a senha
            provisória antes de entrar no painel.
          </p>
        </div>

        <div className="rounded-2xl border bg-white p-6 shadow-2xl">
          <ActionForm action={forcePasswordChange} submitLabel="Salvar e entrar" className="space-y-4">
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
                Mínimo de 8 caracteres, com ao menos uma letra e um número. Não
                use o seu CPF.
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
        </div>
      </div>
    </main>
  );
}
