"use server";

import bcrypt from "bcryptjs";
import { signIn } from "@/auth";
import { AuthError } from "next-auth";
import { contasPorCim } from "@/lib/contas";

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
  if (!lodgeId) {
    const contas = await contasPorCim(cim);
    if (contas.length > 1) {
      const digits = password.replace(/\D/g, "");
      const comSenha = [];
      for (const u of contas) {
        let valid = await bcrypt.compare(password.trim(), u.passwordHash);
        if (!valid && digits) {
          valid = await bcrypt.compare(digits, u.passwordHash);
        }
        if (valid) comSenha.push(u);
      }
      if (comSenha.length > 1) {
        return {
          lojas: comSenha.map((u) => ({ id: u.lodgeId, nome: u.lodge.name })),
        };
      }
    }
  }

  try {
    await signIn("credentials", {
      cim,
      password,
      ...(lodgeId ? { lodgeId } : {}),
      redirectTo: "/dashboard",
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return { error: "CIM ou senha inválidos." };
    }
    throw error; // inclui o redirect do Next.js
  }
}
