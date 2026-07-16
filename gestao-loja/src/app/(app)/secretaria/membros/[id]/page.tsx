import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import {
  updateMember,
  elevateDegree,
  assignRole,
  setAccessRole,
} from "../../actions";
import { cargoCorresponde } from "@/lib/cargos";
import { ActionForm } from "@/components/action-form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { degreeLabels, roleLabels } from "@/lib/labels";
import { HistoricoGraus, HistoricoCargos } from "./historico-editor";
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

  const cargosRito = await prisma.cargoRito.findMany({
    where: { lodgeId: user.lodgeId },
    orderBy: { nome: "asc" },
  });

  const nextDegree =
    member.degree === "APRENDIZ"
      ? "COMPANHEIRO"
      : member.degree === "COMPANHEIRO"
        ? "MESTRE"
        : null;

  const updateAction = updateMember.bind(null, member.id);
  const elevateAction = elevateDegree.bind(null, member.id);
  const roleAction = assignRole.bind(null, member.id);
  const accessAction = setAccessRole.bind(null, member.id);

  return (
    <div className="max-w-3xl space-y-6">
      <h1 className="flex items-center gap-3 text-2xl font-bold">
        {member.photoUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={member.photoUrl}
            alt={`Foto de ${member.name}`}
            className="h-14 w-14 rounded-full border object-cover"
          />
        )}
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
            {(["VENERAVEL_MESTRE", "SECRETARIO"].includes(member.currentRole) ||
              cargoCorresponde(member.cargoRito, "Orador")) && (
              <div className="space-y-2">
                <Label htmlFor="signature">
                  Imagem da assinatura (
                  {["VENERAVEL_MESTRE", "SECRETARIO"].includes(member.currentRole)
                    ? roleLabels[member.currentRole]
                    : member.cargoRito}
                  )
                </Label>
                {member.signatureUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={member.signatureUrl}
                    alt={`Assinatura de ${member.name}`}
                    className="h-16 rounded-md border bg-white object-contain p-1"
                  />
                )}
                <Input
                  id="signature"
                  name="signature"
                  type="file"
                  accept="image/*"
                />
                <p className="text-xs text-muted-foreground">
                  Usada como assinatura visual nas atas e documentos da Loja
                  (imagem de até 500 KB, fundo branco ou transparente).
                </p>
              </div>
            )}
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
          <CardTitle>Nível de acesso ao sistema</CardTitle>
        </CardHeader>
        <CardContent>
          <ActionForm action={accessAction} submitLabel="Salvar acesso">
            <div className="space-y-1">
              <Label htmlFor="accessRole">Perfil de acesso</Label>
              <select
                id="accessRole"
                name="accessRole"
                defaultValue={member.currentRole}
                className="h-9 w-full rounded-md border bg-transparent px-2 text-sm"
              >
                <option value="MEMBER">Obreiro (padrão)</option>
                <option value="VENERAVEL_MESTRE">Venerável Mestre</option>
                <option value="SECRETARIO">Secretário</option>
                <option value="TESOUREIRO">Tesoureiro</option>
                <option value="CONSELHO_CONTAS">
                  Conselho de Contas (somente leitura)
                </option>
                <option value="ESMOLER">
                  Esmoler / Hospitaleiro (alertas de bem-estar)
                </option>
              </select>
              <p className="text-xs text-muted-foreground">
                Define as permissões no sistema (Secretaria, Tesouraria,
                alertas), independentemente do cargo ritualístico abaixo.
              </p>
            </div>
          </ActionForm>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Nomear para cargo do rito</CardTitle>
        </CardHeader>
        <CardContent>
          <ActionForm action={roleAction} submitLabel="Registrar cargo">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label htmlFor="role">Cargo</Label>
                <select
                  id="role"
                  name="role"
                  defaultValue={
                    member.cargoRito ? `rito:${member.cargoRito}` : "MEMBER"
                  }
                  className="h-9 w-full rounded-md border bg-transparent px-2 text-sm"
                >
                  <option value="MEMBER">Sem cargo</option>
                  {cargosRito.map((c) => (
                    <option key={c.id} value={`rito:${c.nome}`}>
                      {c.nome}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-muted-foreground">
                  Cargos do rito não alteram o nível de acesso ao sistema.{" "}
                  <a href="/secretaria/cargos" className="underline">
                    Gerenciar cargos do rito
                  </a>
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
          <HistoricoGraus
            entries={member.degreeHistory.map((d) => ({
              id: d.id,
              degree: d.degree,
              date: d.date.toISOString().slice(0, 10),
            }))}
          />
          <HistoricoCargos
            entries={member.roleHistory.map((r) => ({
              id: r.id,
              role: r.role,
              cargoRito: r.cargoRito,
              startDate: r.startDate.toISOString().slice(0, 10),
              endDate: r.endDate ? r.endDate.toISOString().slice(0, 10) : null,
            }))}
            cargosRito={cargosRito.map((c) => c.nome)}
          />
        </CardContent>
      </Card>
    </div>
  );
}
