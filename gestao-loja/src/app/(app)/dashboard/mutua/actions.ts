"use server";

import { revalidatePath } from "next/cache";
import { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireUser, requireRole } from "@/lib/session";
import { validarAnexo } from "@/app/(app)/secretaria/_actions/_shared";

type ActionResult = { error?: string; ok?: string } | undefined;

// Cargos avisados quando um irmão entrega a Declaração de Beneficiários
const AVISADOS: Role[] = [
  "SECRETARIO",
  "VENERAVEL_MESTRE",
  "TESOUREIRO",
  "ESMOLER",
];

// Envio (ou reenvio) do Form. 108 preenchido — uma entrega vigente por membro
export async function enviarMutua(
  _prev: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  const user = await requireUser();
  const dbUser = await prisma.user.findUniqueOrThrow({
    where: { id: user.id },
    select: { filiado: true },
  });
  if (dbUser.filiado) {
    return {
      error:
        "Obreiros filiados entregam a Declaração de Beneficiários na loja-mãe.",
    };
  }

  const v = validarAnexo(formData.get("arquivo") as File | null);
  if ("error" in v) return { error: v.error };

  const arquivo = Buffer.from(await v.file.arrayBuffer());
  await prisma.mutuaEntrega.upsert({
    where: { userId: user.id },
    create: {
      lodgeId: user.lodgeId,
      userId: user.id,
      nome: v.file.name.slice(0, 200),
      mimeType: v.file.type,
      sizeBytes: v.file.size,
      arquivo,
    },
    update: {
      nome: v.file.name.slice(0, 200),
      mimeType: v.file.type,
      sizeBytes: v.file.size,
      arquivo,
      entregueAntes: false,
      marcadaPor: null,
      enviadaAt: new Date(),
    },
  });

  // Avisa Secretário, VM, Tesoureiro e Esmoler (sourceKey nula: o aviso é um
  // evento e não deve ser varrido pelo sync de pendências da loja)
  const responsaveis = await prisma.user.findMany({
    where: {
      lodgeId: user.lodgeId,
      currentRole: { in: AVISADOS },
      id: { not: user.id },
    },
    select: { id: true },
  });
  if (responsaveis.length > 0) {
    await prisma.notification.createMany({
      data: responsaveis.map((r) => ({
        lodgeId: user.lodgeId,
        userId: r.id,
        title: "Entrega da Mútua (Form. 108)",
        description: `${user.name} (CIM ${user.cim}) entregou a Declaração de Beneficiários da Mútua.`,
        type: "MISSING_DATA" as const,
        link: "/dashboard/mutua",
      })),
    });
  }

  revalidatePath("/dashboard/mutua");
  return { ok: "Declaração enviada à Secretaria." };
}

// ───────── Entrega anterior à implantação do sistema (Secretário/VM) ─────────

// Marca que o irmão já entregou a Declaração em papel, antes do sistema.
// Registro sem anexo — não sobrescreve uma entrega que já tenha arquivo.
export async function marcarEntregaAnterior(
  membroId: string
): Promise<ActionResult> {
  const user = await requireRole("SECRETARIO", "VENERAVEL_MESTRE");
  const membro = await prisma.user.findUnique({
    where: { id: membroId, lodgeId: user.lodgeId },
    select: { filiado: true, mutuaEntrega: { select: { id: true } } },
  });
  if (!membro) return { error: "Irmão não encontrado." };
  if (membro.filiado) {
    return { error: "Filiados entregam a Declaração na loja-mãe." };
  }
  if (membro.mutuaEntrega) return { error: "Este irmão já consta como entregue." };

  await prisma.mutuaEntrega.create({
    data: {
      lodgeId: user.lodgeId,
      userId: membroId,
      entregueAntes: true,
      marcadaPor: user.name,
    },
  });
  revalidatePath("/dashboard/mutua");
  return { ok: "Entrega anterior registrada." };
}

// Desfaz a marcação (só registros sem anexo — entregas com arquivo ficam)
export async function desmarcarEntregaAnterior(
  entregaId: string
): Promise<ActionResult> {
  const user = await requireRole("SECRETARIO", "VENERAVEL_MESTRE");
  const entrega = await prisma.mutuaEntrega.findUnique({
    where: { id: entregaId, lodgeId: user.lodgeId },
    select: { entregueAntes: true, arquivo: true },
  });
  if (!entrega) return { error: "Registro não encontrado." };
  if (!entrega.entregueAntes || entrega.arquivo) {
    return { error: "Só é possível desfazer registros de entrega anterior sem anexo." };
  }
  await prisma.mutuaEntrega.delete({ where: { id: entregaId } });
  revalidatePath("/dashboard/mutua");
  return { ok: "Marcação desfeita." };
}
