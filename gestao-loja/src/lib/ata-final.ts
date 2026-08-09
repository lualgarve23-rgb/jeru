import { prisma } from "@/lib/prisma";
import { gerarAtaPdf } from "@/lib/ata-pdf";
import { resolveParaDataUri } from "@/lib/media";

// Monta o PDF final da ata com as assinaturas registradas
export async function gerarPdfAtaAssinada(ataId: string, lodgeId: string) {
  const ata = await prisma.ata.findUniqueOrThrow({
    where: { id: ataId, lodgeId },
    include: { lodge: true },
  });
  const [master, sec] = await Promise.all([
    ata.signedByMasterId
      ? prisma.user.findUnique({
          where: { id: ata.signedByMasterId },
          select: { name: true, signatureUrl: true },
        })
      : null,
    ata.signedBySecId
      ? prisma.user.findUnique({
          where: { id: ata.signedBySecId },
          select: { name: true, signatureUrl: true },
        })
      : null,
  ]);
  // ata-pdf embute a assinatura como data URI — resolve chaves de media
  const [assinaturaMaster, assinaturaSec] = await Promise.all([
    resolveParaDataUri(master?.signatureUrl),
    resolveParaDataUri(sec?.signatureUrl),
  ]);
  const pdf = await gerarAtaPdf({
    lodgeName: ata.lodge.name,
    lodgeNumber: ata.lodge.number,
    number: ata.number,
    content: ata.content,
    logoUrl: ata.lodge.logoUrl,
    cabecalho: ata.lodge.ataCabecalho,
    address: ata.lodge.address,
    divisa: ata.lodge.ataDivisa,
    signers: [
      master && {
        name: master.name,
        cargo: "Venerável Mestre",
        signedAt: ata.signedByMasterAt,
        signatureUrl: assinaturaMaster,
      },
      sec && {
        name: sec.name,
        cargo: "Secretário",
        signedAt: ata.signedBySecAt,
        signatureUrl: assinaturaSec,
      },
    ].filter((s) => s !== null),
  });
  return { ata, pdf };
}
