import { google } from "googleapis";
import { prisma } from "@/lib/prisma";
import { gerarBackupLoja } from "@/lib/backup";
import { isServiceAccountConfigured } from "@/lib/google-drive";

// Backup automático de TODAS as lojas para o Google Drive do super admin.
// O super admin compartilha uma pasta do próprio Drive com a Service Account
// (GOOGLE_SERVICE_ACCOUNT_EMAIL) e grava o ID dela em /admin; o cron diário
// (ou o botão "Backup agora") sobe um ZIP por loja dentro de uma subpasta
// com a data. Lojas de demonstração/teste (9999 e 7777) ficam de fora.

const LOJAS_IGNORADAS = ["9999", "7777"];

function driveServiceAccount() {
  const auth = new google.auth.JWT({
    email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    key: process.env.GOOGLE_SERVICE_ACCOUNT_KEY!.replace(/\\n/g, "\n"),
    scopes: ["https://www.googleapis.com/auth/drive"],
  });
  return google.drive({ version: "v3", auth });
}

export async function backupConfigurado(): Promise<{
  folderId: string | null;
  serviceAccount: boolean;
}> {
  const config = await prisma.platformConfig.findUnique({
    where: { id: "platform" },
    select: { backupDriveFolderId: true },
  });
  return {
    folderId: config?.backupDriveFolderId ?? null,
    serviceAccount: isServiceAccountConfigured(),
  };
}

export async function backupTodasLojas(): Promise<{
  ok: number;
  falhas: { loja: string; erro: string }[];
  pasta: string;
}> {
  const { folderId, serviceAccount } = await backupConfigurado();
  if (!folderId) {
    throw new Error(
      "Pasta de backup não configurada — informe o ID da pasta do Drive em /admin."
    );
  }
  if (!serviceAccount) {
    throw new Error(
      "Service Account do Google não configurada no servidor (GOOGLE_SERVICE_ACCOUNT_EMAIL/KEY)."
    );
  }

  const drive = driveServiceAccount();
  const { Readable } = await import("stream");

  // Subpasta com a data da rodada (fuso de São Paulo), ex.: backup-2026-08-07
  const hoje = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "America/Sao_Paulo",
  }).format(new Date());
  const nomePasta = `backup-${hoje}`;
  const sub = await drive.files.create({
    requestBody: {
      name: nomePasta,
      mimeType: "application/vnd.google-apps.folder",
      parents: [folderId],
    },
    fields: "id",
  });
  const subId = sub.data.id!;

  const lodges = await prisma.lodge.findMany({
    where: { number: { notIn: LOJAS_IGNORADAS } },
    select: { id: true, number: true, name: true },
    orderBy: { number: "asc" },
  });

  let ok = 0;
  const falhas: { loja: string; erro: string }[] = [];
  for (const lodge of lodges) {
    try {
      const { zip, fileName } = await gerarBackupLoja(lodge.id);
      await drive.files.create({
        requestBody: { name: fileName, parents: [subId] },
        media: { mimeType: "application/zip", body: Readable.from(zip) },
        fields: "id",
      });
      ok++;
    } catch (e) {
      falhas.push({
        loja: `${lodge.number} - ${lodge.name}`,
        erro: e instanceof Error ? e.message : String(e),
      });
    }
  }
  return { ok, falhas, pasta: nomePasta };
}
