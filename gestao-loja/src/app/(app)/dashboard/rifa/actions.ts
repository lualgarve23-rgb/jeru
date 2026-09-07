"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { randomBytes } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { requireRole, requireUser } from "@/lib/session";
import { auditar } from "@/lib/audit";
import { notificarEvento } from "@/lib/notificar-evento";
import { deleteMedia, saveRifaFoto, validarFotoRifa, RIFA_MAX_FOTOS } from "@/lib/media";
import {
  brl,
  dataBr,
  podeReservar,
  podeSortear,
  rifaAtiva,
  validarCampanha,
  validarNumeros,
  sortearComSemente,
  universoSorteio,
  type SorteioModo,
  RIFA_GESTORES,
} from "@/lib/rifa";

type ActionResult = { error?: string; ok?: string } | undefined;

const ROTAS = ["/dashboard/rifa", "/dashboard/loja"];
function revalidar() {
  for (const r of ROTAS) revalidatePath(r);
}

// Irmãos que recebem os avisos da Rifa (quadro ativo; licenciados também)
async function quadroDaLoja(lodgeId: string) {
  return prisma.user.findMany({
    where: { lodgeId, status: { in: ["ATIVO", "IRREGULAR", "LICENCIADO"] }, currentRole: { not: "SUPER_ADMIN" } },
    select: { id: true },
  });
}

// Fotos do prêmio enviadas no formulário (campo "fotos", múltiplo)
function lerFotos(formData: FormData, jaExistentes: number): { ok: true; fotos: File[] } | { ok: false; error: string } {
  const fotos = formData.getAll("fotos").filter((f): f is File => f instanceof File && f.size > 0);
  if (jaExistentes + fotos.length > RIFA_MAX_FOTOS) {
    return { ok: false, error: `No máximo ${RIFA_MAX_FOTOS} fotos do prêmio por campanha.` };
  }
  for (const f of fotos) {
    const erro = validarFotoRifa(f);
    if (erro) return { ok: false, error: erro };
  }
  return { ok: true, fotos };
}

async function gravarFotos(lodgeId: string, rifaId: string, fotos: File[]): Promise<string[]> {
  const chaves: string[] = [];
  for (const f of fotos) chaves.push(await saveRifaFoto(lodgeId, rifaId, f));
  return chaves;
}

function lerCampanha(formData: FormData) {
  return validarCampanha({
    titulo: String(formData.get("titulo") ?? ""),
    descricao: String(formData.get("descricao") ?? ""),
    inicio: String(formData.get("inicio") ?? ""),
    fim: String(formData.get("fim") ?? ""),
    sorteio: String(formData.get("sorteio") ?? ""),
    quantidadeNumeros: Number(formData.get("quantidadeNumeros")),
    valorReais: Number(String(formData.get("valor") ?? "").replace(",", ".")),
  });
}

// Habilitar campanha (VM ou Esmoler). Só uma campanha ativa por loja.
export async function criarRifa(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const user = await requireRole(...RIFA_GESTORES);
  const v = lerCampanha(formData);
  if (!v.ok) return { error: v.error };
  const fotosLidas = lerFotos(formData, 0);
  if (!fotosLidas.ok) return { error: fotosLidas.error };
  const existente = await rifaAtiva(user.lodgeId);
  if (existente) return { error: `Já existe a campanha "${existente.titulo}" ativa. Encerre-a antes de abrir outra.` };
  const rifa = await prisma.rifaCampanha.create({
    data: { lodgeId: user.lodgeId, criadoPorId: user.id, ...v.dados },
    select: { id: true, titulo: true, inicio: true, fim: true, sorteioEm: true, valorCents: true },
  });
  if (fotosLidas.fotos.length) {
    const fotos = await gravarFotos(user.lodgeId, rifa.id, fotosLidas.fotos);
    await prisma.rifaCampanha.update({ where: { id: rifa.id }, data: { fotos } });
  }
  await auditar({
    lodgeId: user.lodgeId,
    ator: { id: user.id, name: user.name },
    acao: "rifa.criar",
    entidade: "RifaCampanha",
    entidadeId: rifa.id,
    detalhes: { titulo: rifa.titulo, quantidadeNumeros: v.dados.quantidadeNumeros, valorCents: v.dados.valorCents },
  });
  // Aviso a todo o quadro (cada irmão recebe o seu)
  const quadro = await quadroDaLoja(user.lodgeId);
  for (const u of quadro) {
    await notificarEvento(prisma, {
      lodgeId: user.lodgeId,
      sourceKey: `evento:rifa:${rifa.id}:aberta:${u.id}`,
      userId: u.id,
      type: "FINANCIAL_APPROVAL",
      title: `Rifa de Benemerência: ${rifa.titulo}`,
      description:
        `Números a ${brl(rifa.valorCents)} de ${dataBr(rifa.inicio)} a ${dataBr(rifa.fim)}; ` +
        `sorteio em ${dataBr(rifa.sorteioEm)}. Escolha os seus números na seção Rifa de Benemerência.`,
      link: "/dashboard/rifa",
      dueDate: rifa.fim,
    });
  }
  revalidar();
  return { ok: `Campanha "${rifa.titulo}" habilitada — os irmãos foram avisados.` };
}

// Editar dados da campanha ativa (não reduz números abaixo do maior já reservado)
export async function atualizarRifa(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const user = await requireRole(...RIFA_GESTORES);
  const v = lerCampanha(formData);
  if (!v.ok) return { error: v.error };
  const rifa = await rifaAtiva(user.lodgeId);
  if (!rifa) return { error: "Não há campanha ativa." };
  if (rifa.numeroSorteado != null) return { error: "Campanha já sorteada — não pode ser alterada." };
  const maior = await prisma.rifaNumero.aggregate({
    where: { rifaId: rifa.id },
    _max: { numero: true },
  });
  if (maior._max.numero && v.dados.quantidadeNumeros < maior._max.numero) {
    return { error: `Há números reservados até o ${maior._max.numero}; a quantidade não pode ser menor que isso.` };
  }
  const fotosLidas = lerFotos(formData, rifa.fotos.length);
  if (!fotosLidas.ok) return { error: fotosLidas.error };
  const novas = await gravarFotos(user.lodgeId, rifa.id, fotosLidas.fotos);
  await prisma.rifaCampanha.update({
    where: { id: rifa.id },
    data: { ...v.dados, fotos: [...rifa.fotos, ...novas] },
  });
  await auditar({
    lodgeId: user.lodgeId,
    ator: { id: user.id, name: user.name },
    acao: "rifa.atualizar",
    entidade: "RifaCampanha",
    entidadeId: rifa.id,
    detalhes: { titulo: v.dados.titulo, quantidadeNumeros: v.dados.quantidadeNumeros, valorCents: v.dados.valorCents },
  });
  revalidar();
  return { ok: "Campanha atualizada." };
}

// Remover uma foto do prêmio da campanha ativa
export async function removerFotoRifa(chave: string): Promise<ActionResult> {
  const user = await requireRole(...RIFA_GESTORES);
  const rifa = await rifaAtiva(user.lodgeId);
  if (!rifa) return { error: "Não há campanha ativa." };
  if (!rifa.fotos.includes(chave)) return { error: "Foto não encontrada." };
  await prisma.rifaCampanha.update({
    where: { id: rifa.id },
    data: { fotos: rifa.fotos.filter((f) => f !== chave) },
  });
  await deleteMedia(chave);
  await auditar({
    lodgeId: user.lodgeId,
    ator: { id: user.id, name: user.name },
    acao: "rifa.remover-foto",
    entidade: "RifaCampanha",
    entidadeId: rifa.id,
  });
  revalidar();
  return { ok: "Foto removida." };
}

// Encerrar/cancelar a campanha ativa (some do menu dos irmãos; histórico fica)
export async function encerrarRifa(): Promise<ActionResult> {
  const user = await requireRole(...RIFA_GESTORES);
  const rifa = await rifaAtiva(user.lodgeId);
  if (!rifa) return { error: "Não há campanha ativa." };
  await prisma.rifaCampanha.update({ where: { id: rifa.id }, data: { ativa: false } });
  await auditar({
    lodgeId: user.lodgeId,
    ator: { id: user.id, name: user.name },
    acao: "rifa.encerrar",
    entidade: "RifaCampanha",
    entidadeId: rifa.id,
  });
  revalidar();
  return { ok: `Campanha "${rifa.titulo}" encerrada.` };
}

// Irmão escolhe os próprios números (período de vendas)
export async function reservarNumeros(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const user = await requireUser();
  if (user.role === "SUPER_ADMIN") return { error: "Sem permissão." };
  const pedidos = formData
    .getAll("numeros")
    .flatMap((v) => String(v).split(","))
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isFinite(n));
  return reservarPara(user, user.id, pedidos, false);
}

// VM/Esmoler reserva números em nome de um irmão (venda presencial); pode já dar baixa
export async function reservarNumerosPara(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const user = await requireRole(...RIFA_GESTORES);
  const userId = String(formData.get("userId") ?? "");
  const pedidos = String(formData.get("numeros") ?? "")
    .split(/[,\s;]+/)
    .filter(Boolean)
    .map(Number);
  const pago = formData.get("pago") === "on";
  const irmao = await prisma.user.findFirst({ where: { id: userId, lodgeId: user.lodgeId }, select: { id: true } });
  if (!irmao) return { error: "Irmão não encontrado nesta loja." };
  return reservarPara(user, irmao.id, pedidos, pago);
}

async function reservarPara(
  user: { id: string; name: string; lodgeId: string; role: string },
  donoId: string,
  pedidos: number[],
  pago: boolean
): Promise<ActionResult> {
  const rifa = await rifaAtiva(user.lodgeId);
  if (!rifa) return { error: "Não há campanha ativa." };
  const gestor = (RIFA_GESTORES as readonly string[]).includes(user.role);
  // O gestor pode registrar vendas até o sorteio; o irmão só no período de vendas
  if (!podeReservar(rifa) && !(gestor && podeSortear(rifa))) {
    return { error: "A campanha não está em período de vendas." };
  }
  const ocupados = new Set(
    (await prisma.rifaNumero.findMany({ where: { rifaId: rifa.id }, select: { numero: true } })).map((n) => n.numero)
  );
  const v = validarNumeros(pedidos, rifa.quantidadeNumeros, ocupados);
  if (!v.ok) return { error: v.error };
  try {
    await prisma.rifaNumero.createMany({
      data: v.numeros.map((numero) => ({
        lodgeId: user.lodgeId,
        rifaId: rifa.id,
        numero,
        userId: donoId,
        registradoPorId: user.id,
        pago,
        pagoAt: pago ? new Date() : null,
      })),
    });
  } catch (e) {
    // Corrida: outro irmão pegou o número entre a leitura e a gravação
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return { error: "Um dos números acabou de ser reservado por outro irmão. Atualize a página e escolha outro." };
    }
    throw e;
  }
  await auditar({
    lodgeId: user.lodgeId,
    ator: { id: user.id, name: user.name },
    acao: "rifa.reservar",
    entidade: "RifaCampanha",
    entidadeId: rifa.id,
    detalhes: { userId: donoId, numeros: v.numeros, pago },
  });
  revalidar();
  const total = brl(v.numeros.length * rifa.valorCents);
  return {
    ok:
      donoId === user.id
        ? `Número${v.numeros.length > 1 ? "s" : ""} ${v.numeros.join(", ")} reservado${v.numeros.length > 1 ? "s" : ""} — total ${total}. Pague por Pix pelo QR Code abaixo.`
        : `Números ${v.numeros.join(", ")} registrados (${total}).`,
  };
}

// Baixa de pagamento (VM/Esmoler): marca/desmarca todos os números do irmão
export async function marcarPagamento(numeroId: string, pago: boolean): Promise<ActionResult> {
  const user = await requireRole(...RIFA_GESTORES);
  const n = await prisma.rifaNumero.findFirst({
    where: { id: numeroId, lodgeId: user.lodgeId },
    select: { id: true, numero: true, rifaId: true },
  });
  if (!n) return { error: "Número não encontrado." };
  await prisma.rifaNumero.update({ where: { id: n.id }, data: { pago, pagoAt: pago ? new Date() : null } });
  await auditar({
    lodgeId: user.lodgeId,
    ator: { id: user.id, name: user.name },
    acao: pago ? "rifa.pagar" : "rifa.estornar",
    entidade: "RifaCampanha",
    entidadeId: n.rifaId,
    detalhes: { numero: n.numero },
  });
  revalidar();
  return { ok: pago ? `Número ${n.numero} pago.` : `Pagamento do número ${n.numero} desfeito.` };
}

// Liberar número: o irmão libera o próprio (não pago, em vendas); o gestor, qualquer um
export async function liberarNumero(numeroId: string): Promise<ActionResult> {
  const user = await requireUser();
  const gestor = (RIFA_GESTORES as readonly string[]).includes(user.role);
  const n = await prisma.rifaNumero.findFirst({
    where: { id: numeroId, lodgeId: user.lodgeId },
    select: { id: true, numero: true, userId: true, pago: true, rifa: { select: rifaCampos } },
  });
  if (!n) return { error: "Número não encontrado." };
  if (n.rifa.numeroSorteado != null) return { error: "Campanha já sorteada — os números não podem ser alterados." };
  if (!gestor) {
    if (n.userId !== user.id) return { error: "Este número não é seu." };
    if (n.pago) return { error: "Número já pago — fale com o Esmoler para liberá-lo." };
    if (!podeReservar(n.rifa)) return { error: "A campanha não está em período de vendas." };
  }
  await prisma.rifaNumero.delete({ where: { id: n.id } });
  await auditar({
    lodgeId: user.lodgeId,
    ator: { id: user.id, name: user.name },
    acao: "rifa.liberar",
    entidade: "RifaCampanha",
    entidadeId: n.rifa.id,
    detalhes: { numero: n.numero, userId: n.userId },
  });
  revalidar();
  return { ok: `Número ${n.numero} liberado.` };
}

const rifaCampos = {
  id: true,
  ativa: true,
  inicio: true,
  fim: true,
  sorteioEm: true,
  quantidadeNumeros: true,
  valorCents: true,
  numeroSorteado: true,
} as const;

// Sorteio: VM/Esmoler informa o número sorteado; o sistema aponta o irmão
export async function registrarSorteio(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const user = await requireRole(...RIFA_GESTORES);
  const rifa = await rifaAtiva(user.lodgeId);
  if (!rifa) return { error: "Não há campanha ativa." };
  if (rifa.numeroSorteado != null) return { error: "O sorteio desta campanha já foi registrado." };
  if (!podeSortear(rifa)) {
    return { error: `O sorteio só pode ser registrado depois do fim das vendas (${dataBr(rifa.fim)}).` };
  }
  const numero = Math.trunc(Number(formData.get("numero")));
  if (!Number.isFinite(numero) || numero < 1 || numero > rifa.quantidadeNumeros) {
    return { error: `Informe um número entre 1 e ${rifa.quantidadeNumeros}.` };
  }
  const observacao = String(formData.get("observacao") ?? "").trim().slice(0, 500) || null;
  return concluirSorteio(user, rifa, numero, { modo: "MANUAL", observacao });
}

// Sorteio pelo sistema (VM/Esmoler): semente aleatória de 16 bytes escolhe
// entre os números pagos — ou, se o gestor marcar, entre todos os reservados.
export async function sortearPeloSistema(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const user = await requireRole(...RIFA_GESTORES);
  const rifa = await rifaAtiva(user.lodgeId);
  if (!rifa) return { error: "Não há campanha ativa." };
  if (rifa.numeroSorteado != null) return { error: "O sorteio desta campanha já foi registrado." };
  if (!podeSortear(rifa)) {
    return { error: `O sorteio só pode ser feito depois do fim das vendas (${dataBr(rifa.fim)}).` };
  }
  const incluirNaoPagos = formData.get("incluirNaoPagos") === "on";
  const observacao = String(formData.get("observacao") ?? "").trim().slice(0, 500) || null;
  const numeros = await prisma.rifaNumero.findMany({
    where: { rifaId: rifa.id },
    select: { numero: true, pago: true },
  });
  const universo = universoSorteio(numeros, incluirNaoPagos);
  if (universo.length === 0) {
    return {
      error: incluirNaoPagos
        ? "Nenhum número foi reservado — não há o que sortear."
        : "Nenhum número está pago. Dê baixa nos pagamentos ou marque a opção de incluir os não pagos.",
    };
  }
  const semente = randomBytes(16).toString("hex");
  const numero = sortearComSemente(universo, semente)!;
  return concluirSorteio(user, rifa, numero, {
    modo: incluirNaoPagos ? "SISTEMA_TODOS" : "SISTEMA_PAGOS",
    semente,
    universo: universo.length,
    observacao,
  });
}

// Grava o resultado, audita e avisa o quadro (comum aos dois modos)
async function concluirSorteio(
  user: { id: string; name: string; lodgeId: string },
  rifa: { id: string; titulo: string },
  numero: number,
  meta: { modo: SorteioModo; semente?: string; universo?: number; observacao: string | null }
): Promise<ActionResult> {
  const dono = await prisma.rifaNumero.findUnique({
    where: { rifaId_numero: { rifaId: rifa.id, numero } },
    select: { userId: true, user: { select: { name: true } } },
  });
  const sorteadoAt = new Date();
  await prisma.rifaCampanha.update({
    where: { id: rifa.id },
    data: {
      numeroSorteado: numero,
      ganhadorId: dono?.userId ?? null,
      sorteadoPorId: user.id,
      sorteadoAt,
      observacaoSorteio: meta.observacao,
      sorteioModo: meta.modo,
      sorteioSemente: meta.semente ?? null,
      sorteioUniverso: meta.universo ?? null,
    },
  });
  await auditar({
    lodgeId: user.lodgeId,
    ator: { id: user.id, name: user.name },
    acao: meta.modo === "MANUAL" ? "rifa.sortear" : "rifa.sortear-sistema",
    entidade: "RifaCampanha",
    entidadeId: rifa.id,
    detalhes: {
      numero,
      ganhadorId: dono?.userId ?? null,
      modo: meta.modo,
      semente: meta.semente ?? null,
      universo: meta.universo ?? null,
      sorteadoAt: sorteadoAt.toISOString(),
    },
  });
  // Avisos: ganhador e todo o quadro
  const quadro = await quadroDaLoja(user.lodgeId);
  for (const u of quadro) {
    const ganhou = dono?.userId === u.id;
    await notificarEvento(prisma, {
      lodgeId: user.lodgeId,
      sourceKey: `evento:rifa:${rifa.id}:sorteio:${u.id}`,
      userId: u.id,
      type: "FINANCIAL_APPROVAL",
      title: ganhou ? `Parabéns! Você ganhou a ${rifa.titulo}` : `Resultado da ${rifa.titulo}`,
      description: dono
        ? `Número sorteado: ${numero}${ganhou ? " — o seu!" : ` — do irmão ${dono.user.name}.`}`
        : `Número sorteado: ${numero} — não havia sido vendido.`,
      link: "/dashboard/rifa",
    });
  }
  revalidar();
  return {
    ok: dono
      ? `Número ${numero} sorteado — ganhador: ${dono.user.name}.`
      : `Número ${numero} sorteado — não foi vendido a nenhum irmão.`,
  };
}
