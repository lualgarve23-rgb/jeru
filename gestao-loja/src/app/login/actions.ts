"use server";

import bcrypt from "bcryptjs";
import { signIn } from "@/auth";
import { AuthError } from "next-auth";
import { redirect } from "next/navigation";
import { contasPorCim } from "@/lib/contas";
import { gravarReconhecimento } from "@/lib/reconhecimento";

export type LoginState =
  | { error?: string; lojas?: { id: string; nome: string }[] }
  | undefined;

export async function loginAction(
  _prevState: LoginState,
  formData: FormData
): Promise<LoginState> {
  const cim = String(formData.get("cim") ?? "");
  const password = String(formData.get("password") ?? "");
  const lodgeId = String(formData.get("lodgeId") ?? "");

  // #16: CIM com filiação em mais de uma loja — se a senha confere em 2+
  // contas e nenhuma loja foi escolhida, pede a escolha antes do signIn.
  // A lista só aparece com a senha correta (não enumera lojas por CIM).
  // Contas bloqueadas (lockedUntil no futuro) não passam pelo bcrypt: o
  // bloqueio anti-força-bruta vale aqui também, não só no authorize.
  if (!lodgeId) {
    const contas = await contasPorCim(cim);
    if (contas.length > 1) {
      const agora = new Date();
      const comSenha = [];
      for (const u of contas) {
        if (u.lockedUntil && u.lockedUntil > agora) continue;
        if (await bcrypt.compare(password.trim(), u.passwordHash)) {
          comSenha.push(u);
        }
      }
      if (comSenha.length > 1) {
        return {
          lojas: comSenha.map((u) => ({ id: u.lodgeId, nome: u.lodge.name })),
        };
      }
    }
  }

  // signIn com sucesso lança o redirect do Next.js (NEXT_REDIRECT); a falha
  // de credencial vem como AuthError. Só depois do sucesso é que gravamos o
  // cookie de reconhecimento (1 ano, links de convite/RSVP sem novo login).
  try {
    await signIn("credentials", {
      cim,
      password,
      ...(lodgeId ? { lodgeId } : {}),
      redirect: false,
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return { error: "CIM ou senha inválidos." };
    }
    throw error;
  }

  // Reconhecimento: só com o login já validado, e só quando a senha confere
  // em exatamente uma conta (com a loja escolhida, quando houver).
  try {
    const contas = await contasPorCim(cim);
    const candidatas = lodgeId
      ? contas.filter((u) => u.lodgeId === lodgeId)
      : contas;
    const comSenha = [];
    for (const u of candidatas) {
      if (await bcrypt.compare(password.trim(), u.passwordHash)) {
        comSenha.push(u);
      }
    }
    if (comSenha.length === 1) {
      await gravarReconhecimento(comSenha[0].id, comSenha[0].lodgeId);
    }
  } catch {
    // reconhecimento é conveniência — nunca impede o login
  }

  redirect("/dashboard");
}
