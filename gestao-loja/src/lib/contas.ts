import { prisma } from "@/lib/prisma";

// #16 — filiação multi-loja: o mesmo CIM pode ter conta em mais de uma loja.
// Resolve o CIM digitado para TODAS as contas ativas (com fallback para os
// zeros à esquerda dos CIMs do GOB, que o irmão costuma não digitar).
// Usado pelo login (auth.ts, com escolha de loja) e pelo esqueci-senha.
export async function contasPorCim(cimDigitado: string) {
  const cim = cimDigitado.trim();
  if (!cim) return [];
  const include = { lodge: { select: { id: true, name: true } } } as const;

  let contas = await prisma.user.findMany({ where: { cim }, include });
  if (!contas.length && /^\d+$/.test(cim)) {
    const semZeros = cim.replace(/^0+/, "");
    if (semZeros) {
      const candidatos = await prisma.user.findMany({
        where: { cim: { endsWith: semZeros } },
        include,
      });
      contas = candidatos.filter(
        (u) => u.cim.replace(/^0+/, "") === semZeros
      );
    }
  }
  return contas.filter((u) => u.status !== "EX_MEMBRO");
}
