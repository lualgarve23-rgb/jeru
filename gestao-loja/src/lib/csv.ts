// Geração de CSV amigável ao Excel brasileiro:
// separador ";" e BOM UTF-8 para acentuação correta.
export function toCsv(headers: string[], rows: (string | number)[][]) {
  const escape = (v: string | number) => {
    const s = String(v);
    return /[";\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
  };
  const lines = [headers, ...rows].map((r) => r.map(escape).join(";"));
  return "﻿" + lines.join("\r\n");
}

export function csvResponse(filename: string, csv: string) {
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}

export function brlCsv(cents: number) {
  return (cents / 100).toFixed(2).replace(".", ",");
}
