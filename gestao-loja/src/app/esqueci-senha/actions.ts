"use server";

import bcrypt from "bcryptjs";
import { randomInt } from "crypto";
import { prisma } from "@/lib/prisma";
import { passwordRuleError } from "@/lib/password";
import { sendLodgeEmail, isGmailConfigured } from "@/lib/gmail";
import { contasPorCim } from "@/lib/contas";

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

// #16: o mesmo CIM+CPF pode ter conta em mais de uma loja (filiação
// múltipla) — o reset vale para todas as contas do titular de uma vez.
async function findByCimCpf(cim: string, cpf: string) {
  const contas = await contasPorCim(cim);
  return contas.filter(
    (u) => u.cpf.replace(/\D/g, "") === cpf.replace(/\D/g, "")
  );
}

// Passo 1 — gera o código 2FA e envia por e-mail
export async function requestPasswordReset(
  _prev: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  const cim = String(formData.get("cim") ?? "");
  const cpf = String(formData.get("cpf") ?? "");
  if (!cim || !cpf) return { error: "Informe CIM e CPF." };

  const contas = await findByCimCpf(cim, cpf);
  if (!contas.length) return { ok: GENERIC_OK }; // resposta idêntica ao sucesso
  const user = contas[0];

  if (!(await isGmailConfigured(user.lodgeId))) {
    return {
      error:
        "Envio de e-mail não configurado nesta instalação. Procure a Secretaria para redefinir sua senha.",
    };
  }

  // O mesmo código serve para todas as filiações do titular
  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  const codeHash = await bcrypt.hash(code, 10);
  await prisma.user.updateMany({
    where: { id: { in: contas.map((u) => u.id) } },
    data: {
      resetCodeHash: codeHash,
      resetCodeExpiresAt: new Date(Date.now() + CODE_TTL_MINUTES * 60_000),
      resetCodeAttempts: 0,
    },
  });
  for (const email of new Set(contas.map((u) => u.email))) {
    await sendLodgeEmail({
      lodgeId: user.lodgeId,
      to: email,
      subject: "Código de recuperação de senha — Gestão NoPrumo",
      text:
        `Olá, ${user.name}.\n\n` +
        `Seu código de verificação é: ${code}\n\n` +
        `Ele vale por ${CODE_TTL_MINUTES} minutos. Se você não pediu a ` +
        `recuperação de senha, ignore este e-mail.`,
    });
  }
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

  const contas = await findByCimCpf(cim, cpf);
  // mensagem única para dados errados/código inválido
  const invalid = { error: "Código inválido ou expirado." };
  const user = contas[0];
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

  // A nova senha vale para todas as filiações do titular
  await prisma.user.updateMany({
    where: { id: { in: contas.map((u) => u.id) } },
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
