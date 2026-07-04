"use server";

import bcrypt from "bcryptjs";
import { randomInt } from "crypto";
import { prisma } from "@/lib/prisma";
import { passwordRuleError } from "@/lib/password";
import { sendLodgeEmail, isGmailConfigured } from "@/lib/gmail";

type ActionResult = { error?: string; ok?: string } | undefined;

const CODE_TTL_MINUTES = 15;
const MAX_ATTEMPTS = 5;

// Resposta genérica — não revela se CIM/CPF existem (evita enumeração)
const GENERIC_OK =
  "Se os dados conferem, enviamos um código de verificação para o e-mail cadastrado. Ele vale por 15 minutos.";

function maskEmail(email: string) {
  const [local, domain] = email.split("@");
  return `${local.slice(0, 2)}${"*".repeat(Math.max(local.length - 2, 2))}@${domain}`;
}

async function findByCimCpf(cim: string, cpf: string) {
  const user = await prisma.user.findUnique({ where: { cim: cim.trim() } });
  if (!user) return null;
  if (user.cpf.replace(/\D/g, "") !== cpf.replace(/\D/g, "")) return null;
  return user;
}

// Passo 1 — gera o código 2FA e envia por e-mail
export async function requestPasswordReset(
  _prev: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  const cim = String(formData.get("cim") ?? "");
  const cpf = String(formData.get("cpf") ?? "");
  if (!cim || !cpf) return { error: "Informe CIM e CPF." };

  if (!isGmailConfigured()) {
    return {
      error:
        "Envio de e-mail não configurado nesta instalação. Procure a Secretaria para redefinir sua senha.",
    };
  }

  const user = await findByCimCpf(cim, cpf);
  if (!user) return { ok: GENERIC_OK }; // resposta idêntica ao sucesso

  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  await prisma.user.update({
    where: { id: user.id },
    data: {
      resetCodeHash: await bcrypt.hash(code, 10),
      resetCodeExpiresAt: new Date(Date.now() + CODE_TTL_MINUTES * 60_000),
      resetCodeAttempts: 0,
    },
  });
  await sendLodgeEmail({
    to: user.email,
    subject: "Código de recuperação de senha — Gestão da Loja",
    text:
      `Olá, ${user.name}.\n\n` +
      `Seu código de verificação é: ${code}\n\n` +
      `Ele vale por ${CODE_TTL_MINUTES} minutos. Se você não pediu a ` +
      `recuperação de senha, ignore este e-mail.`,
  });
  return { ok: `${GENERIC_OK} (${maskEmail(user.email)})` };
}

// Passo 2 — confere o código e define a nova senha
export async function resetPasswordWithCode(
  _prev: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  const cim = String(formData.get("cim") ?? "");
  const cpf = String(formData.get("cpf") ?? "");
  const code = String(formData.get("code") ?? "").trim();
  const next = String(formData.get("next") ?? "");
  const confirm = String(formData.get("confirm") ?? "");

  const user = await findByCimCpf(cim, cpf);
  // mensagem única para dados errados/código inválido
  const invalid = { error: "Código inválido ou expirado." };
  if (!user || !user.resetCodeHash || !user.resetCodeExpiresAt) return invalid;

  if (user.resetCodeExpiresAt < new Date()) return invalid;
  if (user.resetCodeAttempts >= MAX_ATTEMPTS) {
    return { error: "Muitas tentativas. Solicite um novo código." };
  }

  const match = await bcrypt.compare(code, user.resetCodeHash);
  if (!match) {
    await prisma.user.update({
      where: { id: user.id },
      data: { resetCodeAttempts: { increment: 1 } },
    });
    return invalid;
  }

  const ruleError = passwordRuleError(next);
  if (ruleError) return { error: ruleError };
  if (next !== confirm) {
    return { error: "A confirmação não confere com a nova senha." };
  }
  if (next.replace(/\D/g, "") === user.cpf.replace(/\D/g, "")) {
    return { error: "A nova senha não pode ser o seu CPF." };
  }

  await prisma.user.update({
    where: { id: user.id },
    data: {
      passwordHash: await bcrypt.hash(next, 10),
      mustChangePassword: false,
      resetCodeHash: null,
      resetCodeExpiresAt: null,
      resetCodeAttempts: 0,
    },
  });
  return { ok: "Senha redefinida. Você já pode entrar com a nova senha." };
}
