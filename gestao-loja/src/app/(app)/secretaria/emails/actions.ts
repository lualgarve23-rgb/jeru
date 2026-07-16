"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/session";
import { sendLodgeEmail } from "@/lib/gmail";

type ActionResult = { error?: string; ok?: string } | undefined;

// Responde um e-mail da caixa da Loja mantendo o encadeamento (Re:)
export async function responderEmail(
  dados: {
    uid: number;
    to: string;
    subject: string;
    messageId: string | null;
    references: string[];
  },
  _prev: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  await requireRole("SECRETARIO", "VENERAVEL_MESTRE");
  const texto = String(formData.get("texto") ?? "").trim();
  if (!texto) return { error: "Escreva a resposta antes de enviar." };
  if (!dados.to) return { error: "Remetente sem endereço de resposta." };

  const subject = dados.subject.toLowerCase().startsWith("re:")
    ? dados.subject
    : `Re: ${dados.subject}`;
  try {
    await sendLodgeEmail({
      to: dados.to,
      subject,
      text: texto,
      inReplyTo: dados.messageId ?? undefined,
      references: dados.messageId
        ? [...dados.references, dados.messageId]
        : dados.references,
    });
  } catch (e) {
    return {
      error: e instanceof Error ? e.message : "Falha ao enviar a resposta.",
    };
  }
  revalidatePath(`/secretaria/emails/${dados.uid}`);
  return { ok: `Resposta enviada para ${dados.to}.` };
}
