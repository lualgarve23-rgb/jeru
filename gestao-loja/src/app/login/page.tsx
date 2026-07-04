"use client";

import { useActionState } from "react";
import Link from "next/link";
import { loginAction } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Landmark } from "lucide-react";

export default function LoginPage() {
  const [error, formAction, pending] = useActionState(loginAction, undefined);

  return (
    <main className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-950 via-slate-900 to-slate-800 p-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <span className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full border border-amber-400/40 bg-gradient-to-br from-amber-400/25 to-amber-600/10">
            <Landmark className="h-8 w-8 text-amber-400" />
          </span>
          <h1 className="text-2xl font-bold text-white">Gestão da Loja</h1>
          <p className="mt-1 text-sm text-slate-400">
            Sistema de Secretaria e Tesouraria
          </p>
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/5 p-6 shadow-2xl backdrop-blur">
          <form action={formAction} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="cim" className="text-slate-200">
                CIM
              </Label>
              <Input
                id="cim"
                name="cim"
                placeholder="Nº do CIM"
                required
                className="border-white/15 bg-white/10 text-white placeholder:text-slate-500"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="cpf" className="text-slate-200">
                CPF
              </Label>
              <Input
                id="cpf"
                name="cpf"
                placeholder="000.000.000-00"
                required
                className="border-white/15 bg-white/10 text-white placeholder:text-slate-500"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password" className="text-slate-200">
                Senha
              </Label>
              <Input
                id="password"
                name="password"
                type="password"
                required
                className="border-white/15 bg-white/10 text-white"
              />
            </div>
            {error && (
              <p
                className="rounded-md bg-red-500/15 p-2 text-sm text-red-300"
                role="alert"
              >
                {error}
              </p>
            )}
            <Button
              type="submit"
              disabled={pending}
              className="w-full bg-amber-500 font-semibold text-slate-950 hover:bg-amber-400"
            >
              {pending ? "Entrando..." : "Entrar"}
            </Button>
            <p className="text-center text-xs">
              <Link href="/esqueci-senha" className="text-slate-400 underline">
                Esqueci minha senha
              </Link>
            </p>
          </form>
        </div>

        <p className="mt-6 text-center text-xs text-slate-500">
          Acesso restrito aos obreiros do quadro.
        </p>
      </div>
    </main>
  );
}
