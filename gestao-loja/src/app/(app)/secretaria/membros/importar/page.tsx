import { requireRole } from "@/lib/session";
import { ImportMetaForm } from "./import-form";
import { ImportPlanilhaForm } from "./planilha-form";
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
            Use o CPF e a senha de um irmão com acesso ao quadro no Meta
            (Secretário ou Venerável). As credenciais servem apenas para esta
            consulta e <strong>não são armazenadas</strong>. Novos membros
            recebem uma senha inicial aleatória — por e-mail quando possível,
            senão exibida no relatório da importação (troca obrigatória no
            primeiro acesso); membros já cadastrados têm a ficha atualizada
            (nome, grau, status, telefone, nascimento, endereço, profissão,
            RG, filiação, naturalidade, estado civil, cônjuge, tipo sanguíneo,
            foto e datas de iniciação/elevação/exaltação/instalação). Todos os
            dependentes do Meta (cônjuge, filhos e demais) entram no quadro
            Família da ficha, e a linha do tempo, cargos por período,
            lojas do quadro e títulos aparecem na ficha do membro como
            &quot;Registros do Meta&quot; — nível de acesso e cargo de rito não
            mudam.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ImportMetaForm />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Outras potências (GLESP, COMAB…) — planilha</CardTitle>
          <CardDescription>
            Lojas de potências sem portal integrado importam o quadro por
            planilha CSV.{" "}
            {/* download de arquivo servido por route handler — <a> é o correto aqui */}
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
            <a
              href="/secretaria/membros/importar/modelo"
              className="font-medium text-primary hover:underline"
            >
              Baixe o modelo
            </a>
            , preencha no Excel (uma linha por obreiro) e envie abaixo. Casa
            pelo CIM: existente tem a ficha atualizada; novo entra com senha
            provisória igual ao CPF (troca obrigatória no primeiro acesso).
            Grau: APRENDIZ, COMPANHEIRO ou MESTRE · status: ATIVO, IRREGULAR,
            LICENCIADO ou EX-MEMBRO · filiado: sim/não (obreiro filiado não
            recolhe mensalidade) · data de iniciação: dd/mm/aaaa.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ImportPlanilhaForm />
        </CardContent>
      </Card>
    </div>
  );
}
