// Migração #8: fotos e assinaturas guardadas como data URI no Postgres
// passam para o disco local (lib/media); o banco fica só com a chave.
// Idempotente — registros já migrados (chave "media:...") são ignorados.
//   npx tsx scripts/migra-media.ts            (executa)
//   npx tsx scripts/migra-media.ts --simula   (só conta, não altera nada)
import { prisma } from "../src/lib/prisma";
import {
  saveUserImageBytes,
  saveAdmissaoFotoBytes,
  isMediaKey,
} from "../src/lib/media";

const simula = process.argv.includes("--simula");

function decodifica(v: string) {
  const [, mime, base64] = v.match(/^data:(image\/[\w.+-]+);base64,(.+)$/) ?? [];
  if (!base64) return null;
  return { mime, bytes: Buffer.from(base64, "base64") };
}

async function migraCampo(
  userId: string,
  lodgeId: string,
  kind: "photo" | "signature",
  valor: string | null
): Promise<"migrado" | "ja-migrado" | "vazio" | "invalido"> {
  if (!valor) return "vazio";
  if (isMediaKey(valor)) return "ja-migrado";
  const img = decodifica(valor);
  if (!img) return "invalido";
  if (simula) return "migrado";
  let key: string;
  try {
    key = await saveUserImageBytes(lodgeId, userId, kind, img.mime, img.bytes);
  } catch {
    // mime fora de png/jpg/webp (ex.: gif antigo) — mantém o data URI
    return "invalido";
  }
  await prisma.user.update({
    where: { id: userId },
    data: { [kind === "photo" ? "photoUrl" : "signatureUrl"]: key },
  });
  return "migrado";
}

async function migraAdmissoes() {
  const processos = await prisma.processoAdmissao.findMany({
    where: { fotoUrl: { not: null } },
    select: { id: true, lodgeId: true, fotoUrl: true },
  });
  let migrados = 0;
  for (const p of processos) {
    if (isMediaKey(p.fotoUrl)) continue;
    const img = decodifica(p.fotoUrl!);
    if (!img) continue;
    if (simula) { migrados++; continue; }
    try {
      const key = await saveAdmissaoFotoBytes(p.lodgeId, p.id, img.mime, img.bytes);
      await prisma.processoAdmissao.update({
        where: { id: p.id },
        data: { fotoUrl: key },
      });
      migrados++;
    } catch {
      // mime não suportado — mantém o data URI
    }
  }
  console.log(`fotos de candidato migradas: ${migrados} de ${processos.length}`);
}

async function main() {
  await migraAdmissoes();
  const users = await prisma.user.findMany({
    where: {
      OR: [{ photoUrl: { not: null } }, { signatureUrl: { not: null } }],
    },
    select: { id: true, lodgeId: true, photoUrl: true, signatureUrl: true },
  });
  const tot = { migrado: 0, "ja-migrado": 0, vazio: 0, invalido: 0 };
  for (const u of users) {
    tot[await migraCampo(u.id, u.lodgeId, "photo", u.photoUrl)]++;
    tot[await migraCampo(u.id, u.lodgeId, "signature", u.signatureUrl)]++;
  }
  console.log(
    `${simula ? "[SIMULAÇÃO] " : ""}usuários examinados: ${users.length}`
  );
  console.log(
    `campos migrados: ${tot.migrado} · já migrados: ${tot["ja-migrado"]} · ` +
      `vazios: ${tot.vazio} · formato inválido (mantidos): ${tot.invalido}`
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
