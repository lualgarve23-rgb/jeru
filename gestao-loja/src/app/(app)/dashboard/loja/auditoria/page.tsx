import { requireRole } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export const metadata = { title: "Auditoria" };

// Rótulos amigáveis para os slugs gravados por auditar()
const rotulos: Record<string, string> = {
  "membro.criar": "Membro cadastrado",
  "membro.editar": "Membro editado",
  "membro.grau": "Grau registrado",
  "membro.cargo-rito": "Cargo do rito nomeado",
  "membro.nivel-acesso": "Nível de acesso alterado",
  "mensalidade.gerar": "Mensalidades geradas",
  "mensalidade.baixa-manual": "Baixa manual de mensalidade",
  "mensalidade.baixa-pix": "Baixa automática (Pix)",
  "mensalidade.baixa-asaas": "Baixa automática (Asaas)",
  "despesa.aprovar": "Despesa aprovada",
  "despesa.rejeitar": "Despesa rejeitada",
  "despesa.pagar": "Despesa paga",
  "tesouraria.pix-key": "Chave Pix alterada",
  "tesouraria.config-asaas": "Credenciais Asaas alteradas",
  "loja.config-gmail": "E-mail da loja configurado",
  "loja.desconectar-google": "Google Drive desconectado",
  "loja.limite-inadimplencia": "Limite de inadimplência alterado",
  "admin.editar-loja": "Loja editada (admin)",
  "admin.restaurar-backup": "Backup restaurado (admin)",
  "admin.cobranca-licenca": "Cobrança de licença gerada (admin)",
};

function resumoDetalhes(detalhes: unknown): string {
  if (!detalhes || typeof detalhes !== "object") return "";
  return Object.entries(detalhes as Record<string, unknown>)
    .filter(([, v]) => v !== null && v !== undefined && v !== "")
    .map(([k, v]) => `${k}: ${String(v)}`)
    .join(" · ");
}

const dtf = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "America/Sao_Paulo",
  dateStyle: "short",
  timeStyle: "medium",
});

export default async function AuditoriaPage() {
  const user = await requireRole("VENERAVEL_MESTRE", "SECRETARIO");

  const eventos = await prisma.auditEvent.findMany({
    where: { lodgeId: user.lodgeId },
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Auditoria</h1>
        <p className="text-sm text-muted-foreground">
          Trilha de quem alterou o quê: membros, baixas, configurações e
          níveis de acesso. Últimos 200 eventos.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Eventos recentes</CardTitle>
          <CardDescription>
            Registros gravados automaticamente pelas ações sensíveis do
            sistema — não podem ser editados nem removidos pelo painel.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {eventos.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nenhum evento registrado ainda.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="py-2 pr-4 font-medium">Quando</th>
                    <th className="py-2 pr-4 font-medium">Quem</th>
                    <th className="py-2 pr-4 font-medium">Ação</th>
                    <th className="py-2 font-medium">Detalhes</th>
                  </tr>
                </thead>
                <tbody>
                  {eventos.map((e) => (
                    <tr key={e.id} className="border-b last:border-0 align-top">
                      <td className="py-2 pr-4 whitespace-nowrap">
                        {dtf.format(e.createdAt)}
                      </td>
                      <td className="py-2 pr-4">{e.userName}</td>
                      <td className="py-2 pr-4">
                        {rotulos[e.acao] ?? e.acao}
                      </td>
                      <td className="py-2 text-muted-foreground">
                        {resumoDetalhes(e.detalhes)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
