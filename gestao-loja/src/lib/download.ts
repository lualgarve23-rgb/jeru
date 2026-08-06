// Respostas de download de binários guardados no banco — mesmo formato em
// todas as rotas (anexos de candidato, Form. 122, formulários preenchidos).

export function attachmentResponse(
  data: Buffer | Uint8Array,
  filename: string,
  mimeType?: string | null
) {
  return new Response(new Uint8Array(data), {
    headers: {
      "Content-Type": mimeType || "application/octet-stream",
      "Content-Disposition": `attachment; filename="${filename.replace(/"/g, "")}"`,
    },
  });
}

export const DOCX_MIME =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
