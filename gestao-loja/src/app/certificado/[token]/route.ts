import { notFound } from "next/navigation";
import {
  attendanceDoTokenCertificado,
  gerarCertificadoDaPresenca,
} from "@/lib/certificado";

// Download público do Certificado de Visita pelo link assinado enviado ao
// visitante no WhatsApp (Secretário/VM). Token = id da presença + HMAC;
// rota pública em auth.config.ts, com rate limit no middleware.
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  const attendanceId = attendanceDoTokenCertificado(token);
  if (!attendanceId) notFound();
  let pdf: Buffer;
  try {
    ({ pdf } = await gerarCertificadoDaPresenca(attendanceId));
  } catch {
    notFound();
  }
  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": 'inline; filename="certificado-de-visita.pdf"',
      "Cache-Control": "private, no-store",
    },
  });
}
