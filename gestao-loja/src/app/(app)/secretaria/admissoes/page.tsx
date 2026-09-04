import { mediaSrc } from "@/lib/media-url";
import { InfoDica } from "@/components/info-dica";
import { AJUDA } from "@/lib/ajuda";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { canWriteSecretaria } from "@/lib/permissions";
import { indicarCandidato } from "../actions";
import { ActionForm } from "@/components/action-form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AdmissaoKanban } from "./kanban-board";
import { appUrl } from "@/lib/utils";
import { CandidatosLista } from "./candidatos-lista";

export default async function AdmissoesPage() {
  // Qualquer irmão pode indicar (apadrinhar). Dados sensíveis do candidato
  // (e-mail, telefone, link/token, anexos, observações) só para Secretaria/VM
  // ou o padrinho daquele processo.
  const user = await requireUser();
  const isWriter = canWriteSecretaria(user.role);
  const processos = await prisma.processoAdmissao.findMany({
    where: { lodgeId: user.lodgeId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      nomeCandidato: true,
      status: true,
      certidoesValidas: true,
      email: true,
      phone: true,
      fotoUrl: true,
      token: true,
      createdAt: true,
      observacoes: true,
      padrinhoId: true,
      padrinho: { select: { name: true } },
      anexos: {
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          nome: true,
          sizeBytes: true,
          enviadoPor: true,
          createdAt: true,
        },
      },
    },
  });
  const baseUrl = appUrl();
  // Secretaria pode cadastrar o candidato em nome do padrinho (irmão do quadro)
  const irmaos = isWriter
    ? await prisma.user.findMany({
        where: { lodgeId: user.lodgeId, status: "ATIVO", currentRole: { not: "SUPER_ADMIN" } },
        orderBy: { name: "asc" },
        select: { id: true, name: true, cim: true },
      })
    : [];

  const listaDetalhada = processos
    .filter((p) => isWriter || p.padrinhoId === user.id)
    .map((p) => ({
      id: p.id,
      nomeCandidato: p.nomeCandidato,
      status: p.status,
      email: p.email,
      phone: p.phone,
      observacoes: p.observacoes,
      createdAt: p.createdAt,
      anexos: p.anexos,
      padrinhoNome: p.padrinho?.name ?? null,
      linkCandidato: `${baseUrl}/candidato/${p.token}`,
      souPadrinho: p.padrinhoId === user.id,
    }));

  // Kanban: demais irmãos veem só nome/status (sem e-mail/foto/PII)
  const kanbanProcessos = processos.map((p) => {
    const podeVerPii = isWriter || p.padrinhoId === user.id;
    return {
      id: p.id,
      nomeCandidato: p.nomeCandidato,
      status: p.status,
      certidoesValidas: p.certidoesValidas,
      email: podeVerPii ? p.email : null,
      fotoUrl: podeVerPii ? mediaSrc(p.fotoUrl) : null,
    };
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-1 text-2xl font-bold">
          Candidatos e Admissões
          <InfoDica titulo="Pipeline de Admissão" texto={AJUDA.admissoes} />
        </h1>
        <p className="text-sm text-muted-foreground">
          Qualquer irmão pode indicar (apadrinhar) um candidato. Contato, link
          dos formulários e anexos ficam visíveis só para a Secretaria e o
          padrinho. O pipeline é conduzido pela Secretaria.
        </p>
      </div>

      <Card className="max-w-xl">
        <CardHeader>
          <CardTitle>Indicar candidato</CardTitle>
          <CardDescription>
            Abra o cadastro inicial do seu indicado. Em seguida o sistema gera
            um link para ele baixar os formulários de indicação e devolvê-los
            preenchidos — enviado por e-mail, se você informar o endereço.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ActionForm action={indicarCandidato} submitLabel="Cadastrar candidato">
            <div className="space-y-1">
              <Label htmlFor="nomeCandidato">Nome do candidato</Label>
              <Input id="nomeCandidato" name="nomeCandidato" required />
            </div>
            {isWriter && (
              <div className="space-y-1">
                <Label htmlFor="padrinhoId">Padrinho</Label>
                <select
                  id="padrinhoId"
                  name="padrinhoId"
                  defaultValue={user.id}
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                >
                  {irmaos.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name} (CIM {m.cim}){m.id === user.id ? " — eu mesmo" : ""}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-muted-foreground">
                  Ao cadastrar em nome de outro irmão, ele passa a ser o padrinho
                  do processo (vê o candidato, anexa formulários e é avisado).
                </p>
              </div>
            )}
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label htmlFor="cpf">CPF</Label>
                <Input id="cpf" name="cpf" />
              </div>
              <div className="space-y-1">
                <Label htmlFor="phone">Telefone</Label>
                <Input id="phone" name="phone" />
              </div>
            </div>
            <div className="space-y-1">
              <Label htmlFor="email">E-mail</Label>
              <Input id="email" name="email" type="email" />
              <p className="text-xs text-muted-foreground">
                Informando o e-mail, o link dos formulários é enviado
                automaticamente ao candidato.
              </p>
            </div>
            <div className="space-y-1">
              <Label htmlFor="observacoes">Observações do padrinho</Label>
              <textarea
                id="observacoes"
                name="observacoes"
                rows={2}
                className="w-full rounded-md border bg-transparent p-2 text-sm"
                placeholder="como conhece o candidato, tempo de convivência, etc."
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="foto">Foto do candidato</Label>
              <Input id="foto" name="foto" type="file" accept="image/*" />
              <p className="text-xs text-muted-foreground">
                Opcional — imagem de até 500 KB, exibida no card do pipeline.
              </p>
            </div>
          </ActionForm>
        </CardContent>
      </Card>

      {(isWriter || listaDetalhada.length > 0) && (
        <CandidatosLista processos={listaDetalhada} isWriter={isWriter} />
      )}

      <div>
        <h2 className="mb-2 text-lg font-semibold">Pipeline de Admissão</h2>
        <p className="mb-3 text-sm text-muted-foreground">
          {isWriter
            ? "Arraste os cards entre as etapas do processo de iniciação."
            : "Acompanhamento das etapas — a movimentação é feita pela Secretaria."}
        </p>
        <AdmissaoKanban processos={kanbanProcessos} readOnly={!isWriter} />
      </div>
    </div>
  );
}
