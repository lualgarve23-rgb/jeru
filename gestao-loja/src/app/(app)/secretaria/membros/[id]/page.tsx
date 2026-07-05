import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { updateMember, elevateDegree, assignRole } from "../../actions";
import { ActionForm } from "@/components/action-form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { degreeLabels, roleLabels } from "@/lib/labels";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default async function MembroPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireRole("SECRETARIO", "VENERAVEL_MESTRE");
  const { id } = await params;
  const member = await prisma.user.findUnique({
    where: { id, lodgeId: user.lodgeId },
    include: {
      degreeHistory: { orderBy: { date: "desc" } },
      roleHistory: { orderBy: { startDate: "desc" } },
    },
  });
  if (!member) notFound();

  const nextDegree =
    member.degree === "APRENDIZ"
      ? "COMPANHEIRO"
      : member.degree === "COMPANHEIRO"
        ? "MESTRE"
        : null;

  const updateAction = updateMember.bind(null, member.id);
  const elevateAction = elevateDegree.bind(null, member.id);
  const roleAction = assignRole.bind(null, member.id);

  return (
    <div className="max-w-3xl space-y-6">
      <h1 className="text-2xl font-bold">
        {member.name}{" "}
        <span className="text-base font-normal text-muted-foreground">
          CIM {member.cim} · {degreeLabels[member.degree] ?? member.degree}
        </span>
      </h1>

      <Card>
        <CardHeader>
          <CardTitle>Dados cadastrais</CardTitle>
        </CardHeader>
        <CardContent>
          <ActionForm action={updateAction} submitLabel="Salvar">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label htmlFor="name">Nome</Label>
                <Input id="name" name="name" defaultValue={member.name} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="email">E-mail</Label>
                <Input id="email" name="email" defaultValue={member.email} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="phone">Telefone</Label>
                <Input id="phone" name="phone" defaultValue={member.phone ?? ""} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="profession">Profissão</Label>
                <Input
                  id="profession"
                  name="profession"
                  defaultValue={member.profession ?? ""}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="status">Status</Label>
                <select
                  id="status"
                  name="status"
                  defaultValue={member.status}
                  className="h-9 w-full rounded-md border bg-transparent px-2 text-sm"
                >
                  <option value="ATIVO">Ativo</option>
                  <option value="IRREGULAR">Irregular</option>
                  <option value="LICENCIADO">Licenciado</option>
                  <option value="EX_MEMBRO">Ex-membro</option>
                </select>
              </div>
            </div>
          </ActionForm>
        </CardContent>
      </Card>

      {nextDegree && (
        <Card>
          <CardHeader>
            <CardTitle>
              {nextDegree === "COMPANHEIRO" ? "Elevação" : "Exaltação"} ao grau
              de {degreeLabels[nextDegree] ?? nextDegree}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ActionForm action={elevateAction} submitLabel="Registrar grau">
              <input type="hidden" name="degree" value={nextDegree} />
              <div className="space-y-1">
                <Label htmlFor="date">Data da cerimônia</Label>
                <Input id="date" name="date" type="date" required />
              </div>
              <p className="text-xs text-muted-foreground">
                O sistema valida o interstício mínimo automaticamente.
              </p>
            </ActionForm>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Nomear para cargo</CardTitle>
        </CardHeader>
        <CardContent>
          <ActionForm action={roleAction} submitLabel="Registrar cargo">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label htmlFor="role">Cargo</Label>
                <select
                  id="role"
                  name="role"
                  defaultValue={member.currentRole}
                  className="h-9 w-full rounded-md border bg-transparent px-2 text-sm"
                >
                  <option value="MEMBER">Obreiro</option>
                  <option value="VENERAVEL_MESTRE">Venerável Mestre</option>
                  <option value="SECRETARIO">Secretário</option>
                  <option value="TESOUREIRO">Tesoureiro</option>
                  <option value="CONSELHO_CONTAS">Conselho de Contas</option>
                  <option value="PRIMEIRO_DIACONO">1º Diácono</option>
                  <option value="SEGUNDO_DIACONO">2º Diácono</option>
                  <option value="ORADOR">Orador</option>
                  <option value="GUARDA_INTERNO">Guarda Interno</option>
                  <option value="GUARDA_EXTERNO">Guarda Externo</option>
                  <option value="DIRETOR_CERIMONIAS">Diretor de Cerimônias</option>
                </select>
                <p className="text-xs text-muted-foreground">
                  Diáconos, Orador, Guardas e Dir. de Cerimônias têm o mesmo
                  nível de acesso de um Obreiro.
                </p>
              </div>
              <div className="space-y-1">
                <Label htmlFor="startDate">Início</Label>
                <Input id="startDate" name="startDate" type="date" required />
              </div>
            </div>
          </ActionForm>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Histórico</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-6 text-sm sm:grid-cols-2">
          <div>
            <p className="mb-2 font-semibold">Graus</p>
            <ul className="space-y-1">
              {member.degreeHistory.map((d) => (
                <li key={d.id}>
                  {degreeLabels[d.degree] ?? d.degree} —{" "}
                  {d.date.toLocaleDateString("pt-BR")}
                </li>
              ))}
              {member.degreeHistory.length === 0 && (
                <li className="text-muted-foreground">Sem registros.</li>
              )}
            </ul>
          </div>
          <div>
            <p className="mb-2 font-semibold">Cargos</p>
            <ul className="space-y-1">
              {member.roleHistory.map((r) => (
                <li key={r.id}>
                  {roleLabels[r.role] ?? r.role} —{" "}
                  {r.startDate.toLocaleDateString("pt-BR")}
                  {r.endDate
                    ? ` a ${r.endDate.toLocaleDateString("pt-BR")}`
                    : " (atual)"}
                </li>
              ))}
              {member.roleHistory.length === 0 && (
                <li className="text-muted-foreground">Sem registros.</li>
              )}
            </ul>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
