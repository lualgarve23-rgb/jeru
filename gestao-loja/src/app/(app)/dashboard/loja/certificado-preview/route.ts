import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { gerarCertificadoVisitaPdf, templateDaLoja } from "@/lib/certificado";

// Preview do Certificado de Visita com dados fictícios, usando o template
// ativo da loja (personalizado ou padrão).
export async function GET() {
  const user = await requireRole("VENERAVEL_MESTRE", "SECRETARIO");
  const veneravel = await prisma.user.findFirst({
    where: { lodgeId: user.lodgeId, currentRole: "VENERAVEL_MESTRE" },
    select: { name: true },
  });
  const pdf = await gerarCertificadoVisitaPdf(
    {
      nome: "Irmão Visitante de Exemplo",
      sessao: "Ordinária realizada em 01/01/2026",
      email: "visitante@exemplo.com",
      veneravel: veneravel?.name,
    },
    await templateDaLoja(user.lodgeId)
  );
  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": 'inline; filename="certificado-preview.pdf"',
    },
  });
}
