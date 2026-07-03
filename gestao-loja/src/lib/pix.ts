// Geração de payload Pix "Copia e Cola" (BR Code / EMV-MPM, padrão Bacen).
// O txid vai no campo 62-05 e é a chave de conciliação do webhook.

function emv(id: string, value: string): string {
  const len = value.length.toString().padStart(2, "0");
  return `${id}${len}${value}`;
}

// CRC16-CCITT (0xFFFF, polinômio 0x1021), exigido pelo campo 63
function crc16(payload: string): string {
  let crc = 0xffff;
  for (const ch of payload) {
    crc ^= ch.charCodeAt(0) << 8;
    for (let i = 0; i < 8; i++) {
      crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}

function sanitize(text: string, max: number): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9 .-]/g, "")
    .slice(0, max)
    .trim();
}

export function buildPixPayload(opts: {
  pixKey: string;
  merchantName: string; // nome da Loja
  merchantCity: string;
  amountCents: number;
  txid: string; // [a-zA-Z0-9]{1,25}
}): string {
  const txid = opts.txid.replace(/[^a-zA-Z0-9]/g, "").slice(0, 25);
  const amount = (opts.amountCents / 100).toFixed(2);

  const payload =
    emv("00", "01") + // Payload Format Indicator
    emv(
      "26",
      emv("00", "br.gov.bcb.pix") + emv("01", opts.pixKey) // Merchant Account
    ) +
    emv("52", "0000") + // Merchant Category Code
    emv("53", "986") + // Moeda BRL
    emv("54", amount) +
    emv("58", "BR") +
    emv("59", sanitize(opts.merchantName, 25) || "LOJA") +
    emv("60", sanitize(opts.merchantCity, 15) || "SAO PAULO") +
    emv("62", emv("05", txid)) +
    "6304"; // CRC placeholder

  return payload + crc16(payload);
}
