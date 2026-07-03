"use server";

import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";

type ActionResult = { error?: string; ok?: string } | undefined;

// Lê um arquivo de imagem do form e devolve data URI (limite 500 KB)
async function readLogo(formData: FormData): Promise<string | null | { error: string }> {
  const file = formData.get("logo") as File | null;
  if (!file || file.size === 0) return null;
  if (!file.type.startsWith("image/")) {
    return { error: "O logo deve ser uma imagem (PNG, JPG, SVG...)." };
  }
  if (file.size > 500_000) {
    return { error: "Logo muito grande — use uma imagem de até 500 KB." };
  }
  const buf = Buffer.from(await file.arrayBuffer());
  return `data:${file.type};base64,${buf.toString("base64")}`;
}

// Cria uma nova Loja (tenant) com seu Venerável Mestre inicial.
// Senha inicial do VM = dígitos do CPF (trocável em /dashboard/senha).
export async function createLodge(
  _prev: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  await requireRole("SUPER_ADMIN");

  const name = String(formData.get("name") ?? "").trim();
  const number = String(formData.get("number") ?? "").trim();
  const potencia = String(formData.get("potencia") ?? "").trim() || null;
  const oriente = String(formData.get("oriente") ?? "").trim() || null;

  const vmName = String(formData.get("vmName") ?? "").trim();
  const vmCim = String(formData.get("vmCim") ?? "").trim();
  const vmCpf = String(formData.get("vmCpf") ?? "").replace(/\D/g, "");
  const vmEmail = String(formData.get("vmEmail") ?? "").trim();

  if (!name || !number || !vmName || !vmCim || !vmEmail || vmCpf.length !== 11) {
    return { error: "Preencha todos os campos (CPF com 11 dígitos)." };
  }

  const logo = await readLogo(formData);
  if (logo && typeof logo === "object") return logo;

  const [lodgeExists, userExists] = await Promise.all([
    prisma.lodge.findUnique({ where: { number } }),
    prisma.user.findFirst({
      where: { OR: [{ cim: vmCim }, { cpf: vmCpf }, { email: vmEmail }] },
    }),
  ]);
  if (lodgeExists) return { error: `Já existe loja com o número ${number}.` };
  if (userExists) return { error: "Já existe usuário com esse CIM, CPF ou e-mail." };

  await prisma.lodge.create({
    data: {
      name,
      number,
      potencia,
      oriente,
      logoUrl: logo,
      users: {
        create: {
          cim: vmCim,
          cpf: vmCpf,
          name: vmName,
          email: vmEmail,
          passwordHash: await bcrypt.hash(vmCpf, 10),
          degree: "MESTRE",
          currentRole: "VENERAVEL_MESTRE",
        },
      },
    },
  });

  revalidatePath("/admin");
  return {
    ok: `Loja "${name}" criada. VM ${vmName} acessa com CIM ${vmCim} e senha inicial igual ao CPF (somente dígitos).`,
  };
}

// Logo da própria loja — VM ou Secretário
export async function updateLodgeLogo(
  _prev: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  const user = await requireRole("VENERAVEL_MESTRE", "SECRETARIO");
  const logo = await readLogo(formData);
  if (!logo) return { error: "Selecione uma imagem." };
  if (typeof logo === "object") return logo;

  await prisma.lodge.update({
    where: { id: user.lodgeId },
    data: { logoUrl: logo },
  });
  revalidatePath("/", "layout");
  return { ok: "Logo da loja atualizado." };
}
