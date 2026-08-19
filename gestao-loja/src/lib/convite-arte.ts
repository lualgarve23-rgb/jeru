import sharp from "sharp";
import type { LodgeSession } from "@prisma/client";
import { sessionTypeLabels, degreeLabels } from "@/lib/labels";

// Compõe a arte do convite (upload JPG/PNG da loja) com os dados da sessão
// desenhados numa faixa em degradê na parte inferior da imagem, para que as
// informações fiquem DENTRO do template — no e-mail e na página /convite.

function escXml(s: string) {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function truncar(s: string, max: number) {
  const limpo = s.replace(/\s+/g, " ").trim();
  return limpo.length > max ? `${limpo.slice(0, max - 1)}…` : limpo;
}

// Quebra o texto em até `maxLinhas` linhas de no máximo `maxChars` caracteres,
// sem partir palavras; a última linha é truncada com reticências se preciso
function quebrarLinhas(s: string, maxChars: number, maxLinhas: number) {
  const palavras = s.replace(/\s+/g, " ").trim().split(" ");
  const linhas: string[] = [];
  let atual = "";
  for (let i = 0; i < palavras.length; i++) {
    const tentativa = atual ? `${atual} ${palavras[i]}` : palavras[i];
    if (tentativa.length <= maxChars) {
      atual = tentativa;
      continue;
    }
    if (atual) linhas.push(atual);
    if (linhas.length === maxLinhas - 1) {
      linhas.push(truncar(palavras.slice(i).join(" "), maxChars));
      return linhas;
    }
    atual = palavras[i];
  }
  if (atual) linhas.push(atual);
  return linhas;
}

export async function arteComDados(
  arteDataUri: string,
  session: Pick<LodgeSession, "date" | "type" | "degree" | "pauta">
): Promise<string> {
  const buf = Buffer.from(arteDataUri.split(",")[1], "base64");
  const img = sharp(buf);
  const { width = 1120 } = await img.metadata();

  const tipo = sessionTypeLabels[session.type] ?? session.type;
  const grau = degreeLabels[session.degree] ?? session.degree;
  const data = session.date.toLocaleDateString("pt-BR", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
  const hora = session.date.toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  });
  // Pauta em até 2 linhas, quebradas por palavra, para caber no painel
  const linhasPauta = session.pauta ? quebrarLinhas(session.pauta, 56, 2) : [];

  // Painel central translúcido, com medidas proporcionais à largura da arte
  // (referência: 1120px) — legível sobre artes claras ou escuras
  const f = width / 1120;
  const panelW = Math.round(width * 0.88);
  const panelH = Math.round((200 + linhasPauta.length * 52) * f);
  const px = Math.round((width - panelW) / 2);
  const yTipo = Math.round(74 * f);
  const yData = Math.round(140 * f);
  const yPauta = Math.round(202 * f);
  const pautaSvg = linhasPauta
    .map(
      (linha, i) =>
        `<text x="50%" y="${yPauta + Math.round(i * 44 * f)}" text-anchor="middle" font-family="Georgia, 'Times New Roman', serif" font-size="${Math.round(29 * f)}" fill="#3f3f46">${escXml(linha)}</text>`
    )
    .join("\n  ");
  const svg = `<svg width="${width}" height="${panelH}" xmlns="http://www.w3.org/2000/svg">
  <rect x="${px}" y="${Math.round(6 * f)}" width="${panelW}" height="${panelH - Math.round(12 * f)}" rx="${Math.round(14 * f)}" fill="#fffdf7" fill-opacity="0.88" stroke="#c9a84c" stroke-width="${Math.max(2, Math.round(3 * f))}"/>
  <text x="50%" y="${yTipo}" text-anchor="middle" font-family="Georgia, 'Times New Roman', serif" font-size="${Math.round(30 * f)}" letter-spacing="${3 * f}" fill="#8a6d1f">${escXml(`${tipo} · Grau ${grau}`.toUpperCase())}</text>
  <text x="50%" y="${yData}" text-anchor="middle" font-family="Georgia, 'Times New Roman', serif" font-size="${Math.round(38 * f)}" font-weight="bold" fill="#1e3a5f">${escXml(`${data}, às ${hora}`)}</text>
  ${pautaSvg}
</svg>`;

  const out = await img
    .composite([{ input: Buffer.from(svg), gravity: "centre" }])
    .jpeg({ quality: 82 })
    .toBuffer();
  return `data:image/jpeg;base64,${out.toString("base64")}`;
}
