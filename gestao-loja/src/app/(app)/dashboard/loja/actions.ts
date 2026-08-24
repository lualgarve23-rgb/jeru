"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { auditar } from "@/lib/audit";

type ActionResult = { error?: string; ok?: string } | undefined;

export async function disconnectGoogle(): Promise<ActionResult> {
  const user = await requireRole("VENERAVEL_MESTRE", "SECRETARIO");
  await prisma.lodge.update({
    where: { id: user.lodgeId },
    data: { googleRefreshToken: null, googleEmail: null },
  });
  await auditar({
    lodgeId: user.lodgeId,
    ator: user,
    acao: "loja.desconectar-google",
    entidade: "Lodge",
    entidadeId: user.lodgeId,
  });
  revalidatePath("/dashboard/loja");
  return { ok: "Conta Google desconectada." };
}

// Chave Pix da Bolsa de Benemerência (doações) — só o Venerável Mestre
export async function updatePixBenemerencia(
  _prev: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  const user = await requireRole("VENERAVEL_MESTRE");
  const chave = String(formData.get("pixKeyBenemerencia") ?? "").trim();
  if (chave.length > 140) {
    return { error: "Chave Pix longa demais — confira o valor." };
  }
  await prisma.lodge.update({
    where: { id: user.lodgeId },
    data: { pixKeyBenemerencia: chave || null },
  });
  await auditar({
    lodgeId: user.lodgeId,
    ator: user,
    acao: "loja.pix-benemerencia",
    entidade: "Lodge",
    entidadeId: user.lodgeId,
  });
  revalidatePath("/dashboard/loja");
  revalidatePath("/dashboard/benemerencia");
  return { ok: chave ? "Chave Pix da Benemerência salva." : "Chave Pix da Benemerência removida." };
}

// Cabeçalho institucional e divisa exibidos no PDF das atas
export async function updateAtaCabecalho(
  _prev: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  const user = await requireRole("VENERAVEL_MESTRE", "SECRETARIO");
  const cabecalho = String(formData.get("cabecalho") ?? "").trim();
  const divisa = String(formData.get("divisa") ?? "").trim();
  if (cabecalho.length > 600 || divisa.length > 200) {
    return { error: "Texto longo demais — reduza o cabeçalho ou a divisa." };
  }
  await prisma.lodge.update({
    where: { id: user.lodgeId },
    data: { ataCabecalho: cabecalho || null, ataDivisa: divisa || null },
  });
  revalidatePath("/dashboard/loja");
  return { ok: "Cabeçalho das atas atualizado." };
}

// Frequência mínima (%) exigida para sair de "Instrução e Frequência"
// no Kanban de Progressões — parametrizada por loja
export async function updateMinFreqProgressao(
  _prev: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  const user = await requireRole("VENERAVEL_MESTRE", "SECRETARIO");
  const value = Number(formData.get("minFreq"));
  if (!Number.isInteger(value) || value < 0 || value > 100) {
    return { error: "Informe um percentual inteiro entre 0 e 100." };
  }
  await prisma.lodge.update({
    where: { id: user.lodgeId },
    data: { minFreqProgressao: value },
  });
  revalidatePath("/dashboard/loja");
  revalidatePath("/secretaria/progressoes");
  return { ok: `Frequência mínima definida em ${value}%.` };
}

// Nº de instruções exigidas para a progressão de cada grau (0 = sem exigência)
export async function updateInstrucoesNecessarias(
  _prev: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  const user = await requireRole("VENERAVEL_MESTRE", "SECRETARIO");
  const aprendiz = Number(formData.get("instrucoesAprendiz"));
  const companheiro = Number(formData.get("instrucoesCompanheiro"));
  for (const v of [aprendiz, companheiro]) {
    if (!Number.isInteger(v) || v < 0 || v > 99) {
      return { error: "Informe números inteiros entre 0 e 99." };
    }
  }
  await prisma.lodge.update({
    where: { id: user.lodgeId },
    data: {
      instrucoesAprendiz: aprendiz,
      instrucoesCompanheiro: companheiro,
    },
  });
  revalidatePath("/dashboard/loja");
  revalidatePath("/dashboard/instrucoes");
  return { ok: "Instruções exigidas atualizadas." };
}

// Template personalizado do Certificado de Visita (PPTX com os marcadores
// <<NOME DO IRMÃO>>, <<SESSAO>> e opcionalmente <<EMAIL>> e <<VENERAVEL>>).
// O upload extrai as posições e renderiza o fundo em PDF via LibreOffice.
export async function updateCertTemplate(
  _prev: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  const user = await requireRole("VENERAVEL_MESTRE", "SECRETARIO");
  const file = formData.get("template") as File | null;
  if (!file || file.size === 0) {
    return { error: "Selecione o arquivo PPTX do certificado." };
  }
  if (!file.name.toLowerCase().endsWith(".pptx")) {
    return { error: "O template deve ser um arquivo .pptx." };
  }
  if (file.size > 15_000_000) {
    return { error: "Template muito grande — use um PPTX de até 15 MB." };
  }
  const { extrairLayoutDoPptx, gerarFundoDoPptx } = await import(
    "@/lib/certificado"
  );
  const pptx = Buffer.from(await file.arrayBuffer());
  try {
    const layout = await extrairLayoutDoPptx(pptx);
    const fundo = await gerarFundoDoPptx(pptx);
    await prisma.lodge.update({
      where: { id: user.lodgeId },
      data: {
        certFundoPdf: new Uint8Array(fundo),
        certLayout: layout as Prisma.InputJsonValue,
      },
    });
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Falha ao processar o template." };
  }
  revalidatePath("/dashboard/loja");
  return {
    ok: "Template do Certificado de Visita atualizado — confira o preview.",
  };
}

// Caixa do editor visual do certificado, em frações da página (0–1)
type CertBoxFrac = { x: number; y: number; w: number; h: number; size: number };

// Salva as posições das caixas do certificado ajustadas no editor visual.
// As frações viram EMU (unidade do certLayout) a partir do tamanho real da
// página do fundo em vigor.
export async function updateCertLayoutBoxes(boxes: {
  nome: CertBoxFrac;
  sessao: CertBoxFrac;
  email?: CertBoxFrac;
  veneravel?: CertBoxFrac;
}): Promise<ActionResult> {
  const user = await requireRole("VENERAVEL_MESTRE", "SECRETARIO");
  const valida = (b?: CertBoxFrac) =>
    !b ||
    ([b.x, b.y, b.w, b.h].every(
      (v) => typeof v === "number" && v >= 0 && v <= 1
    ) &&
      typeof b.size === "number" &&
      b.size >= 4 &&
      b.size <= 96);
  if (
    !boxes?.nome ||
    !boxes.sessao ||
    ![boxes.nome, boxes.sessao, boxes.email, boxes.veneravel].every(valida)
  ) {
    return { error: "Posições inválidas das caixas do certificado." };
  }

  const { fundoAtual, EMU } = await import("@/lib/certificado");
  const { PDFDocument } = await import("pdf-lib");
  const pdf = await PDFDocument.load(await fundoAtual(user.lodgeId));
  const { width: pw, height: ph } = pdf.getPage(0).getSize(); // pontos

  const paraEmu = (b: CertBoxFrac) => ({
    x: Math.round(b.x * pw * EMU),
    y: Math.round(b.y * ph * EMU),
    cx: Math.round(b.w * pw * EMU),
    cy: Math.round(b.h * ph * EMU),
    size: Math.round(b.size),
  });
  const layout = {
    nome: paraEmu(boxes.nome),
    sessao: paraEmu(boxes.sessao),
    ...(boxes.email ? { email: paraEmu(boxes.email) } : {}),
    ...(boxes.veneravel ? { veneravel: paraEmu(boxes.veneravel) } : {}),
  };
  await prisma.lodge.update({
    where: { id: user.lodgeId },
    data: { certLayout: layout as Prisma.InputJsonValue },
  });
  revalidatePath("/dashboard/loja");
  return { ok: "Posições do certificado salvas — confira o preview." };
}

// Volta ao template padrão do sistema
export async function removeCertTemplate(): Promise<ActionResult> {
  const user = await requireRole("VENERAVEL_MESTRE", "SECRETARIO");
  await prisma.lodge.update({
    where: { id: user.lodgeId },
    data: { certFundoPdf: null, certLayout: Prisma.DbNull },
  });
  revalidatePath("/dashboard/loja");
  return { ok: "Template padrão restaurado." };
}

// Template do convite de sessão (RSVP). O Secretário/Venerável envia um .html
// com os placeholders do convite ({{LINK}} obrigatório) ou a arte pronta em
// JPG/PNG — a imagem vira o corpo do e-mail com o botão de confirmação abaixo.
export async function updateConviteTemplate(
  _prev: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  const user = await requireRole("VENERAVEL_MESTRE", "SECRETARIO");
  const file = formData.get("template") as File | null;
  if (!file || file.size === 0) {
    return { error: "Selecione o arquivo do convite (.html, .jpg ou .png)." };
  }
  const nome = file.name.toLowerCase();
  const ehHtml = nome.endsWith(".html") || nome.endsWith(".htm");
  const extImg = nome.endsWith(".png")
    ? "png"
    : nome.endsWith(".jpg") || nome.endsWith(".jpeg")
      ? "jpeg"
      : null;
  if (!ehHtml && !extImg) {
    return { error: "O template deve ser um arquivo .html, .jpg, .jpeg ou .png." };
  }

  let html: string;
  if (ehHtml) {
    if (file.size > 1_000_000) {
      return { error: "Template muito grande — use um HTML de até 1 MB (imagens como data URI pequenas)." };
    }
    html = await file.text();
    if (!html.includes("{{LINK}}")) {
      return {
        error:
          "O template precisa conter o placeholder {{LINK}} (endereço de confirmação de presença).",
      };
    }
  } else {
    if (file.size > 15_000_000) {
      return { error: "Imagem muito grande — use um JPG/PNG de até 15 MB." };
    }
    // Comprime a arte para caber bem no e-mail (largura 1120px, JPEG q80)
    const sharp = (await import("sharp")).default;
    const { templateDeImagem } = await import("@/lib/convite");
    const otimizada = await sharp(Buffer.from(await file.arrayBuffer()))
      .resize({ width: 1120, withoutEnlargement: true })
      .flatten({ background: "#ffffff" }) // PNG transparente vira fundo branco
      .jpeg({ quality: 80 })
      .toBuffer();
    html = templateDeImagem(
      `data:image/jpeg;base64,${otimizada.toString("base64")}`
    );
  }
  await prisma.lodge.update({
    where: { id: user.lodgeId },
    // Arte nova: a posição salva do painel valia para a arte anterior
    data: { conviteTemplateHtml: html, conviteArteLayout: Prisma.DbNull },
  });
  revalidatePath("/dashboard/loja");
  return { ok: "Template do convite de sessão atualizado." };
}

// Frase fixa do convite de sessão — só data e tipo variam entre convites
export async function updateConviteFrase(
  _prev: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  const user = await requireRole("VENERAVEL_MESTRE", "SECRETARIO");
  const frase = String(formData.get("frase") ?? "").trim();
  if (frase.length > 600) {
    return { error: "Frase longa demais — use até 600 caracteres." };
  }
  await prisma.lodge.update({
    where: { id: user.lodgeId },
    data: { conviteFrase: frase || null },
  });
  revalidatePath("/dashboard/loja");
  return { ok: frase ? "Frase do convite salva." : "Frase do convite removida (volta ao padrão)." };
}

// Posição do painel de dados sobre a arte do convite (editor visual)
export async function updateConviteArteLayout(layout: {
  x: number;
  y: number;
  w: number;
}): Promise<ActionResult> {
  const user = await requireRole("VENERAVEL_MESTRE", "SECRETARIO");
  const { x, y, w } = layout ?? {};
  const ok = [x, y].every((v) => typeof v === "number" && v >= 0 && v <= 1);
  if (!ok || typeof w !== "number" || w < 0.2 || w > 1) {
    return { error: "Posição inválida do painel." };
  }
  await prisma.lodge.update({
    where: { id: user.lodgeId },
    data: { conviteArteLayout: { x, y, w } },
  });
  revalidatePath("/dashboard/loja");
  return { ok: "Posição do painel do convite salva." };
}

// Volta o painel ao padrão (centralizado, 88% da largura)
export async function resetConviteArteLayout(): Promise<ActionResult> {
  const user = await requireRole("VENERAVEL_MESTRE", "SECRETARIO");
  await prisma.lodge.update({
    where: { id: user.lodgeId },
    data: { conviteArteLayout: Prisma.DbNull },
  });
  revalidatePath("/dashboard/loja");
  return { ok: "Painel do convite centralizado (padrão)." };
}

// Volta ao template padrão do convite (do repositório)
export async function removeConviteTemplate(): Promise<ActionResult> {
  const user = await requireRole("VENERAVEL_MESTRE", "SECRETARIO");
  await prisma.lodge.update({
    where: { id: user.lodgeId },
    data: { conviteTemplateHtml: null, conviteArteLayout: Prisma.DbNull },
  });
  revalidatePath("/dashboard/loja");
  return { ok: "Template padrão do convite restaurado." };
}

// Nº de capitações vencidas que torna o membro IRREGULAR automaticamente
export async function updateLimiteInadimplencia(
  _prev: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  const user = await requireRole("VENERAVEL_MESTRE", "SECRETARIO", "TESOUREIRO");
  const value = Number(formData.get("limite"));
  if (!Number.isInteger(value) || value < 1 || value > 24) {
    return { error: "Informe um número inteiro entre 1 e 24." };
  }
  await prisma.lodge.update({
    where: { id: user.lodgeId },
    data: { limiteInadimplencia: value },
  });
  await auditar({
    lodgeId: user.lodgeId,
    ator: user,
    acao: "loja.limite-inadimplencia",
    entidade: "Lodge",
    entidadeId: user.lodgeId,
    detalhes: { limite: value },
  });
  revalidatePath("/dashboard/loja");
  revalidatePath("/tesouraria/mensalidades");
  return { ok: `Membros ficam irregulares com ${value} capitação(ões) vencida(s).` };
}

// Gmail da Loja: e-mail + senha de app usados no envio (SMTP) e na caixa de
// entrada (IMAP). Campos vazios removem a configuração (volta ao padrão do
// servidor, se existir).
export async function updateGmailLoja(
  _prev: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  const user = await requireRole("VENERAVEL_MESTRE", "SECRETARIO");
  const gmailUser = String(formData.get("gmailUser") ?? "").trim() || null;
  // Google exibe a senha de app com espaços ("xxxx xxxx xxxx xxxx") — aceita ambos
  let gmailAppPassword =
    String(formData.get("gmailAppPassword") ?? "").replace(/\s+/g, "") || null;

  if (gmailUser && !gmailUser.includes("@")) {
    return { error: "Informe um endereço de e-mail válido." };
  }
  if (gmailUser && !gmailAppPassword) {
    // Senha em branco com e-mail preenchido: mantém a senha já salva
    const atual = await prisma.lodge.findUniqueOrThrow({
      where: { id: user.lodgeId },
      select: { gmailAppPassword: true },
    });
    gmailAppPassword = atual.gmailAppPassword;
    if (!gmailAppPassword) {
      return { error: "Informe a senha de app da conta." };
    }
  }
  if (!gmailUser) gmailAppPassword = null;
  const { sealSecret } = await import("@/lib/secrets");
  await prisma.lodge.update({
    where: { id: user.lodgeId },
    data: {
      gmailUser,
      gmailAppPassword: sealSecret(gmailAppPassword),
    },
  });
  await auditar({
    lodgeId: user.lodgeId,
    ator: user,
    acao: "loja.config-gmail",
    entidade: "Lodge",
    entidadeId: user.lodgeId,
    detalhes: { gmailUser },
  });
  revalidatePath("/dashboard/loja");
  revalidatePath("/secretaria/emails");
  return {
    ok: gmailUser
      ? `E-mails da loja serão enviados e lidos por ${gmailUser}.`
      : "Configuração de e-mail da loja removida.",
  };
}

// Backup completo da Loja salvo direto na pasta da loja no Google Drive
export async function backupParaDrive(): Promise<ActionResult> {
  const user = await requireRole("VENERAVEL_MESTRE", "SECRETARIO");
  const { isDriveAvailable, uploadToLodgeDrive } = await import(
    "@/lib/google-drive"
  );
  if (!(await isDriveAvailable(user.lodgeId))) {
    return {
      error:
        "Google Drive não conectado — conecte a conta da loja logo abaixo ou baixe o ZIP.",
    };
  }
  try {
    const { gerarBackupLoja } = await import("@/lib/backup");
    const { zip, fileName } = await gerarBackupLoja(user.lodgeId);
    await uploadToLodgeDrive(user.lodgeId, fileName, "application/zip", zip);
    return { ok: `Backup ${fileName} salvo na pasta da loja no Google Drive.` };
  } catch (e) {
    console.error("backupParaDrive", e);
    return { error: "Falha ao salvar o backup no Google Drive. Tente o download do ZIP." };
  }
}
