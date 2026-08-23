import { google } from "googleapis";
import type { Lodge } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { openSecret } from "@/lib/secrets";

// Integração Google Drive.
// Arquivos da Loja: exclusivamente a conta Google conectada pela própria
// Loja via OAuth (Configurações da Loja → "Conectar Google Drive") — a
// Service Account não serve de fallback aqui porque não tem cota de
// storage para uploads no "Meu Drive". A Service Account global
// (GOOGLE_SERVICE_ACCOUNT_EMAIL / GOOGLE_SERVICE_ACCOUNT_KEY) é usada
// apenas pelo backup da plataforma (backup-plataforma.ts).

export function isOAuthAppConfigured() {
  return Boolean(
    process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
  );
}

// O Drive está utilizável para esta loja?
export async function isDriveAvailable(lodgeId: string) {
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
  const refreshToken = openSecret(lodge.googleRefreshToken);
  if (refreshToken && isOAuthAppConfigured()) {
    const client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET
    );
    client.setCredentials({ refresh_token: refreshToken });
    return google.drive({ version: "v3", auth: client });
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

// Remove um arquivo do Drive da Loja (best-effort — versões preliminares
// substituídas pela versão final assinada).
export async function deleteFromLodgeDrive(lodgeId: string, fileId: string) {
  const lodge = await prisma.lodge.findUniqueOrThrow({ where: { id: lodgeId } });
  const drive = driveClientFor(lodge);
  await drive.files.delete({ fileId }).catch(() => undefined);
}

// Regra da Loja: todo documento que passa por cadeia de assinatura fica no
// Drive SOMENTE na sua versão final. Sobe o PDF, registra na Biblioteca
// (Document) e apaga a versão preliminar (se houver). Devolve o id do Drive,
// ou um aviso (string) para anexar à mensagem de sucesso quando não arquivou.
export async function arquivarVersaoFinalNoDrive(opts: {
  lodgeId: string;
  uploadedById: string;
  fileName: string;
  title: string;
  pdf: Buffer;
  type?: "ATA_ESCANEADA" | "HISTORICO" | "REGULAMENTO" | "FINANCEIRO" | "OUTRO";
  substituiDriveFileId?: string | null;
}): Promise<{ driveFileId: string; aviso: "" } | { driveFileId: null; aviso: string }> {
  try {
    if (!(await isDriveAvailable(opts.lodgeId))) {
      return {
        driveFileId: null,
        aviso: " Drive não conectado — o arquivo não foi arquivado no Drive.",
      };
    }
    const driveFileId = await uploadToLodgeDrive(
      opts.lodgeId,
      opts.fileName,
      "application/pdf",
      opts.pdf
    );
    await prisma.document.create({
      data: {
        lodgeId: opts.lodgeId,
        uploadedById: opts.uploadedById,
        title: opts.title,
        type: opts.type ?? "OUTRO",
        driveFileId,
        mimeType: "application/pdf",
        sizeBytes: opts.pdf.length,
      },
    });
    if (opts.substituiDriveFileId && opts.substituiDriveFileId !== driveFileId) {
      await deleteFromLodgeDrive(opts.lodgeId, opts.substituiDriveFileId);
      await prisma.document.deleteMany({
        where: { lodgeId: opts.lodgeId, driveFileId: opts.substituiDriveFileId },
      });
    }
    return { driveFileId, aviso: "" };
  } catch (e) {
    return {
      driveFileId: null,
      aviso: ` Falha ao arquivar no Drive: ${
        e instanceof Error ? e.message : "erro desconhecido"
      }`,
    };
  }
}

export function slugNome(nome: string) {
  return nome
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}
