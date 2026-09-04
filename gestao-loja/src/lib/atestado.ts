import { prisma } from "@/lib/prisma";
import { gerarAtaPdf } from "@/lib/ata-pdf";
import { resolveParaDataUri } from "@/lib/media";
import { brlCents, contextoFinanceiroDoIrmao, type ContextoFinanceiro } from "@/lib/contexto-financeiro";

// Atestado de Regularidade: declaração de que o irmão é membro efetivo e está
// regular com seus deveres, assinada pelo Venerável Mestre, pelo Tesoureiro e
// pelo Secretário.
// Texto conforme o modelo oficial da pasta formularios/. O PDF é montado sob
// demanda com o mesmo visual das atas (cabeçalho institucional + assinaturas).

// Ordem de governança das assinaturas: Tesoureiro → Secretário → Venerável
// Mestre. Vale para os dois fluxos gov.br (OAuth e portal ITI).
export type AtestadoAssinaturas = {
  signedByTesAt: Date | null;
  signedBySecAt: Date | null;
  signedByMasterAt: Date | null;
};

export function ordemAssinaturaAtestado(role: string, a: AtestadoAssinaturas) {
  if (role === "TESOUREIRO") {
    return {
      jaAssinou: !!a.signedByTesAt,
      aguardando: null as string | null,
      ultimaAssinatura: !!a.signedBySecAt && !!a.signedByMasterAt,
    };
  }
  if (role === "SECRETARIO") {
    return {
      jaAssinou: !!a.signedBySecAt,
      aguardando: a.signedByTesAt ? null : "Tesoureiro",
      ultimaAssinatura: !!a.signedByTesAt && !!a.signedByMasterAt,
    };
  }
  return {
    jaAssinou: !!a.signedByMasterAt,
    aguardando: !a.signedByTesAt
      ? "Tesoureiro"
      : !a.signedBySecAt
        ? "Secretário"
        : null,
    ultimaAssinatura: !!a.signedByTesAt && !!a.signedBySecAt,
  };
}

// Próximo cargo da cadeia ainda sem assinatura (null = todos assinaram)
export function proximoCargoAtestado(
  a: AtestadoAssinaturas
): "TESOUREIRO" | "SECRETARIO" | "VENERAVEL_MESTRE" | null {
  if (!a.signedByTesAt) return "TESOUREIRO";
  if (!a.signedBySecAt) return "SECRETARIO";
  if (!a.signedByMasterAt) return "VENERAVEL_MESTRE";
  return null;
}

// Item 7: a cadeia só anda se alguém ATIVO ocupa o próximo cargo (todos os
// três são níveis de acesso — User.currentRole). Mensagem de bloqueio ou null.
export async function bloqueioCargoAusenteAtestado(
  lodgeId: string,
  a: AtestadoAssinaturas
): Promise<string | null> {
  const proximo = proximoCargoAtestado(a);
  if (!proximo) return null;
  const ocupado = await prisma.user.count({
    where: { lodgeId, status: "ATIVO", currentRole: proximo },
  });
  return ocupado > 0
    ? null
    : `Nenhum irmão ativo ocupa o cargo de ${cargoAssinanteAtestado(proximo)} — cadastre em Cargos para a cadeia de assinaturas continuar.`;
}

// Trava financeira do atestado ("regular com o recolhimento de metais"):
// QUALQUER capitação vencida bloqueia as assinaturas, a menos que o
// Tesoureiro tenha registrado um override justificado. Puro — recebe o
// contexto já lido (contextoFinanceiroDoIrmao) e o atestado.
export function bloqueioFinanceiroAtestado(
  ctx: Pick<ContextoFinanceiro, "emAberto" | "totalVencidoCents">,
  atestado: { overrideAt: Date | null }
): string | null {
  if (atestado.overrideAt) return null;
  const vencidas = ctx.emAberto.filter((i) => i.vencida);
  if (vencidas.length === 0) return null;
  const n = vencidas.length;
  return `Há ${n} capitaç${n === 1 ? "ão vencida" : "ões vencidas"} (${brlCents(ctx.totalVencidoCents)}); regularize ou registre um override.`;
}

// Idem, lendo o contexto do banco (para actions e rotas)
export async function bloqueioFinanceiroAtestadoDoIrmao(
  lodgeId: string,
  userId: string,
  atestado: { overrideAt: Date | null }
): Promise<string | null> {
  if (atestado.overrideAt) return null;
  const ctx = await contextoFinanceiroDoIrmao(lodgeId, userId);
  return bloqueioFinanceiroAtestado(ctx, atestado);
}

export function camposAssinaturaAtestado(role: string, userId: string) {
  const agora = new Date();
  if (role === "TESOUREIRO") {
    return { signedByTesId: userId, signedByTesAt: agora };
  }
  if (role === "SECRETARIO") {
    return { signedBySecId: userId, signedBySecAt: agora };
  }
  return { signedByMasterId: userId, signedByMasterAt: agora };
}

export function cargoAssinanteAtestado(role: string) {
  return role === "TESOUREIRO"
    ? "Tesoureiro"
    : role === "SECRETARIO"
      ? "Secretário"
      : "Venerável Mestre";
}

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
      signedByTes: { select: { name: true, signatureUrl: true } },
      signedBySec: { select: { name: true, signatureUrl: true } },
    },
  });
  const [assinaturaMaster, assinaturaTes, assinaturaSec] = await Promise.all([
    resolveParaDataUri(atestado.signedByMaster?.signatureUrl),
    resolveParaDataUri(atestado.signedByTes?.signatureUrl),
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
    // Os três campos aparecem sempre no template, na ordem Venerável Mestre →
    // Tesoureiro → Secretário, para a assinatura enquadrar no campo do cargo.
    signers: [
      {
        name: atestado.signedByMaster?.name ?? "",
        cargo: "Venerável Mestre",
        signedAt: atestado.signedByMasterAt,
        signatureUrl: assinaturaMaster,
      },
      {
        name: atestado.signedByTes?.name ?? "",
        cargo: "Tesoureiro",
        signedAt: atestado.signedByTesAt,
        signatureUrl: assinaturaTes,
      },
      {
        name: atestado.signedBySec?.name ?? "",
        cargo: "Secretário",
        signedAt: atestado.signedBySecAt,
        signatureUrl: assinaturaSec,
      },
    ],
  });
  return { atestado, pdf };
}
