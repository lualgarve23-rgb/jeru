// Artes da Loja de Demonstração (convite + Certificado de Visita), geradas em
// SVG e gravadas direto no banco: conviteTemplateHtml/conviteArteLayout e
// certFundoPdf/certLayout. Rode com: npx tsx scripts/seed-artes-demo.ts
import sharp from "sharp";
import { PDFDocument } from "pdf-lib";
import { prisma } from "../src/lib/prisma";
import { templateDeImagem } from "../src/lib/convite";
import { EMU, type CertLayout } from "../src/lib/certificado";

const SERIF = "'Liberation Serif', serif";
const NAVY = "#1e3a5f";
const NAVY2 = "#16304f";
const GOLD = "#c9a84c";
const GOLD2 = "#8a6d1f";
const CREAM = "#faf6ec";
const WINE = "#5a1414";

// Esquadro e compasso com G (desenho próprio, traço dourado)
function esquadroCompasso(cx: number, cy: number, s: number, cor = GOLD, opac = 1) {
  // s = meia-largura
  return `
  <g stroke="${cor}" stroke-opacity="${opac}" fill="none" stroke-width="${s * 0.09}" stroke-linecap="round" stroke-linejoin="round">
    <!-- compasso: vértice no topo, pernas abertas -->
    <circle cx="${cx}" cy="${cy - s * 0.95}" r="${s * 0.13}" fill="${cor}" fill-opacity="${opac}" stroke="none"/>
    <path d="M ${cx - s * 0.62} ${cy + s * 0.72} L ${cx} ${cy - s * 0.95} L ${cx + s * 0.62} ${cy + s * 0.72}"/>
    <!-- esquadro: ângulo aberto para cima -->
    <path d="M ${cx - s * 0.78} ${cy - s * 0.28} L ${cx} ${cy + s * 0.55} L ${cx + s * 0.78} ${cy - s * 0.28}"/>
  </g>
  <text x="${cx}" y="${cy + s * 0.16}" text-anchor="middle" font-family="${SERIF}" font-weight="bold" font-size="${s * 0.62}" fill="${cor}" fill-opacity="${opac}">G</text>`;
}

// Ramo de acácia estilizado (haste + folíolos)
function acacia(cx: number, cy: number, s: number, cor = GOLD2, opac = 1, rot = 0) {
  const folhas = [];
  for (let i = 0; i < 6; i++) {
    const t = i / 5;
    const y = -s * t;
    const w = s * 0.34 * (1 - t * 0.55);
    folhas.push(
      `<ellipse cx="${-w * 0.85}" cy="${y}" rx="${w * 0.62}" ry="${w * 0.26}" transform="rotate(-28 ${-w * 0.85} ${y})"/>`,
      `<ellipse cx="${w * 0.85}" cy="${y}" rx="${w * 0.62}" ry="${w * 0.26}" transform="rotate(28 ${w * 0.85} ${y})"/>`
    );
  }
  return `
  <g transform="translate(${cx} ${cy}) rotate(${rot})" fill="${cor}" fill-opacity="${opac}">
    <rect x="${-s * 0.02}" y="${-s}" width="${s * 0.04}" height="${s}" rx="${s * 0.02}"/>
    ${folhas.join("\n    ")}
    <circle cx="0" cy="${-s * 1.04}" r="${s * 0.05}"/>
  </g>`;
}

// Canto ornamental da moldura
function canto(x: number, y: number, s: number, rot: number) {
  return `
  <g transform="translate(${x} ${y}) rotate(${rot})" stroke="${GOLD}" fill="none" stroke-width="${s * 0.06}">
    <path d="M 0 ${s} L 0 0 L ${s} 0"/>
    <path d="M ${s * 0.18} ${s * 0.78} Q ${s * 0.18} ${s * 0.18} ${s * 0.78} ${s * 0.18}"/>
    <circle cx="${s * 0.34}" cy="${s * 0.34}" r="${s * 0.07}" fill="${GOLD}" stroke="none"/>
  </g>`;
}

// ───────────────────────── CONVITE (1120 × 1500) ─────────────────────────
const W = 1120, H = 1500;
const conviteSvg = `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="fundo" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#fdfaf3"/><stop offset="0.5" stop-color="${CREAM}"/><stop offset="1" stop-color="#f3ecdb"/>
    </linearGradient>
    <linearGradient id="navy" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#274b78"/><stop offset="1" stop-color="${NAVY2}"/>
    </linearGradient>
    <linearGradient id="ouro" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="${GOLD2}"/><stop offset="0.5" stop-color="#e6c96f"/><stop offset="1" stop-color="${GOLD2}"/>
    </linearGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#fundo)"/>

  <!-- faixa superior navy com recorte em V suave -->
  <path d="M 0 0 H ${W} V 300 Q ${W / 2} 385 0 300 Z" fill="url(#navy)"/>
  <path d="M 0 300 Q ${W / 2} 385 ${W} 300" fill="none" stroke="url(#ouro)" stroke-width="5"/>

  <!-- emblema na faixa -->
  ${esquadroCompasso(W / 2, 168, 88, GOLD)}
  ${acacia(W / 2 - 195, 232, 110, GOLD, 0.85, -18)}
  ${acacia(W / 2 + 195, 232, 110, GOLD, 0.85, 18)}
  <text x="${W / 2}" y="54" text-anchor="middle" font-family="${SERIF}" font-size="30" letter-spacing="10" fill="#e6c96f">A∴ G∴ D∴ G∴ A∴ D∴ U∴</text>

  <!-- moldura dupla -->
  <rect x="34" y="34" width="${W - 68}" height="${H - 68}" fill="none" stroke="${GOLD}" stroke-width="3"/>
  <rect x="48" y="48" width="${W - 96}" height="${H - 96}" fill="none" stroke="${GOLD2}" stroke-width="1.4"/>
  ${canto(60, 60, 60, 0)}${canto(W - 60, 60, 60, 90)}${canto(W - 60, H - 60, 60, 180)}${canto(60, H - 60, 60, 270)}

  <!-- identificação da loja -->
  <text x="${W / 2}" y="472" text-anchor="middle" font-family="${SERIF}" font-size="34" letter-spacing="6" fill="${GOLD2}">A∴R∴L∴S∴</text>
  <text x="${W / 2}" y="548" text-anchor="middle" font-family="${SERIF}" font-weight="bold" font-size="64" fill="${NAVY}">ACÁCIA DO ORIENTE</text>
  <text x="${W / 2}" y="606" text-anchor="middle" font-family="${SERIF}" font-size="36" letter-spacing="3" fill="${WINE}">Nº 9999</text>
  <text x="${W / 2}" y="664" text-anchor="middle" font-family="${SERIF}" font-size="27" fill="#4b5563">Federada ao Grande Oriente do Brasil — GOB</text>
  <text x="${W / 2}" y="702" text-anchor="middle" font-family="${SERIF}" font-size="27" fill="#4b5563">Or∴ de São Paulo — SP</text>

  <!-- palavra CONVITE -->
  <g>
    <line x1="240" y1="790" x2="${W / 2 - 160}" y2="790" stroke="url(#ouro)" stroke-width="2.5"/>
    <line x1="${W / 2 + 160}" y1="790" x2="${W - 240}" y2="790" stroke="url(#ouro)" stroke-width="2.5"/>
    <text x="${W / 2}" y="805" text-anchor="middle" font-family="${SERIF}" font-size="44" letter-spacing="16" fill="${GOLD2}">CONVITE</text>
  </g>

  <!-- área central livre para o painel de dados (runtime) -->

  <!-- marca d'água -->
  ${esquadroCompasso(W / 2, 1080, 210, NAVY, 0.05)}

  <!-- rodapé -->
  ${acacia(150, 1385, 92, GOLD2, 0.75, -14)}
  ${acacia(W - 150, 1385, 92, GOLD2, 0.75, 14)}
  <line x1="300" y1="1358" x2="${W - 300}" y2="1358" stroke="url(#ouro)" stroke-width="2"/>
  <text x="${W / 2}" y="1398" text-anchor="middle" font-family="${SERIF}" font-size="24" font-style="italic" fill="#6b7280">“A união dos irmãos é a força da Loja.”</text>
  <text x="${W / 2}" y="1432" text-anchor="middle" font-family="${SERIF}" font-size="20" letter-spacing="4" fill="${GOLD2}">SABEDORIA · FORÇA · BELEZA</text>
</svg>`;


// ─────────────────── CERTIFICADO (A4 retrato, 1240 × 1754 px @150dpi) ───────────────────
const CW = 1240, CH = 1754;
const certSvg = `<svg width="${CW}" height="${CH}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="fundo" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#fdfaf3"/><stop offset="0.55" stop-color="${CREAM}"/><stop offset="1" stop-color="#f2ead8"/>
    </linearGradient>
    <linearGradient id="ouro" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="${GOLD2}"/><stop offset="0.5" stop-color="#e6c96f"/><stop offset="1" stop-color="${GOLD2}"/>
    </linearGradient>
    <linearGradient id="navy" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#274b78"/><stop offset="1" stop-color="${NAVY2}"/>
    </linearGradient>
  </defs>
  <rect width="${CW}" height="${CH}" fill="url(#fundo)"/>

  <!-- faixa superior -->
  <path d="M 0 0 H ${CW} V 240 Q ${CW / 2} 310 0 240 Z" fill="url(#navy)"/>
  <path d="M 0 240 Q ${CW / 2} 310 ${CW} 240" fill="none" stroke="url(#ouro)" stroke-width="5"/>
  ${esquadroCompasso(CW / 2, 142, 74, GOLD)}
  <text x="${CW / 2}" y="46" text-anchor="middle" font-family="${SERIF}" font-size="25" letter-spacing="9" fill="#e6c96f">A∴ G∴ D∴ G∴ A∴ D∴ U∴</text>

  <!-- moldura -->
  <rect x="40" y="40" width="${CW - 80}" height="${CH - 80}" fill="none" stroke="${GOLD}" stroke-width="3.5"/>
  <rect x="56" y="56" width="${CW - 112}" height="${CH - 112}" fill="none" stroke="${GOLD2}" stroke-width="1.5"/>
  ${canto(70, 70, 64, 0)}${canto(CW - 70, 70, 64, 90)}${canto(CW - 70, CH - 70, 64, 180)}${canto(70, CH - 70, 64, 270)}

  <!-- marca d'água -->
  ${esquadroCompasso(CW / 2, 1120, 260, NAVY, 0.035)}

  <!-- loja -->
  <text x="${CW / 2}" y="392" text-anchor="middle" font-family="${SERIF}" font-size="28" letter-spacing="5" fill="${GOLD2}">A∴R∴L∴S∴</text>
  <text x="${CW / 2}" y="456" text-anchor="middle" font-family="${SERIF}" font-weight="bold" font-size="54" fill="${NAVY}">ACÁCIA DO ORIENTE Nº 9999</text>
  <text x="${CW / 2}" y="504" text-anchor="middle" font-family="${SERIF}" font-size="24" fill="#4b5563">Federada ao Grande Oriente do Brasil — GOB · Or∴ de São Paulo — SP</text>

  <!-- título -->
  <text x="${CW / 2}" y="622" text-anchor="middle" font-family="${SERIF}" font-weight="bold" font-size="72" letter-spacing="6" fill="${WINE}">CERTIFICADO DE VISITA</text>
  <line x1="330" y1="662" x2="${CW - 330}" y2="662" stroke="url(#ouro)" stroke-width="3"/>

  <text x="${CW / 2}" y="742" text-anchor="middle" font-family="${SERIF}" font-size="30" fill="#374151">Certificamos que o Val∴ Ir∴</text>
  <!-- ⌂ caixa NOME ~ y 780–860 -->
  <line x1="200" y1="880" x2="${CW - 200}" y2="880" stroke="${GOLD2}" stroke-width="1.6"/>

  <text x="${CW / 2}" y="948" text-anchor="middle" font-family="${SERIF}" font-size="30" fill="#374151">honrou esta Oficina com sua presença na sessão</text>
  <!-- ⌂ caixa SESSAO ~ y 980–1050 -->
  <line x1="260" y1="1068" x2="${CW - 260}" y2="1068" stroke="${GOLD2}" stroke-width="1.6"/>

  ${acacia(300, 1470, 100, GOLD2, 0.75, -12)}
  ${acacia(CW - 300, 1470, 100, GOLD2, 0.75, 12)}

  <!-- assinatura -->
  <line x1="420" y1="1420" x2="${CW - 420}" y2="1420" stroke="#52525b" stroke-width="2"/>
  <!-- ⌂ caixa VENERAVEL ~ y 1345–1408 -->
  <text x="${CW / 2}" y="1462" text-anchor="middle" font-family="${SERIF}" font-size="26" fill="#374151">Venerável Mestre</text>

  <text x="${CW / 2}" y="1590" text-anchor="middle" font-family="${SERIF}" font-size="22" font-style="italic" fill="#6b7280">“Que a acácia floresça no coração de quem nos visita.”</text>
  <text x="${CW / 2}" y="1636" text-anchor="middle" font-family="${SERIF}" font-size="19" letter-spacing="4" fill="${GOLD2}">SABEDORIA · FORÇA · BELEZA</text>
</svg>`;


async function main() {
  const lodge = await prisma.lodge.findFirstOrThrow({
    where: { name: { contains: "Demonstra" } },
  });

  const jpg = await sharp(Buffer.from(conviteSvg))
    .flatten({ background: "#ffffff" })
    .jpeg({ quality: 88 })
    .toBuffer();
  await prisma.lodge.update({
    where: { id: lodge.id },
    data: {
      conviteTemplateHtml: templateDeImagem(
        `data:image/jpeg;base64,${jpg.toString("base64")}`
      ),
      // Painel de dados na área livre entre CONVITE e o rodapé
      conviteArteLayout: { x: 0.06, y: 0.58, w: 0.88 },
    },
  });

  const png = await sharp(Buffer.from(certSvg))
    .flatten({ background: "#ffffff" })
    .png()
    .toBuffer();
  const doc = await PDFDocument.create();
  const img = await doc.embedPng(png);
  const page = doc.addPage([595.28, 841.89]);
  page.drawImage(img, { x: 0, y: 0, width: 595.28, height: 841.89 });
  const fundoPdf = Buffer.from(await doc.save());

  // px da arte (1240×1754) → pt da página A4 → EMU (unidade do certLayout)
  const S = 595.28 / CW;
  const box = (xPx: number, yPx: number, wPx: number, hPx: number, size: number) => ({
    x: Math.round(xPx * S * EMU),
    y: Math.round(yPx * S * EMU),
    cx: Math.round(wPx * S * EMU),
    cy: Math.round(hPx * S * EMU),
    size,
  });
  const layout: CertLayout = {
    nome: box(200, 762, 840, 104, 24),
    sessao: box(230, 962, 780, 92, 17),
    veneravel: box(420, 1342, 400, 66, 13),
    email: box(140, 1688, 700, 30, 6),
  };
  await prisma.lodge.update({
    where: { id: lodge.id },
    data: { certFundoPdf: new Uint8Array(fundoPdf), certLayout: layout },
  });

  console.log(`Artes da loja demo gravadas: ${lodge.name}`);
  await prisma.$disconnect();
}
main();
