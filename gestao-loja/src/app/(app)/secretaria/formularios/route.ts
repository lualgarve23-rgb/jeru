import { requireRole } from "@/lib/session";
import {
  CAMPOS_POR_FORMULARIO,
  gerarFormularioPreenchido,
} from "@/lib/formularios-fill";

// Download de formulário oficial do GOB-SP preenchido automaticamente com os
// dados da Loja, cargos atuais e entradas informadas no diálogo.
// GET /secretaria/formularios?arquivo=...&obreiroId=...&dataSessao=...&candidato=...
export async function GET(request: Request) {
  const user = await requireRole("SECRETARIO", "VENERAVEL_MESTRE");
  const params = new URL(request.url).searchParams;
  const arquivo = params.get("arquivo") ?? "";

  if (!(arquivo in CAMPOS_POR_FORMULARIO)) {
    return new Response("Formulário sem preenchimento automático.", {
      status: 404,
    });
  }

  const docx = await gerarFormularioPreenchido(arquivo, user.lodgeId, {
    obreiroId: params.get("obreiroId") || undefined,
    dataSessao: params.get("dataSessao") || undefined,
    candidato: params.get("candidato") || undefined,
  });

  return new Response(new Uint8Array(docx), {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": `attachment; filename="preenchido-${arquivo}"`,
    },
  });
}
