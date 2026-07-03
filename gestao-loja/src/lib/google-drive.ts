import { google } from "googleapis";
import { prisma } from "@/lib/prisma";

// Integração Google Drive via Service Account.
// Variáveis: GOOGLE_SERVICE_ACCOUNT_EMAIL, GOOGLE_SERVICE_ACCOUNT_KEY (chave
// privada PEM, com \n escapados) e opcionalmente GOOGLE_DRIVE_ROOT_FOLDER_ID
// (pasta compartilhada com a service account).

export function isDriveConfigured() {
  return Boolean(
    process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL &&
      process.env.GOOGLE_SERVICE_ACCOUNT_KEY
  );
}

function driveClient() {
  const auth = new google.auth.JWT({
    email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    key: process.env.GOOGLE_SERVICE_ACCOUNT_KEY!.replace(/\\n/g, "\n"),
    scopes: ["https://www.googleapis.com/auth/drive"],
  });
  return google.drive({ version: "v3", auth });
}

// Garante (e memoriza) a pasta da Loja no Drive.
export async function ensureLodgeFolder(lodgeId: string): Promise<string> {
  const lodge = await prisma.lodge.findUniqueOrThrow({
    where: { id: lodgeId },
  });
  if (lodge.driveFolderId) return lodge.driveFolderId;

  const drive = driveClient();
  const res = await drive.files.create({
    requestBody: {
      name: `Loja ${lodge.number} - ${lodge.name}`,
      mimeType: "application/vnd.google-apps.folder",
      parents: process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID
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
  const drive = driveClient();
  const { Readable } = await import("stream");
  const res = await drive.files.create({
    requestBody: { name: fileName, parents: [folderId] },
    media: { mimeType, body: Readable.from(data) },
    fields: "id",
  });
  return res.data.id!;
}
