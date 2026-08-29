// Reconhecimento de longa duração para os links de convite (RSVP/ausência).
// A sessão de login expira em 8h (auth.config.ts) — quando o convite chega
// dias depois, o irmão caía no formulário de visitante. Este cookie assinado
// (HMAC, 1 ano) identifica o irmão APENAS para ações de baixo risco do
// convite; ele NÃO dá acesso ao app (o login continua exigido normalmente).
// É gravado no login por senha e renovado a cada RSVP identificado.

import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";

const COOKIE = "np_reconhecimento";
const DIAS = 365;

function segredo() {
  const s = process.env.AUTH_SECRET;
  if (!s) throw new Error("AUTH_SECRET ausente para o cookie de reconhecimento.");
  return s;
}

function assinar(payload: string) {
  return createHmac("sha256", segredo()).update(payload).digest("base64url");
}

export async function gravarReconhecimento(userId: string, lodgeId: string) {
  const exp = Date.now() + DIAS * 86_400_000;
  const payload = `${userId}.${lodgeId}.${exp}`;
  (await cookies()).set(COOKIE, `${payload}.${assinar(payload)}`, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: DIAS * 86_400,
    path: "/convite", // só as páginas de convite enxergam o cookie
  });
}

export async function limparReconhecimento() {
  (await cookies()).delete({ name: COOKIE, path: "/convite" });
}

export function verificarReconhecimento(
  valor: string | undefined
): { userId: string; lodgeId: string } | null {
  if (!valor) return null;
  const partes = valor.split(".");
  if (partes.length !== 4) return null;
  const [userId, lodgeId, expStr, mac] = partes;
  const payload = `${userId}.${lodgeId}.${expStr}`;
  const esperado = Buffer.from(assinar(payload));
  const recebido = Buffer.from(mac);
  if (
    esperado.length !== recebido.length ||
    !timingSafeEqual(esperado, recebido)
  ) {
    return null;
  }
  const exp = Number(expStr);
  if (!Number.isFinite(exp) || exp < Date.now()) return null;
  return { userId, lodgeId };
}

// Devolve o irmão reconhecido PARA A LOJA do convite (ou null). Reconfere no
// banco que ele segue no quadro — cookie antigo de ex-membro não vale.
export async function usuarioReconhecido(lodgeId: string) {
  const jar = await cookies();
  const rec = verificarReconhecimento(jar.get(COOKIE)?.value);
  if (!rec || rec.lodgeId !== lodgeId) return null;
  return prisma.user.findFirst({
    where: {
      id: rec.userId,
      lodgeId,
      status: { in: ["ATIVO", "IRREGULAR", "LICENCIADO"] },
    },
    select: { id: true, name: true, lodgeId: true },
  });
}
