"use server";

import { signIn } from "@/auth";
import { AuthError } from "next-auth";

export async function loginAction(
  _prevState: string | undefined,
  formData: FormData
) {
  try {
    await signIn("credentials", {
      cim: formData.get("cim"),
      cpf: formData.get("cpf"),
      password: formData.get("password"),
      redirectTo: "/dashboard",
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return "CIM, CPF ou senha inválidos.";
    }
    throw error; // inclui o redirect do Next.js
  }
}
