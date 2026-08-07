import { google } from "googleapis";
import { prisma } from "@/lib/prisma";
import { gerarBackupLoja } from "@/lib/backup";
import { isOAuthAppConfigured, oauthClient } from "@/lib/google-drive";

// Backup automático de TODAS as lojas para o Google Drive do super admin.
// O super admin conecta a própria conta Google em /admin (OAuth, escopo
// drive.file); o app cria a pasta "Backups NoPrumo" no Drive dele e o cron
// diário (ou o botão "Backup agora") sobe um ZIP por loja dentro de uma
// subpasta com a data. Lojas de demonstração/teste (9999 e 7777) ficam de
// fora. Service Account não serve aqui: o Google não dá cota de storage a
// Service Accounts no "Meu Drive".

const LOJAS_IGNORADAS = ["9999", "7777"];
const NOME_PASTA_RAIZ = "Backups NoPrumo";

function driveSuperAdmin(refreshToken: string) {
  const client = oauthClient("");
  client.setCredentials({ refresh_token: refreshToken });
  return google.drive({ version: "v3", auth: client });
}

// Garante (e memoriza) a pasta raiz de backups no Drive do super admin.
async function ensureBackupFolder(
  drive: ReturnType<typeof google.drive>,
  folderId: string | null
): Promise<string> {
  if (folderId) {
    try {
      await drive.files.get({ fileId: folderId, fields: "id" });
      return folderId;
    } catch {
      // pasta apagada ou de uma conta anterior → recriar
    }
  }
  const res = await drive.files.create({
    requestBody: {
      name: NOME_PASTA_RAIZ,
      mimeType: "application/vnd.google-apps.folder",
    },
    fields: "id",
  });
  const id = res.data.id!;
  await prisma.platformConfig.update({
    where: { id: "platform" },
    data: { backupDriveFolderId: id },
  });
  return id;
}

// Drive do super admin conectado em /admin (ou erro claro se não houver).
async function driveConectado() {
  const config = await prisma.platformConfig.findUnique({
    where: { id: "platform" },
    select: { backupGoogleRefreshToken: true, backupDriveFolderId: true },
  });
  if (!config?.backupGoogleRefreshToken || !isOAuthAppConfigured()) {
    throw new Error(
      "Conta Google de backup não conectada — use \"Conectar Google Drive\" em /admin."
    );
  }
  return driveSuperAdmin(config.backupGoogleRefreshToken);
}

export type BackupNoDrive = {
  id: string;
  nome: string;
  pasta: string | null;
  criadoEm: string | null;
  tamanho: number | null;
};

// Lista os ZIPs de backup no Drive do super admin (escopo drive.file só
// enxerga arquivos criados pelo próprio app), com o nome da subpasta diária.
export async function listarBackupsDrive(): Promise<BackupNoDrive[]> {
  const drive = await driveConectado();
  const [pastas, zips] = await Promise.all([
    drive.files.list({
      q: "mimeType='application/vnd.google-apps.folder' and trashed=false",
      fields: "files(id, name)",
      pageSize: 1000,
    }),
    drive.files.list({
      q: "mimeType='application/zip' and trashed=false",
      fields: "files(id, name, parents, createdTime, size)",
      orderBy: "createdTime desc",
      pageSize: 1000,
    }),
  ]);
  const nomePasta = new Map(
    (pastas.data.files ?? []).map((p) => [p.id!, p.name ?? ""])
  );
  return (zips.data.files ?? []).map((f) => ({
    id: f.id!,
    nome: f.name ?? "backup.zip",
    pasta: nomePasta.get(f.parents?.[0] ?? "") ?? null,
    criadoEm: f.createdTime ?? null,
    tamanho: f.size ? Number(f.size) : null,
  }));
}

// Baixa um ZIP de backup do Drive do super admin.
export async function baixarBackupDrive(fileId: string): Promise<Buffer> {
  const drive = await driveConectado();
  const res = await drive.files.get(
    { fileId, alt: "media" },
    { responseType: "arraybuffer" }
  );
  return Buffer.from(res.data as ArrayBuffer);
}

export async function backupTodasLojas(): Promise<{
  ok: number;
  falhas: { loja: string; erro: string }[];
  pasta: string;
}> {
  const config = await prisma.platformConfig.findUnique({
    where: { id: "platform" },
    select: { backupGoogleRefreshToken: true, backupDriveFolderId: true },
  });
  if (!config?.backupGoogleRefreshToken || !isOAuthAppConfigured()) {
    throw new Error(
      "Conta Google de backup não conectada — use \"Conectar Google Drive\" em /admin."
    );
  }

  const drive = driveSuperAdmin(config.backupGoogleRefreshToken);
  const raizId = await ensureBackupFolder(drive, config.backupDriveFolderId);
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
      parents: [raizId],
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
