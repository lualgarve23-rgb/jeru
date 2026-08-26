// Inspeção leve de assinaturas PAdES (gov.br/ITI) em PDFs, sem dependências.
// Cada assinatura é um dicionário com /ByteRange e /Contents <hex> contendo o
// CMS (PKCS#7) DER; os nomes dos certificados ficam em atributos CN
// (OID 2.5.4.3). O gov.br usa o nome civil completo como CN, o que permite
// conferir se o remetente realmente assinou o arquivo que está subindo.

export type AssinaturasPdf = {
  quantidade: number;
  nomes: string[]; // CNs encontrados (assinantes + emissores das cadeias)
};

// Extrai os blobs /Contents das assinaturas e os CNs dos certificados.
export function extrairAssinaturasPdf(pdf: Buffer): AssinaturasPdf {
  const s = pdf.toString("latin1");
  const nomes = new Set<string>();
  let quantidade = 0;
  // /ByteRange e /Contents podem vir em qualquer ordem dentro do dicionário
  const padroes = [
    /\/ByteRange\s*\[[^\]]*\][^>]*?\/Contents\s*<([0-9A-Fa-f]+)>/g,
    /\/Contents\s*<([0-9A-Fa-f]+)>[^>]*?\/ByteRange\s*\[[^\]]*\]/g,
  ];
  const vistos = new Set<string>();
  for (const re of padroes) {
    for (let m; (m = re.exec(s)); ) {
      const hex = m[1];
      if (vistos.has(hex)) continue;
      vistos.add(hex);
      quantidade++;
      const der = Buffer.from(hex, "hex");
      for (const nome of cnsDoDer(der)) nomes.add(nome);
    }
  }
  return { quantidade, nomes: [...nomes] };
}

// Varre o DER atrás do OID 2.5.4.3 (CN) seguido de uma string.
function cnsDoDer(der: Buffer): string[] {
  const nomes: string[] = [];
  for (let i = 0; i < der.length - 3; i++) {
    if (der[i] !== 0x55 || der[i + 1] !== 0x04 || der[i + 2] !== 0x03) continue;
    let j = i + 3;
    const tag = der[j]; // UTF8String, PrintableString ou TeletexString
    if (tag !== 0x0c && tag !== 0x13 && tag !== 0x14) continue;
    let len = der[j + 1];
    let off = j + 2;
    if (len & 0x80) {
      const n = len & 0x7f;
      if (n > 2) continue;
      len = 0;
      for (let k = 0; k < n; k++) len = len * 256 + der[off + k];
      off += n;
    }
    if (off + len > der.length) continue;
    const valor = der.subarray(off, off + len).toString("utf8");
    if (/^[\p{L}0-9' .-]{2,120}$/u.test(valor)) nomes.push(valor);
  }
  return nomes;
}

export function normalizarNome(nome: string): string {
  return nome
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

// Valida o upload de um PDF assinado no gov.br contra a versão anterior do
// documento e o nome do remetente. Retorna uma mensagem de erro ou null.
export function validarUploadAssinado(opts: {
  pdf: Buffer;
  anterior: Buffer | null; // versão já armazenada (com as assinaturas prévias)
  nomeAssinante: string;
}): string | null {
  const { pdf, anterior, nomeAssinante } = opts;
  // Assinaturas PAdES são atualizações incrementais: o documento anterior
  // precisa ser prefixo byte a byte do novo — garante que é o MESMO documento
  // e que as assinaturas já colhidas foram preservadas.
  if (anterior && anterior.length > 0) {
    if (
      pdf.length <= anterior.length ||
      !pdf.subarray(0, anterior.length).equals(anterior)
    ) {
      return (
        "O arquivo enviado não é a continuação do documento atual — baixe o " +
        "PDF na versão mais recente aqui do sistema, assine ESSE arquivo no " +
        "gov.br e suba o resultado, sem reaproveitar PDFs antigos."
      );
    }
  }
  const antes = anterior ? extrairAssinaturasPdf(anterior).quantidade : 0;
  const agora = extrairAssinaturasPdf(pdf);
  if (agora.quantidade <= antes) {
    return (
      "O arquivo enviado não traz uma assinatura nova — assine o PDF no " +
      "portal do gov.br antes de subir."
    );
  }
  const esperado = normalizarNome(nomeAssinante);
  const temDoAssinante = agora.nomes.some(
    (n) => normalizarNome(n) === esperado
  );
  if (!temDoAssinante) {
    return (
      `Não encontramos a sua assinatura gov.br (${nomeAssinante}) no PDF ` +
      "enviado — confira se assinou com a sua própria conta e se subiu o " +
      "arquivo certo."
    );
  }
  return null;
}
