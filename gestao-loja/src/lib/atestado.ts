import { prisma } from "@/lib/prisma";
import { gerarAtaPdf } from "@/lib/ata-pdf";
import { resolveParaDataUri } from "@/lib/media";

// Atestado de Regularidade: declaração de que o irmão é membro efetivo e está
// regular com seus deveres, assinada pelo Venerável Mestre e pelo Secretário.
// Texto conforme o modelo oficial da pasta formularios/. O PDF é montado sob
// demanda com o mesmo visual das atas (cabeçalho institucional + assinaturas).

export function textoAtestado(dados: {
  nome: string;
  cim: string;
  oriente?: string | null;
}) {
  const data = new Date().toLocaleDateString("pt-BR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  return (
    `Declaramos para os devidos fins, a quem possa interessar, que o ` +
    `Ir∴ ${dados.nome}, CIM ${dados.cim}, é membro efetivo desta Augusta ` +
    `Oficina e encontra-se Regular com o recolhimento de metais e demais ` +
    `deveres maçônicos até a presente data, nada existindo em nossos ` +
    `registros que o desabone.\n\n` +
    `Por ser expressão da verdade, firmamos a presente.\n\n` +
    `Oriente de ${dados.oriente ?? "____"}, ${data} da E∴V∴`
  );
}

export async function gerarAtestadoPdf(atestadoId: string, lodgeId: string) {
  const atestado = await prisma.atestadoRegularidade.findUniqueOrThrow({
    where: { id: atestadoId, lodgeId },
    include: {
      lodge: true,
      user: { select: { name: true, cim: true } },
      signedByMaster: { select: { name: true, signatureUrl: true } },
      signedBySec: { select: { name: true, signatureUrl: true } },
    },
  });
  const [assinaturaMaster, assinaturaSec] = await Promise.all([
    resolveParaDataUri(atestado.signedByMaster?.signatureUrl),
    resolveParaDataUri(atestado.signedBySec?.signatureUrl),
  ]);
  const pdf = await gerarAtaPdf({
    lodgeName: atestado.lodge.name,
    lodgeNumber: atestado.lodge.number,
    number: 0,
    titulo: "ATESTADO DE REGULARIDADE",
    content: textoAtestado({
      nome: atestado.user.name,
      cim: atestado.user.cim,
      oriente: atestado.lodge.oriente,
    }),
    logoUrl: atestado.lodge.logoUrl,
    cabecalho: atestado.lodge.ataCabecalho,
    address: atestado.lodge.address,
    divisa: atestado.lodge.ataDivisa,
    signers: [
      atestado.signedByMaster && {
        name: atestado.signedByMaster.name,
        cargo: "Venerável Mestre",
        signedAt: atestado.signedByMasterAt,
        signatureUrl: assinaturaMaster,
      },
      atestado.signedBySec && {
        name: atestado.signedBySec.name,
        cargo: "Secretário",
        signedAt: atestado.signedBySecAt,
        signatureUrl: assinaturaSec,
      },
    ].filter((s) => s !== null),
  });
  return { atestado, pdf };
}
