// Backfill do textoExtraido da Biblioteca Digital (Fase 3 do Assistente IA).
// Extrai o texto (pdftotext / utf8) dos itens que ainda não têm e grava.
//
//   npx tsx --env-file=.env scripts/backfill-biblioteca-texto.ts

import { prisma } from "@/lib/prisma";
import { extraiTexto } from "@/lib/extrai-texto";

async function main() {
  const pendentes = await prisma.bibliotecaItem.findMany({
    where: { textoExtraido: null },
    select: { id: true, titulo: true, mimeType: true },
  });
  console.log(`${pendentes.length} item(ns) sem texto extraído.`);
  for (const p of pendentes) {
    const item = await prisma.bibliotecaItem.findUnique({
      where: { id: p.id },
      select: { arquivo: true },
    });
    if (!item) continue;
    const texto = await extraiTexto(Buffer.from(item.arquivo), p.mimeType);
    if (texto) {
      await prisma.bibliotecaItem.update({
        where: { id: p.id },
        data: { textoExtraido: texto },
      });
      console.log(`OK  ${p.titulo} (${texto.length} chars)`);
    } else {
      console.log(`--  ${p.titulo}: formato ${p.mimeType} sem extração`);
    }
  }
}

main().finally(() => prisma.$disconnect());
