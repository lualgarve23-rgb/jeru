import { promises as fs } from "fs";
import path from "path";
import crypto from "crypto";

// Armazenamento de imagens (fotos e assinaturas de membros) em disco local.
// O banco guarda apenas a chave, no formato "media:<lodgeId>/users/<userId>/<arquivo>";
// os bytes ficam em MEDIA_DIR. A abstração fica toda aqui — para migrar um
// dia para S3/OCI basta trocar as funções deste módulo e copiar os arquivos.

export const MEDIA_PREFIX = "media:";

// Fora do repo por padrão para sobreviver a deploys via rsync/git clean
function mediaDir() {
  return process.env.MEDIA_DIR ?? path.join(process.cwd(), "..", "media");
}

const EXT_POR_MIME: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
};

const MIME_POR_EXT: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  webp: "image/webp",
};

export function isMediaKey(
  v: string | null | undefined
): v is `media:${string}` {
  return typeof v === "string" && v.startsWith(MEDIA_PREFIX);
}

// Caminho absoluto de uma chave, com guarda contra path traversal
function caminhoDe(key: string): string {
  const rel = key.slice(MEDIA_PREFIX.length);
  const base = path.resolve(mediaDir());
  const abs = path.resolve(base, rel);
  if (!abs.startsWith(base + path.sep)) {
    throw new Error(`Chave de media inválida: ${key}`);
  }
  return abs;
}

// Valida um upload de imagem; retorna erro amigável quando o arquivo não serve.
export function validarImagem(
  file: File | null,
  label: string
): { ok?: true; vazio?: true; error?: string } {
  if (!file || file.size === 0) return { vazio: true };
  if (!EXT_POR_MIME[file.type]) {
    return { error: `${label} deve ser uma imagem PNG, JPG ou WebP.` };
  }
  if (file.size > 500_000) {
    return { error: `${label} muito grande — use uma imagem de até 500 KB.` };
  }
  return { ok: true };
}

// Grava a imagem de um membro e retorna a chave a guardar no banco.
// O sufixo aleatório torna cada upload único (cache imutável no navegador).
export async function saveUserImage(
  lodgeId: string,
  userId: string,
  kind: "photo" | "signature",
  file: File
): Promise<string> {
  const ext = EXT_POR_MIME[file.type];
  if (!ext) throw new Error(`Tipo de imagem não suportado: ${file.type}`);
  const nome = `${kind}-${crypto.randomBytes(6).toString("hex")}.${ext}`;
  const key = `${MEDIA_PREFIX}${lodgeId}/users/${userId}/${nome}`;
  const abs = caminhoDe(key);
  await fs.mkdir(path.dirname(abs), { recursive: true });
  await fs.writeFile(abs, Buffer.from(await file.arrayBuffer()));
  return key;
}

// Foto do candidato num processo de admissão
export async function saveAdmissaoFoto(
  lodgeId: string,
  processoId: string,
  file: File
): Promise<string> {
  const ext = EXT_POR_MIME[file.type];
  if (!ext) throw new Error(`Tipo de imagem não suportado: ${file.type}`);
  const nome = `photo-${crypto.randomBytes(6).toString("hex")}.${ext}`;
  const key = `${MEDIA_PREFIX}${lodgeId}/admissoes/${processoId}/${nome}`;
  const abs = caminhoDe(key);
  await fs.mkdir(path.dirname(abs), { recursive: true });
  await fs.writeFile(abs, Buffer.from(await file.arrayBuffer()));
  return key;
}

// Foto do candidato a partir de bytes (migração de data URIs legados)
export async function saveAdmissaoFotoBytes(
  lodgeId: string,
  processoId: string,
  mime: string,
  bytes: Buffer
): Promise<string> {
  const ext = EXT_POR_MIME[mime];
  if (!ext) throw new Error(`Tipo de imagem não suportado: ${mime}`);
  const nome = `photo-${crypto.randomBytes(6).toString("hex")}.${ext}`;
  const key = `${MEDIA_PREFIX}${lodgeId}/admissoes/${processoId}/${nome}`;
  const abs = caminhoDe(key);
  await fs.mkdir(path.dirname(abs), { recursive: true });
  await fs.writeFile(abs, bytes);
  return key;
}

// Grava bytes diretamente (migração de data URIs legados)
export async function saveUserImageBytes(
  lodgeId: string,
  userId: string,
  kind: "photo" | "signature",
  mime: string,
  bytes: Buffer
): Promise<string> {
  const ext = EXT_POR_MIME[mime];
  if (!ext) throw new Error(`Tipo de imagem não suportado: ${mime}`);
  const nome = `${kind}-${crypto.randomBytes(6).toString("hex")}.${ext}`;
  const key = `${MEDIA_PREFIX}${lodgeId}/users/${userId}/${nome}`;
  const abs = caminhoDe(key);
  await fs.mkdir(path.dirname(abs), { recursive: true });
  await fs.writeFile(abs, bytes);
  return key;
}

export async function readMedia(
  key: string
): Promise<{ bytes: Buffer; mime: string } | null> {
  if (!isMediaKey(key)) return null;
  try {
    const abs = caminhoDe(key);
    const bytes = await fs.readFile(abs);
    const ext = path.extname(abs).slice(1).toLowerCase();
    return { bytes, mime: MIME_POR_EXT[ext] ?? "application/octet-stream" };
  } catch {
    return null;
  }
}

// Idempotente: chave que não existe (ou não é chave) é ignorada
export async function deleteMedia(key: string | null | undefined) {
  if (!isMediaKey(key)) return;
  try {
    await fs.unlink(caminhoDe(key));
  } catch {
    // arquivo já não existe — nada a fazer
  }
}

// Remove todos os arquivos de uma loja (exclusão de loja)
export async function deleteLodgeMedia(lodgeId: string) {
  if (!lodgeId || lodgeId.includes("/") || lodgeId.includes("..")) return;
  await fs.rm(path.join(path.resolve(mediaDir()), lodgeId), {
    recursive: true,
    force: true,
  });
}

// Lista chaves de uma loja (backup da loja inclui os arquivos de media)
export async function listLodgeMedia(lodgeId: string): Promise<string[]> {
  const base = path.join(path.resolve(mediaDir()), lodgeId);
  const chaves: string[] = [];
  async function anda(dir: string) {
    let itens;
    try {
      itens = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const it of itens) {
      const abs = path.join(dir, it.name);
      if (it.isDirectory()) await anda(abs);
      else
        chaves.push(
          MEDIA_PREFIX + path.relative(path.resolve(mediaDir()), abs)
        );
    }
  }
  await anda(base);
  return chaves;
}

// Resolve um valor do banco (chave ou data URI legado) para data URI —
// para embutir em PDFs (ata-pdf) sem tocar na lib de PDF.
export async function resolveParaDataUri(
  v: string | null | undefined
): Promise<string | null> {
  if (!v) return null;
  if (!isMediaKey(v)) return v;
  const m = await readMedia(v);
  if (!m) return null;
  return `data:${m.mime};base64,${m.bytes.toString("base64")}`;
}
