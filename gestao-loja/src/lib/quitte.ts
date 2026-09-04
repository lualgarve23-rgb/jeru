import { prisma } from "@/lib/prisma";
import { arquivarVersaoFinalNoDrive, slugNome } from "@/lib/google-drive";
import { cargosProcesso } from "@/lib/processos";
import { cargoCorresponde } from "@/lib/cargos";
import { capitacaoVencida } from "@/lib/datas-sp";
// Quitte Placet — regras de assinatura gov.br.
// Ordem de governança: Secretário assina primeiro, o Orador em seguida e o
// Venerável Mestre por último (padrão de todos os documentos oficiais: o VM
// sela o documento). O Orador é cargo do rito (User.cargoRito), resolvido
// como nos Processos — pode ter qualquer nível de acesso.

export const CADEIA_QUITTE = ["SECRETARIO", "ORADOR", "VENERAVEL_MESTRE"] as const;
export type CargoQuitte = (typeof CADEIA_QUITTE)[number];

const LABEL_QUITTE: Record<CargoQuitte, string> = {
  SECRETARIO: "Secretário",
  ORADOR: "Orador",
  VENERAVEL_MESTRE: "Venerável Mestre",
};

export type QuitteAssinaturas = {
  signedBySecAt: Date | null;
  signedByOradorAt: Date | null;
  signedByMasterAt: Date | null;
};

function assinouEm(p: QuitteAssinaturas, cargo: CargoQuitte) {
  return cargo === "SECRETARIO"
    ? p.signedBySecAt
    : cargo === "ORADOR"
      ? p.signedByOradorAt
      : p.signedByMasterAt;
}

// Cargo com que o usuário assina o Quitte Placet (o nível de acesso vale
// antes do cargo do rito), ou null quando ele não está na cadeia.
export function cargoQuitteDoUsuario(
  role: string,
  cargoRito?: string | null,
  p?: QuitteAssinaturas
): CargoQuitte | null {
  return cargoQuitteDosCargos(cargosProcesso(role, cargoRito), p);
}

// Idem, a partir da lista já resolvida por cargosProcesso(). Quando o usuário
// acumula dois cargos da cadeia (ex.: Secretário que também é Orador), vale o
// cargo da vez ainda não assinado — sem isso ele assinaria uma vez e a cadeia
// travaria no seu segundo cargo.
export function cargoQuitteDosCargos(
  cargos: string[],
  p?: QuitteAssinaturas
): CargoQuitte | null {
  const meus = CADEIA_QUITTE.filter((c) => cargos.includes(c));
  if (meus.length === 0) return null;
  if (p) {
    const pendente = meus.find((c) => !assinouEm(p, c));
    if (pendente) return pendente;
  }
  return meus[0];
}

// Item 7: a cadeia só anda se alguém ATIVO ocupa o próximo cargo. Secretário
// e VM são níveis de acesso (User.currentRole); o Orador é cargo do rito.
// Devolve a mensagem de bloqueio ou null.
export async function bloqueioCargoAusenteQuitte(
  lodgeId: string,
  p: QuitteAssinaturas
): Promise<string | null> {
  const proximo = proximoCargoQuitte(p);
  if (!proximo) return null;
  const ocupado =
    proximo === "ORADOR"
      ? (
          await prisma.user.findMany({
            where: { lodgeId, status: "ATIVO", cargoRito: { not: null } },
            select: { cargoRito: true },
          })
        ).some((u) => cargoCorresponde(u.cargoRito, "Orador"))
      : (await prisma.user.count({
          where: { lodgeId, status: "ATIVO", currentRole: proximo },
        })) > 0;
  return ocupado
    ? null
    : `Nenhum irmão ativo ocupa o cargo de ${LABEL_QUITTE[proximo]} — cadastre em Cargos para a cadeia de assinaturas continuar.`;
}

export function ordemAssinaturaQuitte(cargo: CargoQuitte, p: QuitteAssinaturas) {
  const pos = CADEIA_QUITTE.indexOf(cargo);
  const anteriorPendente = CADEIA_QUITTE.slice(0, pos).find((c) => !assinouEm(p, c));
  const outrosAssinaram = CADEIA_QUITTE.filter((c) => c !== cargo).every((c) =>
    assinouEm(p, c)
  );
  return {
    jaAssinou: !!assinouEm(p, cargo),
    aguardando: anteriorPendente ? LABEL_QUITTE[anteriorPendente] : (null as string | null),
    ultimaAssinatura: outrosAssinaram,
  };
}

// Próximo cargo da cadeia ainda sem assinatura (null = todos assinaram)
export function proximoCargoQuitte(p: QuitteAssinaturas): CargoQuitte | null {
  return CADEIA_QUITTE.find((c) => !assinouEm(p, c)) ?? null;
}

export function assinaturasQuitte(p: QuitteAssinaturas) {
  return CADEIA_QUITTE.filter((c) => assinouEm(p, c)).length;
}

export function camposAssinaturaQuitte(cargo: CargoQuitte, userId: string) {
  const agora = new Date();
  return cargo === "SECRETARIO"
    ? { signedBySecId: userId, signedBySecAt: agora }
    : cargo === "ORADOR"
      ? { signedByOradorId: userId, signedByOradorAt: agora }
      : { signedByMasterId: userId, signedByMasterAt: agora };
}

export function cargoAssinanteQuitte(cargo: CargoQuitte) {
  return LABEL_QUITTE[cargo];
}

// Pré-condições comuns às assinaturas (OAuth gov.br e upload do portal ITI).
// Retorna a mensagem de bloqueio, ou null quando o placet pode ser assinado.
export function bloqueioAssinaturaQuitte(p: {
  status: string;
  quitacaoFinanceira: boolean;
  // Nada Consta confirmado pelo Tesoureiro/VM (equivale a override): levanta
  // a trava financeira mesmo com capitações em aberto
  quitacaoConfirmadaAt?: Date | null;
  cartaNome: string | null;
  dataSessaoComunicacao: Date | null;
  ataNome: string | null;
  formularioNome: string | null;
  formularioMime: string | null;
  govbrPdf: Uint8Array | Buffer | null;
}): string | null {
  if (p.status === "APROVADO" || p.status === "NEGADO") {
    return "Quitte Placet já encerrado.";
  }
  if (!p.cartaNome) {
    return "Falta a carta de próprio punho do irmão — as assinaturas ficam bloqueadas até ela ser anexada ao pedido.";
  }
  if (!p.quitacaoFinanceira && !p.quitacaoConfirmadaAt) {
    return "Trava financeira: há capitações vencidas e a Tesouraria ainda não confirmou o Nada Consta.";
  }
  if (!p.dataSessaoComunicacao || !p.ataNome) {
    return "Registre a data da sessão em que o pedido foi comunicado à Loja e anexe a ata dessa sessão antes das assinaturas.";
  }
  if (!p.formularioNome) {
    return "Anexe o Form. 122 preenchido (em PDF) antes das assinaturas gov.br.";
  }
  if (!p.govbrPdf && p.formularioMime !== "application/pdf") {
    return "O Form. 122 anexado precisa estar em PDF para receber as assinaturas gov.br — substitua o anexo.";
  }
  return null;
}

// Nada Consta: só capitação VENCIDA (dia encerrado em São Paulo) bloqueia —
// uma PENDENTE dentro do prazo não é pendência. PAGA/CANCELADA não contam.
export function temPendenciaFinanceira(
  invoices: { status: string; dueDate: Date }[],
  hoje: Date = new Date()
): boolean {
  return invoices.some(
    (i) =>
      i.status === "VENCIDA" ||
      (i.status === "PENDENTE" && capitacaoVencida(i.dueDate, hoje))
  );
}

// Reconsulta as capitações do irmão e atualiza quitacaoFinanceira dos seus
// Quitte Placets em andamento. Chamada na abertura do pedido, no botão
// "Reconsultar Tesouraria" e automaticamente a cada baixa de capitação
// (settle-invoice). Um Nada Consta confirmado pelo Tesoureiro não é
// desfeito aqui. Devolve o resultado da consulta.
export async function recalcularQuitacaoQuitte(
  lodgeId: string,
  userId: string,
  hoje: Date = new Date()
): Promise<{ quitacao: boolean; vencidas: number }> {
  const abertas = await prisma.invoice.findMany({
    where: { lodgeId, userId, status: { in: ["PENDENTE", "VENCIDA"] } },
    select: { status: true, dueDate: true },
  });
  const vencidas = abertas.filter((i) => temPendenciaFinanceira([i], hoje)).length;
  const quitacao = vencidas === 0;
  await prisma.quittePlacet.updateMany({
    where: {
      lodgeId,
      userId,
      status: { in: ["PENDENTE", "EM_ANALISE"] },
      quitacaoConfirmadaAt: null,
    },
    data: { quitacaoFinanceira: quitacao, quitacaoConsultadaAt: hoje },
  });
  return { quitacao, vencidas };
}

// Versão final do Quitte Placet (assinado pelos três cargos) no Drive da Loja.
export async function arquivarQuitteNoDrive(
  lodgeId: string,
  uploadedById: string,
  placetId: string,
  nomeMembro: string,
  pdf: Buffer
): Promise<string> {
  const r = await arquivarVersaoFinalNoDrive({
    lodgeId,
    uploadedById,
    fileName: `quitte-placet-${slugNome(nomeMembro)}-${placetId.slice(-6)}-assinado-govbr.pdf`,
    title: `Quitte Placet — ${nomeMembro} (assinado gov.br)`,
    pdf,
  });
  if (r.driveFileId) {
    await prisma.quittePlacet.update({
      where: { id: placetId, lodgeId },
      data: { driveFileId: r.driveFileId },
    });
  }
  return r.aviso;
}
