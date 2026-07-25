import { requireRole } from "@/lib/session";
import { ImportMetaForm } from "./import-form";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export const dynamic = "force-dynamic";

export default async function ImportarMembrosPage() {
  await requireRole("VENERAVEL_MESTRE", "SECRETARIO");

  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Importar quadro do Meta (GOB)</h1>
        <p className="text-sm text-muted-foreground">
          Traz os obreiros cadastrados no portal METAGOB (meta.gob.org.br) para
          esta loja, casando pelo CIM.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Acesso ao Meta</CardTitle>
          <CardDescription>
            Use o CIM e a senha de um irmão com acesso ao quadro no Meta
            (Secretário ou Venerável). As credenciais servem apenas para esta
            consulta e <strong>não são armazenadas</strong>. Novos membros
            entram com senha provisória igual ao CPF (troca obrigatória no
            primeiro acesso); membros já cadastrados têm nome, grau, status,
            telefone e nascimento atualizados — nível de acesso e cargo de rito
            não mudam.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ImportMetaForm />
        </CardContent>
      </Card>
    </div>
  );
}
