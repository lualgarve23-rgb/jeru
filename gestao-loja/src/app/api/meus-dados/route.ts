import JSZip from "jszip";
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { readMedia, isMediaKey } from "@/lib/media";
import { auditar } from "@/lib/audit";

// LGPD (#15) — portabilidade: o titular baixa um ZIP com os próprios dados.
// Só os dados DELE (perfil, familiares, históricos, presenças, mensalidades,
// doações, foto e assinatura); nunca hashes, tokens ou dados de terceiros.
export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return new NextResponse("Não autenticado.", { status: 401 });
  }
  const { id, lodgeId } = session.user;

  const [user, familiares, graus, cargos, presencas, mensalidades, doacoes] =
    await Promise.all([
      prisma.user.findUniqueOrThrow({
        where: { id },
        select: {
          cim: true,
          cpf: true,
          name: true,
          email: true,
          phone: true,
          profession: true,
          birthDate: true,
          address: true,
          rg: true,
          naturalidade: true,
          estadoCivil: true,
          conjuge: true,
          nomePai: true,
          nomeMae: true,
          tipoSanguineo: true,
          degree: true,
          currentRole: true,
          cargoRito: true,
          status: true,
          filiado: true,
          initiationDate: true,
          installationDate: true,
          showEmail: true,
          showPhone: true,
          showAddress: true,
          showBirthDate: true,
          createdAt: true,
          photoUrl: true,
          signatureUrl: true,
        },
      }),
      prisma.familyMember.findMany({
        where: { userId: id },
        select: { name: true, parentesco: true, birthDate: true },
      }),
      prisma.degreeHistory.findMany({
        where: { userId: id },
        select: { degree: true, date: true },
      }),
      prisma.roleHistory.findMany({
        where: { userId: id },
        select: { role: true, cargoRito: true, startDate: true, endDate: true },
      }),
      prisma.attendance.findMany({
        where: { userId: id },
        select: {
          checkedInAt: true,
          viaQrCode: true,
          justificativa: true,
          session: { select: { date: true, type: true } },
        },
      }),
      prisma.invoice.findMany({
        where: { userId: id },
        select: {
          description: true,
          referenceMonth: true,
          referenceYear: true,
          amountCents: true,
          status: true,
          dueDate: true,
          paidAt: true,
          paidMethod: true,
        },
      }),
      prisma.donation.findMany({
        where: { userId: id },
        select: { amountCents: true, type: true, date: true },
      }),
    ]);

  const { photoUrl, signatureUrl, ...perfil } = user;
  const zip = new JSZip();
  const j = (v: unknown) => JSON.stringify(v, null, 2);
  zip.file("perfil.json", j(perfil));
  zip.file("familiares.json", j(familiares));
  zip.file("historico-graus.json", j(graus));
  zip.file("historico-cargos.json", j(cargos));
  zip.file("presencas.json", j(presencas));
  zip.file("mensalidades.json", j(mensalidades));
  zip.file("doacoes.json", j(doacoes));
  zip.file(
    "LEIA-ME.txt",
    [
      "Exportação de dados pessoais (LGPD, art. 18) — NoPrumo Gestão da Loja.",
      `Titular: ${user.name} · gerada em ${new Date().toISOString()}.`,
      "Contém apenas os dados do próprio titular registrados pela loja.",
    ].join("\n")
  );
  for (const [nome, valor] of [
    ["foto", photoUrl],
    ["assinatura", signatureUrl],
  ] as const) {
    if (isMediaKey(valor)) {
      const m = await readMedia(valor);
      if (m) zip.file(`${nome}.${m.mime.split("/")[1]}`, m.bytes);
    } else if (valor?.startsWith("data:")) {
      const base64 = valor.split(",")[1];
      if (base64) zip.file(`${nome}.bin`, Buffer.from(base64, "base64"));
    }
  }

  await auditar({
    lodgeId,
    ator: session.user,
    acao: "lgpd.exportar-meus-dados",
    entidade: "User",
    entidadeId: id,
  });

  const buffer = await zip.generateAsync({ type: "nodebuffer" });
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="meus-dados-noprumo.zip"`,
    },
  });
}
