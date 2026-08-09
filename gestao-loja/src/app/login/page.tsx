"use client";

import { useActionState } from "react";
import Link from "next/link";
import { loginAction } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Landmark } from "lucide-react";

export default function LoginPage() {
  const [state, formAction, pending] = useActionState(loginAction, undefined);
  const error = state?.error;
  const lojas = state?.lojas;

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#1c3a5e] p-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <span className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full border-2 border-[#c9973b]">
            <Landmark className="h-8 w-8 text-[#c9973b]" />
          </span>
          <h1 className="text-2xl font-bold text-white">Gestão NoPrumo</h1>
          <p className="mt-1 text-sm text-slate-300">
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
            {lojas && (
              <fieldset className="space-y-2 rounded-md border border-white/15 p-3">
                <legend className="px-1 text-sm font-medium text-slate-200">
                  Seu CIM tem filiação em mais de uma loja — escolha:
                </legend>
                {lojas.map((l, i) => (
                  <label
                    key={l.id}
                    className="flex items-center gap-2 text-sm text-slate-200"
                  >
                    <input
                      type="radio"
                      name="lodgeId"
                      value={l.id}
                      defaultChecked={i === 0}
                      className="h-4 w-4 accent-[#c9973b]"
                    />
                    {l.nome}
                  </label>
                ))}
              </fieldset>
            )}
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
              className="w-full bg-[#c9973b] font-semibold text-[#1c3a5e] hover:bg-[#d4a54e]"
            >
              {pending ? "Entrando..." : "Entrar"}
            </Button>
            <p className="text-center text-xs">
              <Link href="/esqueci-senha" className="text-slate-300 underline">
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
