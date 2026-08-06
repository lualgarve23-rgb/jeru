import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { anexarFormularioCandidatoPublico } from "@/app/(app)/secretaria/actions";
import { FORMULARIOS_INDICACAO } from "@/lib/formularios-candidato";
import { ActionForm } from "@/components/action-form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

// Página pública entregue ao candidato (link com token opaco): baixar os
// formulários de indicação já preenchidos com os dados da Loja e devolver
// os arquivos preenchidos. Sem login — o token é a credencial.
export default async function CandidatoPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  // select explícito: a página pública não precisa (nem deve receber) CPF,
  // telefone, observações do padrinho ou a foto em data URI
  const processo = await prisma.processoAdmissao.findUnique({
    where: { token },
    select: {
      nomeCandidato: true,
      status: true,
      lodge: { select: { name: true, number: true, oriente: true, logoUrl: true } },
      padrinho: { select: { name: true } },
      anexos: {
        orderBy: { createdAt: "desc" },
        select: { id: true, nome: true, createdAt: true },
      },
    },
  });
  if (!processo) notFound();

  const encerrado =
    processo.status === "INICIADO" || processo.status === "REPROVADO";

  return (
    <main className="mx-auto max-w-2xl space-y-6 p-4 py-8">
      <div className="flex items-center gap-3">
        {processo.lodge.logoUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={processo.lodge.logoUrl}
            alt={processo.lodge.name}
            className="h-14 w-14 rounded-full border bg-white object-cover"
          />
        )}
        <div>
          <h1 className="text-xl font-bold">{processo.lodge.name}</h1>
          <p className="text-sm text-muted-foreground">
            Loja nº {processo.lodge.number}
            {processo.lodge.oriente ? ` · Or∴ ${processo.lodge.oriente}` : ""}
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Processo de admissão — {processo.nomeCandidato}</CardTitle>
          <CardDescription>
            {processo.padrinho
              ? `Indicado por ${processo.padrinho.name}. `
              : ""}
            Baixe os formulários abaixo, preencha-os e devolva os arquivos
            nesta mesma página. Este link é pessoal — não o compartilhe.
          </CardDescription>
        </CardHeader>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>1. Baixar os formulários de indicação</CardTitle>
          <CardDescription>
            Os arquivos já saem com o nome da Loja e o seu nome preenchidos.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {FORMULARIOS_INDICACAO.map((f) => (
            <div
              key={f.arquivo}
              className="flex flex-wrap items-center justify-between gap-3 rounded-md border p-3"
            >
              <div className="min-w-0">
                <p className="text-sm font-medium">{f.titulo}</p>
                <p className="text-xs text-muted-foreground">{f.descricao}</p>
              </div>
              <Button asChild variant="outline" size="sm">
                <a
                  href={`/candidato/${token}/formulario?arquivo=${encodeURIComponent(
                    f.arquivo
                  )}`}
                >
                  Baixar
                </a>
              </Button>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>2. Enviar os formulários preenchidos</CardTitle>
          <CardDescription>
            Um arquivo por vez, em PDF, DOC/DOCX, JPG ou PNG (até 15 MB).
            Você pode enviar quantos precisar.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {encerrado ? (
            <p className="text-sm text-muted-foreground">
              Este processo já foi encerrado — o envio de formulários está
              fechado. Procure a Secretaria da Loja em caso de dúvida.
            </p>
          ) : (
            <ActionForm
              action={anexarFormularioCandidatoPublico.bind(null, token)}
              submitLabel="Enviar formulário"
            >
              <div className="space-y-1">
                <Label htmlFor="arquivo">Arquivo preenchido</Label>
                <Input
                  id="arquivo"
                  name="arquivo"
                  type="file"
                  accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
                  required
                />
              </div>
            </ActionForm>
          )}

          {processo.anexos.length > 0 && (
            <div className="space-y-2 border-t pt-4">
              <p className="text-sm font-medium">
                Formulários já recebidos ({processo.anexos.length})
              </p>
              <ul className="space-y-1 text-sm">
                {processo.anexos.map((a) => (
                  <li key={a.id} className="flex flex-wrap items-center gap-2">
                    <Badge variant="success">Recebido</Badge>
                    <span className="min-w-0 break-all">{a.nome}</span>
                    <span className="text-xs text-muted-foreground">
                      {a.createdAt.toLocaleDateString("pt-BR")}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
