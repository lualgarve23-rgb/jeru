"use server";

import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { auditar } from "@/lib/audit";
import { requireRole } from "@/lib/session";
import { CARGOS_PADRAO } from "@/lib/cargos";
import { getPlatformAsaas } from "@/lib/platform-config";
import { deleteLodgeData } from "@/lib/lodge-delete";
import { deleteLodgeMedia } from "@/lib/media";

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
// Senha inicial do VM = aleatória, exibida uma única vez ao super admin
// (a loja nova ainda não tem e-mail configurado para envio).
export async function createLodge(
  _prev: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  const admin = await requireRole("SUPER_ADMIN");

  const name = String(formData.get("name") ?? "").trim();
  const number = String(formData.get("number") ?? "").trim();
  const potencia = String(formData.get("potencia") ?? "").trim() || null;
  const oriente = String(formData.get("oriente") ?? "").trim() || null;
  const address = String(formData.get("address") ?? "").trim() || null;

  const vmName = String(formData.get("vmName") ?? "").trim();
  const vmCim = String(formData.get("vmCim") ?? "").trim();
  const vmCpf = String(formData.get("vmCpf") ?? "").replace(/\D/g, "");
  const vmEmail = String(formData.get("vmEmail") ?? "").trim();

  if (!name || !number || !vmName || !vmCim || !vmEmail || vmCpf.length !== 11) {
    return { error: "Preencha todos os campos (CPF com 11 dígitos)." };
  }

  // Licença do sistema: opcional; cobrança boleto/Pix pela conta Asaas da plataforma
  const cobrarLicenca = formData.get("cobrarLicenca") === "on";
  const licencaValor = Number(
    String(formData.get("licencaValor") ?? "").replace(",", ".")
  );
  let platformApiKey: string | null = null;
  if (cobrarLicenca) {
    if (!Number.isFinite(licencaValor) || licencaValor <= 0) {
      return { error: "Informe o valor da licença (em reais)." };
    }
    platformApiKey = (await getPlatformAsaas()).apiKey;
    if (!platformApiKey) {
      return {
        error:
          "Conta Asaas da plataforma não configurada — informe a API key na seção 'Conta Asaas da plataforma' desta página.",
      };
    }
  }

  const logo = await readLogo(formData);
  if (logo && typeof logo === "object") return logo;

  // #16: CIM/CPF/e-mail são únicos POR loja — o VM da loja nova pode ser
  // irmão já cadastrado em outra loja (filiação múltipla)
  const lodgeExists = await prisma.lodge.findUnique({ where: { number } });
  if (lodgeExists) return { error: `Já existe loja com o número ${number}.` };

  const { gerarSenhaInicial } = await import("@/lib/senha-inicial");
  const vmSenha = gerarSenhaInicial();
  await prisma.lodge.create({
    data: {
      name,
      number,
      potencia,
      oriente,
      address,
      logoUrl: logo,
      users: {
        create: {
          cim: vmCim,
          cpf: vmCpf,
          name: vmName,
          email: vmEmail,
          passwordHash: await bcrypt.hash(vmSenha, 10),
          mustChangePassword: true,
          degree: "MESTRE",
          currentRole: "VENERAVEL_MESTRE",
        },
      },
      // Cargos ritualísticos padrão — editáveis em /secretaria/cargos
      cargosRito: {
        create: CARGOS_PADRAO.map((nome) => ({ nome })),
      },
    },
  });

  // Cobrança da licença (boleto/Pix — o pagador escolhe no link do Asaas)
  let licencaMsg = "";
  if (cobrarLicenca) {
    try {
      const { ensureCustomer, createPayment } = await import("@/lib/asaas");
      const apiKey = platformApiKey!;
      const lodge = await prisma.lodge.findUniqueOrThrow({
        where: { number },
        select: { id: true },
      });
      const customerId = await ensureCustomer(apiKey, {
        name: vmName,
        cpf: vmCpf,
        email: vmEmail,
        asaasCustomerId: null,
      });
      const due = new Date();
      due.setDate(due.getDate() + 7);
      const payment = await createPayment(apiKey, {
        customerId,
        amountCents: Math.round(licencaValor * 100),
        dueDate: due,
        description: `Licença do sistema — ${name} nº ${number}`,
        externalReference: `licenca:${lodge.id}`,
      });
      await prisma.lodge.update({
        where: { id: lodge.id },
        data: {
          licencaValor,
          licencaChargeId: payment.id,
          licencaInvoiceUrl: payment.invoiceUrl,
          licencaStatus: "PENDENTE",
          licencaVencimento: due,
          licencaPagaEm: null,
        },
      });
      licencaMsg = ` Licença de R$ ${licencaValor.toFixed(2)} gerada — link de pagamento (boleto/Pix) disponível na lista de lojas.`;
    } catch (e) {
      licencaMsg = ` Atenção: a loja foi criada, mas a cobrança da licença falhou (${e instanceof Error ? e.message : "erro Asaas"}).`;
    }
  }

  await auditar({
    lodgeId: null,
    ator: admin,
    acao: "admin.criar-loja",
    entidade: "Lodge",
    detalhes: { nome: name, numero: number, cobrarLicenca },
  });
  revalidatePath("/admin");
  return {
    ok: `Loja "${name}" criada. VM ${vmName} acessa com CIM ${vmCim} e senha inicial ${vmSenha} (anote e repasse — ela não será mostrada de novo; troca obrigatória no 1º acesso).${licencaMsg}`,
  };
}

// Salva as credenciais Asaas da PLATAFORMA (licenças) — SUPER_ADMIN.
// Campos em branco mantêm o valor já gravado (formulário mascarado).
export async function updatePlatformAsaas(
  _prev: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  const admin = await requireRole("SUPER_ADMIN");

  let asaasApiKey = String(formData.get("asaasApiKey") ?? "").trim() || null;
  let asaasWebhookToken =
    String(formData.get("asaasWebhookToken") ?? "").trim() || null;

  // Campos mascarados: em branco mantém o que já está no banco
  if (!asaasApiKey || !asaasWebhookToken) {
    const atual = await prisma.platformConfig.findUnique({
      where: { id: "platform" },
    });
    if (!asaasApiKey) asaasApiKey = atual?.asaasApiKey ?? null;
    if (!asaasWebhookToken) asaasWebhookToken = atual?.asaasWebhookToken ?? null;
  }

  const { sealSecret } = await import("@/lib/secrets");
  await prisma.platformConfig.upsert({
    where: { id: "platform" },
    create: {
      id: "platform",
      asaasApiKey: sealSecret(asaasApiKey),
      asaasWebhookToken,
    },
    update: {
      asaasApiKey: sealSecret(asaasApiKey),
      asaasWebhookToken,
    },
  });

  await auditar({
    lodgeId: null,
    ator: admin,
    acao: "admin.config-asaas-plataforma",
  });
  revalidatePath("/admin");
  return { ok: "Conta Asaas da plataforma atualizada." };
}

// Pasta do Google Drive do super admin que recebe os backups automáticos
// das lojas (compartilhada com a Service Account) — SUPER_ADMIN.
// Roda agora o backup de todas as lojas para o Drive configurado.
export async function executarBackupLojas(
  _prev: ActionResult,
  _formData: FormData
): Promise<ActionResult> {
  await requireRole("SUPER_ADMIN");
  try {
    const { backupTodasLojas } = await import("@/lib/backup-plataforma");
    const r = await backupTodasLojas();
    const falhas = r.falhas.length
      ? ` Falhas: ${r.falhas.map((f) => `${f.loja} (${f.erro})`).join("; ")}.`
      : "";
    return {
      ok: `${r.ok} backup(s) enviados para a pasta "${r.pasta}" no Drive.${falhas}`,
    };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Falha no backup." };
  }
}

// Cria (ou recria do zero) a Loja de Demonstração nº 9999 com dados
// fictícios — ambiente de testes dos usuários, sem tocar em dados reais.
export async function criarLojaDemo(
  _prev: ActionResult,
  _formData: FormData
): Promise<ActionResult> {
  await requireRole("SUPER_ADMIN");
  try {
    const { recreateDemoLodge } = await import("@/lib/demo-lodge");
    const { logins } = await recreateDemoLodge();
    revalidatePath("/admin");
    return { ok: `Loja de demonstração recriada. ${logins}` };
  } catch (e) {
    return {
      error: `Falha ao criar a loja demo (${e instanceof Error ? e.message : "erro"}).`,
    };
  }
}

// Restaura o backup de uma loja a partir do ZIP gerado em /api/backup.
// DESTRUTIVO: substitui todos os dados da loja de mesmo número. Exige
// digitar o número da loja como confirmação.
export async function restaurarBackup(
  _prev: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  const admin = await requireRole("SUPER_ADMIN");

  const file = formData.get("backupZip") as File | null;
  const confirmNumber = String(formData.get("confirmNumber") ?? "").trim();
  if (!file || file.size === 0) {
    return { error: "Selecione o arquivo ZIP do backup." };
  }
  return restaurarZipConfirmado(
    Buffer.from(await file.arrayBuffer()),
    confirmNumber,
    admin
  );
}

// Valida a confirmação do número e restaura o ZIP (comum aos dois caminhos:
// upload manual e arquivo escolhido no Google Drive do super admin).
async function restaurarZipConfirmado(
  zipBuffer: Buffer,
  confirmNumber: string,
  admin: { id: string; name: string }
): Promise<ActionResult> {
  if (!confirmNumber) {
    return { error: "Digite o número da loja para confirmar a restauração." };
  }
  try {
    // Confirma o número ANTES de qualquer alteração
    const { restaurarBackupLoja } = await import("@/lib/restore");
    const JSZip = (await import("jszip")).default;
    const zip = await JSZip.loadAsync(zipBuffer);
    const lojaJson = zip.file("dados/loja.json");
    if (!lojaJson) {
      return { error: "ZIP inválido — use um backup gerado pelo sistema (contém dados/loja.json)." };
    }
    const [loja] = JSON.parse(await lojaJson.async("string"));
    if (String(loja?.number) !== confirmNumber) {
      return {
        error: `Confirmação incorreta: o backup é da loja nº ${loja?.number}, mas você digitou "${confirmNumber}".`,
      };
    }

    const { ok, avisos } = await restaurarBackupLoja(zipBuffer);
    await auditar({
      lodgeId: String(loja.id),
      ator: admin,
      acao: "admin.restaurar-backup",
      entidade: "Lodge",
      entidadeId: String(loja.id),
      detalhes: { numero: String(loja.number), resultado: ok },
    });
    revalidatePath("/admin");
    return { ok: [ok, ...avisos].join(" • ") };
  } catch (e) {
    return {
      error: `Falha na restauração — nada foi alterado (${e instanceof Error ? e.message : "erro"}).`,
    };
  }
}

// Lista os ZIPs de backup disponíveis no Google Drive conectado em /admin
// (mesma conta do backup automático) — chamada sob demanda pelo formulário.
export async function listarBackupsDoDrive(): Promise<
  | { error: string }
  | { backups: import("@/lib/backup-plataforma").BackupNoDrive[] }
> {
  await requireRole("SUPER_ADMIN");
  try {
    const { listarBackupsDrive } = await import("@/lib/backup-plataforma");
    return { backups: await listarBackupsDrive() };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Falha ao listar backups." };
  }
}

// Restaura o backup baixando o ZIP escolhido direto do Google Drive.
export async function restaurarBackupDoDrive(
  _prev: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  const admin = await requireRole("SUPER_ADMIN");

  const driveFileId = String(formData.get("driveFileId") ?? "").trim();
  const confirmNumber = String(formData.get("confirmNumber") ?? "").trim();
  if (!driveFileId) {
    return { error: "Escolha o arquivo de backup no Google Drive." };
  }
  try {
    const { baixarBackupDrive } = await import("@/lib/backup-plataforma");
    const zipBuffer = await baixarBackupDrive(driveFileId);
    return await restaurarZipConfirmado(zipBuffer, confirmNumber, admin);
  } catch (e) {
    return {
      error: `Falha ao baixar o backup do Drive (${e instanceof Error ? e.message : "erro"}).`,
    };
  }
}

// Atualiza dados cadastrais de uma loja (SUPER_ADMIN)
export async function updateLodge(
  _prev: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  const admin = await requireRole("SUPER_ADMIN");

  const id = String(formData.get("lodgeId") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const number = String(formData.get("number") ?? "").trim();
  const potencia = String(formData.get("potencia") ?? "").trim() || null;
  const oriente = String(formData.get("oriente") ?? "").trim() || null;
  const address = String(formData.get("address") ?? "").trim() || null;

  if (!id || !name || !number) {
    return { error: "Nome e número são obrigatórios." };
  }

  const lodge = await prisma.lodge.findUnique({ where: { id } });
  if (!lodge || lodge.number === "0000") {
    return { error: "Loja não encontrada." };
  }

  const conflict = await prisma.lodge.findFirst({
    where: { number, id: { not: id } },
  });
  if (conflict) return { error: `Já existe loja com o número ${number}.` };

  const logo = await readLogo(formData);
  if (logo && typeof logo === "object") return logo;

  await prisma.lodge.update({
    where: { id },
    data: { name, number, potencia, oriente, address, ...(logo ? { logoUrl: logo } : {}) },
  });

  await auditar({
    lodgeId: id,
    ator: admin,
    acao: "admin.editar-loja",
    entidade: "Lodge",
    entidadeId: id,
    detalhes: { nome: name, numero: number },
  });
  revalidatePath("/admin");
  return { ok: `Loja "${name}" atualizada.` };
}

// Exclui uma loja e TODOS os seus dados (SUPER_ADMIN).
// Exige digitar o número da loja como confirmação.
export async function deleteLodge(
  _prev: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  const admin = await requireRole("SUPER_ADMIN");

  const id = String(formData.get("lodgeId") ?? "");
  const confirmNumber = String(formData.get("confirmNumber") ?? "").trim();

  const lodge = await prisma.lodge.findUnique({ where: { id } });
  if (!lodge || lodge.number === "0000") {
    return { error: "Loja não encontrada." };
  }
  if (confirmNumber !== lodge.number) {
    return { error: "Confirmação incorreta — digite o número da loja." };
  }

  // Sem onDelete: Cascade no schema — a ordem certa está em deleteLodgeData
  await prisma.$transaction((tx) => deleteLodgeData(tx, id), {
    timeout: 60_000,
  });
  // Fora da transação: fotos/assinaturas em disco (lib/media)
  await deleteLodgeMedia(id);

  await auditar({
    lodgeId: id,
    ator: admin,
    acao: "admin.excluir-loja",
    entidade: "Lodge",
    entidadeId: id,
    detalhes: { nome: lodge.name, numero: lodge.number },
  });
  revalidatePath("/admin");
  return { ok: `Loja "${lodge.name}" nº ${lodge.number} excluída com todos os dados.` };
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

// Gera (ou renova) a cobrança da licença de uma loja existente — SUPER_ADMIN.
// Boleto/Pix pela conta Asaas da plataforma, em nome do VM, vencimento em 7 dias.
export async function gerarCobrancaLicenca(
  _prev: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  const admin = await requireRole("SUPER_ADMIN");

  const lodgeId = String(formData.get("lodgeId") ?? "");
  const valor = Number(
    String(formData.get("licencaValor") ?? "").replace(",", ".")
  );
  if (!Number.isFinite(valor) || valor <= 0) {
    return { error: "Informe um valor de licença válido." };
  }
  const { apiKey: platformApiKey } = await getPlatformAsaas();
  if (!platformApiKey) {
    return {
      error:
        "Conta Asaas da plataforma não configurada — informe a API key na seção 'Conta Asaas da plataforma' desta página.",
    };
  }

  const lodge = await prisma.lodge.findUnique({ where: { id: lodgeId } });
  if (!lodge || lodge.number === "0000") {
    return { error: "Loja não encontrada." };
  }
  const vm = await prisma.user.findFirst({
    where: { lodgeId, currentRole: "VENERAVEL_MESTRE", status: "ATIVO" },
    select: { name: true, cpf: true, email: true, asaasCustomerId: true },
  });
  if (!vm?.cpf) {
    return { error: "A loja não tem VM ativo com CPF cadastrado (pagador da cobrança)." };
  }

  try {
    const { ensureCustomer, createPayment } = await import("@/lib/asaas");
    const customerId = await ensureCustomer(platformApiKey, {
      name: vm.name,
      cpf: vm.cpf,
      email: vm.email,
      asaasCustomerId: vm.asaasCustomerId,
    });
    const due = new Date();
    due.setDate(due.getDate() + 7);
    const payment = await createPayment(platformApiKey, {
      customerId,
      amountCents: Math.round(valor * 100),
      dueDate: due,
      description: `Licença do sistema — ${lodge.name} nº ${lodge.number}`,
      externalReference: `licenca:${lodge.id}`,
    });
    await prisma.lodge.update({
      where: { id: lodge.id },
      data: {
        licencaValor: valor,
        licencaChargeId: payment.id,
        licencaInvoiceUrl: payment.invoiceUrl,
        licencaStatus: "PENDENTE",
        licencaVencimento: due,
        licencaPagaEm: null,
      },
    });
  } catch (e) {
    return {
      error: `Falha ao gerar a cobrança (${e instanceof Error ? e.message : "erro Asaas"}).`,
    };
  }

  await auditar({
    lodgeId,
    ator: admin,
    acao: "admin.cobranca-licenca",
    entidade: "Lodge",
    entidadeId: lodgeId,
    detalhes: { valor },
  });
  revalidatePath("/admin");
  return {
    ok: `Cobrança de R$ ${valor.toFixed(2).replace(".", ",")} gerada para ${lodge.name} — link disponível na tabela.`,
  };
}
