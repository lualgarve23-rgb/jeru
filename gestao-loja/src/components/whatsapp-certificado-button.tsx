import { Button } from "@/components/ui/button";
import {
  linkWhatsAppCertificado,
  mensagemWhatsAppCertificado,
  telefoneWhatsApp,
} from "@/lib/certificado";

// Botão "Enviar por WhatsApp" (só Secretário/VM): abre o WhatsApp no telefone
// cadastrado do visitante com a mensagem e o link assinado do Certificado de
// Visita em PDF. Server component — o link é montado no servidor.
export function WhatsAppCertificadoButton({
  telefone,
  nome,
  loja,
  tipo,
  dataSessao,
  attendanceId,
  size = "sm",
}: {
  telefone: string | null | undefined;
  nome: string;
  loja: string;
  tipo: string;
  dataSessao: string;
  attendanceId: string;
  size?: "sm" | "default";
}) {
  const tel = telefoneWhatsApp(telefone);
  if (!tel) return null;
  const href = linkWhatsAppCertificado(
    tel,
    mensagemWhatsAppCertificado({ nome, loja, tipo, dataSessao, attendanceId })
  );
  return (
    <Button asChild size={size} className="bg-[#25d366] text-white hover:bg-[#1faa52]">
      <a href={href} target="_blank" rel="noopener noreferrer">
        Enviar por WhatsApp
      </a>
    </Button>
  );
}
