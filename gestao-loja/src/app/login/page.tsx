"use client";

import { useActionState } from "react";
import Link from "next/link";
import { loginAction } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AuthShell } from "@/components/public-shell";
import { Landmark } from "lucide-react";

export default function LoginPage() {
  const [state, formAction, pending] = useActionState(loginAction, undefined);
  const error = state?.error;
  const lojas = state?.lojas;

  return (
    <AuthShell
      icon={Landmark}
      title="Gestão NoPrumo"
      subtitle="Sistema de Secretaria e Tesouraria"
      footer="Acesso restrito aos obreiros do quadro."
    >
      <form action={formAction} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="cim">CIM</Label>
          <Input id="cim" name="cim" placeholder="Nº do CIM" required />
        </div>
        <div className="space-y-2">
          <Label htmlFor="password">Senha</Label>
          <Input id="password" name="password" type="password" required />
        </div>
        {lojas && (
          <fieldset className="space-y-2 rounded-xl border p-3">
            <legend className="px-1 text-sm font-medium">
              Seu CIM tem filiação em mais de uma loja — escolha:
            </legend>
            {lojas.map((l, i) => (
              <label
                key={l.id}
                className="flex items-center gap-2 text-sm"
              >
                <input
                  type="radio"
                  name="lodgeId"
                  value={l.id}
                  defaultChecked={i === 0}
                  className="h-4 w-4 accent-gold"
                />
                {l.nome}
              </label>
            ))}
          </fieldset>
        )}
        {error && (
          <p
            className="rounded-xl bg-destructive/10 p-2.5 text-sm text-destructive"
            role="alert"
          >
            {error}
          </p>
        )}
        <Button type="submit" disabled={pending} className="w-full font-semibold">
          {pending ? "Entrando..." : "Entrar"}
        </Button>
        <p className="text-center text-xs">
          <Link
            href="/esqueci-senha"
            className="text-muted-foreground underline underline-offset-2"
          >
            Esqueci minha senha
          </Link>
        </p>
      </form>
    </AuthShell>
  );
}
