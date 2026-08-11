"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import { requestPasswordReset, resetPasswordWithCode } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AuthShell } from "@/components/public-shell";

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

  return (
    <AuthShell
      icon={ShieldCheck}
      title="Recuperar senha"
      subtitle={
        step === 1
          ? "Informe seu CIM e CPF para receber o código por e-mail."
          : "Digite o código recebido e a nova senha."
      }
      footer={
        <Link href="/login" className="underline underline-offset-2">
          Voltar ao login
        </Link>
      }
    >
      {step === 1 ? (
        <form action={requestAction} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="cim">CIM</Label>
            <Input
              id="cim"
              name="cim"
              placeholder="Nº do CIM"
              required
              value={cim}
              onChange={(e) => setCim(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="cpf">CPF</Label>
            <Input
              id="cpf"
              name="cpf"
              placeholder="000.000.000-00"
              required
              value={cpf}
              onChange={(e) => setCpf(e.target.value)}
            />
          </div>
          {reqState?.error && (
            <p
              className="rounded-xl bg-destructive/10 p-2.5 text-sm text-destructive"
              role="alert"
            >
              {reqState.error}
            </p>
          )}
          <Button
            type="submit"
            disabled={requesting}
            className="w-full font-semibold"
          >
            {requesting ? "Enviando..." : "Enviar código"}
          </Button>
        </form>
      ) : (
        <form action={resetAction} className="space-y-4">
          <input type="hidden" name="cim" value={cim} />
          <input type="hidden" name="cpf" value={cpf} />
          {reqState?.ok && (
            <p className="rounded-xl bg-success-soft p-2.5 text-sm text-success">
              {reqState.ok}
            </p>
          )}
          <div className="space-y-2">
            <Label htmlFor="code">Código de verificação</Label>
            <Input
              id="code"
              name="code"
              inputMode="numeric"
              placeholder="6 dígitos"
              maxLength={6}
              required
            />
          </div>
          <div className="space-y-2">
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
              Mínimo de 8 caracteres, com ao menos uma letra e um número.
            </p>
          </div>
          <div className="space-y-2">
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
          {resetState?.error && (
            <p
              className="rounded-xl bg-destructive/10 p-2.5 text-sm text-destructive"
              role="alert"
            >
              {resetState.error}
            </p>
          )}
          {resetState?.ok ? (
            <p className="rounded-xl bg-success-soft p-2.5 text-sm text-success">
              {resetState.ok}{" "}
              <Link href="/login" className="underline underline-offset-2">
                Ir para o login
              </Link>
            </p>
          ) : (
            <Button
              type="submit"
              disabled={resetting}
              className="w-full font-semibold"
            >
              {resetting ? "Salvando..." : "Redefinir senha"}
            </Button>
          )}
          <button
            type="button"
            onClick={() => setStep(1)}
            className="w-full text-center text-xs text-muted-foreground underline underline-offset-2"
          >
            Não recebeu? Voltar e reenviar o código
          </button>
        </form>
      )}
    </AuthShell>
  );
}
