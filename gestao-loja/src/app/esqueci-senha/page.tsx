"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import { requestPasswordReset, resetPasswordWithCode } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

// Recuperação de senha em 2 passos (2FA por e-mail):
// 1) CIM + CPF → código de 6 dígitos no e-mail cadastrado
// 2) código + nova senha
export default function EsqueciSenhaPage() {
  const [cim, setCim] = useState("");
  const [cpf, setCpf] = useState("");
  const [step, setStep] = useState<1 | 2>(1);

  const [reqState, requestAction, requesting] = useActionState(
    async (prev: Awaited<ReturnType<typeof requestPasswordReset>>, fd: FormData) => {
      const result = await requestPasswordReset(prev, fd);
      if (result?.ok) setStep(2);
      return result;
    },
    undefined
  );
  const [resetState, resetAction, resetting] = useActionState(
    resetPasswordWithCode,
    undefined
  );

  const fieldClass =
    "border-white/15 bg-white/10 text-white placeholder:text-slate-500";

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#1c3a5e] p-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <span className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full border-2 border-[#c9973b]">
            <ShieldCheck className="h-8 w-8 text-[#c9973b]" />
          </span>
          <h1 className="text-2xl font-bold text-white">Recuperar senha</h1>
          <p className="mt-1 text-sm text-slate-300">
            {step === 1
              ? "Informe seu CIM e CPF para receber o código por e-mail."
              : "Digite o código recebido e a nova senha."}
          </p>
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/5 p-6 shadow-2xl backdrop-blur">
          {step === 1 ? (
            <form action={requestAction} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="cim" className="text-slate-200">
                  CIM
                </Label>
                <Input
                  id="cim"
                  name="cim"
                  placeholder="Nº do CIM"
                  required
                  value={cim}
                  onChange={(e) => setCim(e.target.value)}
                  className={fieldClass}
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
                  value={cpf}
                  onChange={(e) => setCpf(e.target.value)}
                  className={fieldClass}
                />
              </div>
              {reqState?.error && (
                <p className="rounded-md bg-red-500/15 p-2 text-sm text-red-300" role="alert">
                  {reqState.error}
                </p>
              )}
              <Button
                type="submit"
                disabled={requesting}
                className="w-full bg-[#c9973b] font-semibold text-[#1c3a5e] hover:bg-[#d4a54e]"
              >
                {requesting ? "Enviando..." : "Enviar código"}
              </Button>
            </form>
          ) : (
            <form action={resetAction} className="space-y-4">
              <input type="hidden" name="cim" value={cim} />
              <input type="hidden" name="cpf" value={cpf} />
              {reqState?.ok && (
                <p className="rounded-md bg-emerald-500/15 p-2 text-sm text-emerald-300">
                  {reqState.ok}
                </p>
              )}
              <div className="space-y-2">
                <Label htmlFor="code" className="text-slate-200">
                  Código de verificação
                </Label>
                <Input
                  id="code"
                  name="code"
                  inputMode="numeric"
                  placeholder="6 dígitos"
                  maxLength={6}
                  required
                  className={fieldClass}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="next" className="text-slate-200">
                  Nova senha
                </Label>
                <Input
                  id="next"
                  name="next"
                  type="password"
                  autoComplete="new-password"
                  minLength={8}
                  required
                  className={fieldClass}
                />
                <p className="text-xs text-slate-500">
                  Mínimo de 8 caracteres, com ao menos uma letra e um número.
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirm" className="text-slate-200">
                  Confirmar nova senha
                </Label>
                <Input
                  id="confirm"
                  name="confirm"
                  type="password"
                  autoComplete="new-password"
                  minLength={8}
                  required
                  className={fieldClass}
                />
              </div>
              {resetState?.error && (
                <p className="rounded-md bg-red-500/15 p-2 text-sm text-red-300" role="alert">
                  {resetState.error}
                </p>
              )}
              {resetState?.ok ? (
                <p className="rounded-md bg-emerald-500/15 p-2 text-sm text-emerald-300">
                  {resetState.ok}{" "}
                  <Link href="/login" className="underline">
                    Ir para o login
                  </Link>
                </p>
              ) : (
                <Button
                  type="submit"
                  disabled={resetting}
                  className="w-full bg-[#c9973b] font-semibold text-[#1c3a5e] hover:bg-[#d4a54e]"
                >
                  {resetting ? "Salvando..." : "Redefinir senha"}
                </Button>
              )}
              <button
                type="button"
                onClick={() => setStep(1)}
                className="w-full text-center text-xs text-slate-300 underline"
              >
                Não recebeu? Voltar e reenviar o código
              </button>
            </form>
          )}
        </div>

        <p className="mt-6 text-center text-xs text-slate-500">
          <Link href="/login" className="underline">
            Voltar ao login
          </Link>
        </p>
      </div>
    </main>
  );
}
