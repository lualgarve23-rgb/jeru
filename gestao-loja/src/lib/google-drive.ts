import { google } from "googleapis";
import type { Lodge } from "@prisma/client";
import { prisma } from "@/lib/prisma";

// Integração Google Drive.
// Preferência: conta Google conectada pela própria Loja via OAuth
// (Configurações da Loja → "Conectar Google Drive"). Fallback: Service
// Account global (GOOGLE_SERVICE_ACCOUNT_EMAIL / GOOGLE_SERVICE_ACCOUNT_KEY,
// com GOOGLE_DRIVE_ROOT_FOLDER_ID opcional).

export function isOAuthAppConfigured() {
  return Boolean(
    process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
  );
}

export function isServiceAccountConfigured() {
  return Boolean(
    process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL &&
      process.env.GOOGLE_SERVICE_ACCOUNT_KEY
  );
}

// O Drive está utilizável para esta loja?
export async function isDriveAvailable(lodgeId: string) {
  if (isServiceAccountConfigured()) return true;
  if (!isOAuthAppConfigured()) return false;
  const lodge = await prisma.lodge.findUnique({
    where: { id: lodgeId },
    select: { googleRefreshToken: true },
  });
  return Boolean(lodge?.googleRefreshToken);
}

export function oauthClient(redirectUri: string) {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    redirectUri
  );
}

function driveClientFor(lodge: Pick<Lodge, "googleRefreshToken">) {
  if (lodge.googleRefreshToken && isOAuthAppConfigured()) {
    const client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET
    );
    client.setCredentials({ refresh_token: lodge.googleRefreshToken });
    return google.drive({ version: "v3", auth: client });
  }
  if (isServiceAccountConfigured()) {
    const auth = new google.auth.JWT({
      email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      key: process.env.GOOGLE_SERVICE_ACCOUNT_KEY!.replace(/\\n/g, "\n"),
      scopes: ["https://www.googleapis.com/auth/drive"],
    });
    return google.drive({ version: "v3", auth });
  }
  throw new Error(
    "Google Drive não conectado — conecte a conta Google da Loja em Configurações da Loja."
  );
}

// Garante (e memoriza) a pasta da Loja no Drive.
export async function ensureLodgeFolder(lodgeId: string): Promise<string> {
  const lodge = await prisma.lodge.findUniqueOrThrow({
    where: { id: lodgeId },
  });
  if (lodge.driveFolderId) return lodge.driveFolderId;

  const drive = driveClientFor(lodge);
  const res = await drive.files.create({
    requestBody: {
      name: `Loja ${lodge.number} - ${lodge.name}`,
      mimeType: "application/vnd.google-apps.folder",
      parents:
        !lodge.googleRefreshToken && process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID
          ? [process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID]
          : undefined,
    },
    fields: "id",
  });
  const folderId = res.data.id!;
  await prisma.lodge.update({
    where: { id: lodgeId },
    data: { driveFolderId: folderId },
  });
  return folderId;
}

export async function uploadToLodgeDrive(
  lodgeId: string,
  fileName: string,
  mimeType: string,
  data: Buffer
): Promise<string> {
  const folderId = await ensureLodgeFolder(lodgeId);
  const lodge = await prisma.lodge.findUniqueOrThrow({
    where: { id: lodgeId },
  });
  const drive = driveClientFor(lodge);
  const { Readable } = await import("stream");
  const res = await drive.files.create({
    requestBody: { name: fileName, parents: [folderId] },
    media: { mimeType, body: Readable.from(data) },
    fields: "id",
  });
  return res.data.id!;
}

// Baixa um arquivo do Drive da Loja para exibição dentro do aplicativo.
export async function downloadFromLodgeDrive(
  lodgeId: string,
  fileId: string
): Promise<{ data: Buffer; mimeType: string; name: string }> {
  const lodge = await prisma.lodge.findUniqueOrThrow({
    where: { id: lodgeId },
  });
  const drive = driveClientFor(lodge);
  const [meta, media] = await Promise.all([
    drive.files.get({ fileId, fields: "name, mimeType" }),
    drive.files.get(
      { fileId, alt: "media" },
      { responseType: "arraybuffer" }
    ),
  ]);
  return {
    data: Buffer.from(media.data as ArrayBuffer),
    mimeType: meta.data.mimeType ?? "application/octet-stream",
    name: meta.data.name ?? "anexo",
  };
}
